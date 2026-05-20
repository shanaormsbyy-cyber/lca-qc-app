# Slack Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send Slack notifications to cleaners (DM on check completion and disciplinary warnings) and management (channel alerts on below-threshold scores) from the LCA QC App.

**Architecture:** A new `backend/services/slack.js` module exports four fire-and-forget async functions. These are called from `qc.js` (after check completion) and `warnings.js` (after warning creation). Settings are stored in the existing `settings` table and editable via the Settings UI. A `slack_email` column on `staff` enables DM lookup by email.

**Tech Stack:** Node.js fetch API (no extra packages), Slack Incoming Webhooks, Slack Web API (users.lookupByEmail + chat.postMessage), React JSX, existing CSS classes.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/server.js` | Modify | Add `slack_email` auto-migration + default settings |
| `backend/db.js` | Modify | Add default slack settings keys |
| `backend/services/slack.js` | Create | All Slack notification logic |
| `backend/routes/qc.js` | Modify | Trigger `notifyCheckComplete` + `notifyBelowThreshold` after check complete |
| `backend/routes/warnings.js` | Modify | Trigger `notifyDisciplinary` after warning created |
| `backend/routes/staff.js` | Modify | Accept `slack_email` in `PUT /:id` |
| `frontend/src/pages/Settings.jsx` | Modify | Add Slack Integration settings card |
| `frontend/src/pages/StaffProfile.jsx` | Modify | Add Slack Email field with inline save |

---

## Task 1: DB migration + default settings

**Files:**
- Modify: `lca-qc-app/backend/server.js`
- Modify: `lca-qc-app/backend/db.js`

- [ ] **Step 1: Add slack_email migration to server.js**

Read `backend/server.js`. Find the voice_transcript migration block (starts with `// Auto-migrate: voice_transcript column`). Add a new migration block DIRECTLY AFTER its closing `}`:

```js
// Auto-migrate: slack_email column on staff
{
  const s = db.prepare('PRAGMA table_info(staff)');
  const cols = s.all();
  s.finalize();
  if (!cols.find(c => c.name === 'slack_email')) {
    db.exec('ALTER TABLE staff ADD COLUMN slack_email TEXT');
    console.log('Migration complete: added slack_email column to staff.');
  }
}
```

- [ ] **Step 2: Add default settings to db.js**

Read `backend/db.js`. Find the block of `insertSetting.run(...)` calls. Add these lines at the end of that block (before `module.exports = db`):

```js
insertSetting.run('slack_webhook_url', '');
insertSetting.run('slack_bot_token', '');
insertSetting.run('slack_notify_check_complete', 'true');
insertSetting.run('slack_notify_below_threshold', 'true');
insertSetting.run('portal_base_url', '');
```

- [ ] **Step 3: Verify**

```bash
node -e "require('./backend/db.js'); console.log('db ok')"
```

Expected: `db ok`

- [ ] **Step 4: Commit**

```bash
git add backend/server.js backend/db.js
git commit -m "feat: add slack_email migration and default slack settings"
```

---

## Task 2: Slack service module

**Files:**
- Create: `lca-qc-app/backend/services/slack.js`

- [ ] **Step 1: Create the directory if needed**

```bash
mkdir -p backend/services
```

- [ ] **Step 2: Create `backend/services/slack.js`**

```js
const db = require('../db');

function getSlackConfig() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return {
    webhookUrl: s.slack_webhook_url || process.env.SLACK_WEBHOOK_URL || '',
    botToken:   s.slack_bot_token   || process.env.SLACK_BOT_TOKEN   || '',
    portalUrl:  (s.portal_base_url  || '').replace(/\/$/, ''),
    notifyCheckComplete:  s.slack_notify_check_complete  !== 'false',
    notifyBelowThreshold: s.slack_notify_below_threshold !== 'false',
  };
}

async function postToChannel(webhookUrl, text) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}

async function sendDM(botToken, email, text) {
  // Look up user by email
  const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const lookupData = await lookupRes.json();
  if (!lookupData.ok || !lookupData.user?.id) {
    console.error('Slack DM: user not found for email', email, lookupData.error);
    return;
  }
  const userId = lookupData.user.id;

  // Open DM channel
  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openData = await openRes.json();
  if (!openData.ok || !openData.channel?.id) {
    throw new Error(`conversations.open failed: ${openData.error}`);
  }
  const channelId = openData.channel.id;

  // Send message
  const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) throw new Error(`chat.postMessage failed: ${msgData.error}`);
}

async function notifyCheckComplete(checkId) {
  try {
    const cfg = getSlackConfig();
    if (!cfg.notifyCheckComplete || !cfg.botToken) return;

    const check = db.prepare(`
      SELECT qc.staff_id
      FROM qc_checks qc
      WHERE qc.id = ?
    `).get(checkId);
    if (!check?.staff_id) return;

    const staff = db.prepare('SELECT name, slack_email FROM staff WHERE id = ?').get(check.staff_id);
    if (!staff?.slack_email) return;

    const portalLink = cfg.portalUrl ? `${cfg.portalUrl}/portal` : 'the portal';
    await sendDM(cfg.botToken, staff.slack_email,
      `Your QC check has been completed. Please check the portal for more details: ${portalLink}`
    );
  } catch (e) {
    console.error('Slack notifyCheckComplete failed:', e.message);
  }
}

async function notifyBelowThreshold(checkId) {
  try {
    const cfg = getSlackConfig();
    if (!cfg.notifyBelowThreshold || !cfg.webhookUrl) return;

    const check = db.prepare(`
      SELECT qc.staff_id, qc.score_pct, p.name as property_name
      FROM qc_checks qc
      JOIN properties p ON p.id = qc.property_id
      WHERE qc.id = ?
    `).get(checkId);
    if (!check) return;

    const settingsRows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    const threshold = parseFloat(settings.watchlist_threshold || '90');

    const staff = db.prepare('SELECT name FROM staff WHERE id = ?').get(check.staff_id);
    if (!staff) return;

    const score = Math.round(check.score_pct);

    // Single check alert
    if (check.score_pct < threshold) {
      await postToChannel(cfg.webhookUrl,
        `⚠️ QC Alert: ${staff.name} scored ${score}% at ${check.property_name} — below the ${Math.round(threshold)}% target.`
      );
    }

    // Rolling average alert — only fires when average first drops below threshold
    const allChecks = db.prepare(`
      SELECT score_pct FROM qc_checks
      WHERE staff_id = ? AND status = 'complete' AND (check_type = 'staff' OR check_type IS NULL)
      ORDER BY date ASC
    `).all(check.staff_id);

    if (allChecks.length < 2) return;

    const currentAvg = allChecks.reduce((s, c) => s + c.score_pct, 0) / allChecks.length;
    const prevChecks = allChecks.slice(0, -1);
    const prevAvg = prevChecks.reduce((s, c) => s + c.score_pct, 0) / prevChecks.length;

    if (prevAvg >= threshold && currentAvg < threshold) {
      await postToChannel(cfg.webhookUrl,
        `📉 Performance Alert: ${staff.name}'s average score has dropped to ${Math.round(currentAvg)}% — below the ${Math.round(threshold)}% acceptable average.`
      );
    }
  } catch (e) {
    console.error('Slack notifyBelowThreshold failed:', e.message);
  }
}

async function notifyDisciplinary(warningId) {
  try {
    const cfg = getSlackConfig();
    if (!cfg.botToken) return;

    const warning = db.prepare('SELECT staff_id, level FROM warnings WHERE id = ?').get(warningId);
    if (!warning) return;

    const staff = db.prepare('SELECT name, slack_email FROM staff WHERE id = ?').get(warning.staff_id);
    if (!staff?.slack_email) return;

    const levelLabels = {
      verbal_note:     'Verbal Note',
      written_warning: 'Written Warning',
      final_warning:   'Final Warning',
    };
    const levelLabel = levelLabels[warning.level] || warning.level;
    const portalLink = cfg.portalUrl ? `${cfg.portalUrl}/portal` : 'the portal';

    await sendDM(cfg.botToken, staff.slack_email,
      `You have received a ${levelLabel}. Please log in to the portal to view details and acknowledge it: ${portalLink}`
    );
  } catch (e) {
    console.error('Slack notifyDisciplinary failed:', e.message);
  }
}

module.exports = { notifyCheckComplete, notifyBelowThreshold, notifyDisciplinary };
```

- [ ] **Step 3: Verify no syntax errors**

```bash
node -e "require('./backend/services/slack.js'); console.log('slack service ok')"
```

Expected: `slack service ok`

- [ ] **Step 4: Commit**

```bash
git add backend/services/slack.js
git commit -m "feat: add Slack notification service (check complete, below threshold, disciplinary)"
```

---

## Task 3: Wire triggers into qc.js and warnings.js

**Files:**
- Modify: `lca-qc-app/backend/routes/qc.js`
- Modify: `lca-qc-app/backend/routes/warnings.js`

- [ ] **Step 1: Add import to qc.js**

Read `backend/routes/qc.js`. At the very top of the file (after the existing requires), add:

```js
const { notifyCheckComplete, notifyBelowThreshold } = require('../services/slack');
```

- [ ] **Step 2: Trigger notifications in PUT /checks/:id**

Find the section in `PUT /checks/:id` that ends with:
```js
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});
```

Replace with:
```js
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }

  // Fire Slack notifications after successful commit
  if (req.body.status === 'complete') {
    notifyCheckComplete(req.params.id).catch(() => {});
    notifyBelowThreshold(req.params.id).catch(() => {});
  }

  res.json({ ok: true });
});
```

- [ ] **Step 3: Add import to warnings.js**

Read `backend/routes/warnings.js`. At the very top of the file (after the existing requires), add:

```js
const { notifyDisciplinary } = require('../services/slack');
```

- [ ] **Step 4: Trigger notification in POST /**

Find in `warnings.js` the `POST /` route. Find the section that ends with:
```js
    db.exec('COMMIT');
    res.json({ id: warningId });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});
```

Replace with:
```js
    db.exec('COMMIT');
    notifyDisciplinary(warningId).catch(() => {});
    res.json({ id: warningId });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 5: Verify no syntax errors**

```bash
node -e "require('./backend/routes/qc.js'); console.log('qc ok')"
node -e "require('./backend/routes/warnings.js'); console.log('warnings ok')"
```

Expected: `qc ok` then `warnings ok`

- [ ] **Step 6: Commit**

```bash
git add backend/routes/qc.js backend/routes/warnings.js
git commit -m "feat: trigger Slack notifications on check completion and warning creation"
```

---

## Task 4: Update staff PUT route to accept slack_email

**Files:**
- Modify: `lca-qc-app/backend/routes/staff.js`

- [ ] **Step 1: Update PUT /:id**

Read `backend/routes/staff.js`. Find the `PUT /:id` route:

```js
router.put('/:id', (req, res) => {
  const { name, role, start_date, inactive_until } = req.body;
  if (name !== undefined) db.prepare('UPDATE staff SET name=?, role=?, start_date=? WHERE id=?').run(name, role, start_date, req.params.id);
  if (inactive_until !== undefined) db.prepare('UPDATE staff SET inactive_until=? WHERE id=?').run(inactive_until || null, req.params.id);
  res.json({ ok: true });
});
```

Replace with:
```js
router.put('/:id', (req, res) => {
  const { name, role, start_date, inactive_until, slack_email } = req.body;
  if (name !== undefined) db.prepare('UPDATE staff SET name=?, role=?, start_date=? WHERE id=?').run(name, role, start_date, req.params.id);
  if (inactive_until !== undefined) db.prepare('UPDATE staff SET inactive_until=? WHERE id=?').run(inactive_until || null, req.params.id);
  if (slack_email !== undefined) db.prepare('UPDATE staff SET slack_email=? WHERE id=?').run(slack_email || null, req.params.id);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Verify**

```bash
node -e "require('./backend/routes/staff.js'); console.log('staff ok')"
```

Expected: `staff ok`

- [ ] **Step 3: Commit**

```bash
git add backend/routes/staff.js
git commit -m "feat: accept slack_email in PUT /staff/:id"
```

---

## Task 5: Settings UI — Slack Integration card

**Files:**
- Modify: `lca-qc-app/frontend/src/pages/Settings.jsx`

- [ ] **Step 1: Add slack keys to qcSettings state**

Read `frontend/src/pages/Settings.jsx`. Find the `qcSettings` useState object. Add these five keys at the end of the object:

```jsx
slack_webhook_url: '',
slack_bot_token: '',
slack_notify_check_complete: 'true',
slack_notify_below_threshold: 'true',
portal_base_url: '',
```

- [ ] **Step 2: Add Slack Integration card to JSX**

Find the Voice Analysis card that was added previously (starts with `{/* Voice Analysis Settings */}`). Add the new Slack card BEFORE it:

```jsx
      {/* Slack Integration */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Slack Integration</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          Send automatic Slack notifications to cleaners and your management team.
          To set up: create a Slack App at api.slack.com, add an Incoming Webhook for your notifications channel, and add the <code>chat:write</code> and <code>users:lookupByEmail</code> Bot Token Scopes.
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Notifications Channel Webhook URL</label>
          <input
            className="form-input"
            type="text"
            placeholder="https://hooks.slack.com/services/..."
            value={qcSettings.slack_webhook_url}
            onChange={e => setSetting('slack_webhook_url', e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Used for management alerts posted to your #lca-notifications channel</div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Bot Token</label>
          <input
            className="form-input"
            type="password"
            placeholder="xoxb-..."
            value={qcSettings.slack_bot_token}
            onChange={e => setSetting('slack_bot_token', e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Used to send DMs to cleaners — requires chat:write and users:lookupByEmail scopes</div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label">Portal Base URL</label>
          <input
            className="form-input"
            type="text"
            placeholder="https://your-app.up.railway.app"
            value={qcSettings.portal_base_url}
            onChange={e => setSetting('portal_base_url', e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Used to build links in notifications (no trailing slash)</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={qcSettings.slack_notify_check_complete === 'true'}
              onChange={e => setSetting('slack_notify_check_complete', e.target.checked ? 'true' : 'false')}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Notify cleaner on check completion</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Sends a DM to the cleaner when their QC check is signed off</div>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={qcSettings.slack_notify_below_threshold === 'true'}
              onChange={e => setSetting('slack_notify_below_threshold', e.target.checked ? 'true' : 'false')}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Notify management on below-threshold scores</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Posts to your notifications channel when a check is below target, or a cleaner's average drops below the threshold</div>
            </div>
          </label>
        </div>

        <button className="btn btn-primary" onClick={saveQcSettings}>
          {settingsSaved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: add Slack Integration settings card"
```

---

## Task 6: Staff Profile — Slack Email field

**Files:**
- Modify: `lca-qc-app/frontend/src/pages/StaffProfile.jsx`

- [ ] **Step 1: Add slackEmail state**

Read `frontend/src/pages/StaffProfile.jsx`. Find the state declarations (near the top of the component). After the existing state declarations, add:

```jsx
const [slackEmail, setSlackEmail] = useState('');
const [slackEmailSaved, setSlackEmailSaved] = useState(false);
```

- [ ] **Step 2: Populate slackEmail from staff data**

Find the `load` function. It currently calls `api.get('/staff')` and sets staff with `s.data.find(...)`. Change the `.then` handler to also set `slackEmail`:

Find:
```jsx
    ]).then(([s, q, t]) => {
      setStaff(s.data.find(x => x.id === parseInt(id)));
```

Replace with:
```jsx
    ]).then(([s, q, t]) => {
      const found = s.data.find(x => x.id === parseInt(id));
      setStaff(found);
      setSlackEmail(found?.slack_email || '');
```

- [ ] **Step 3: Add save function**

After the `deleteStaff` function, add:

```jsx
const saveSlackEmail = async () => {
  await api.put(`/staff/${id}`, { slack_email: slackEmail });
  setSlackEmailSaved(true);
  setTimeout(() => setSlackEmailSaved(false), 2000);
};
```

- [ ] **Step 4: Add Slack Email field to JSX**

Find the staff header block in the JSX:
```jsx
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{staff.name}</h1>
          <p style={{ color: 'var(--t2)' }}>{staff.role} · Started {staff.start_date}</p>
        </div>
```

Replace with:
```jsx
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{staff.name}</h1>
          <p style={{ color: 'var(--t2)' }}>{staff.role} · Started {staff.start_date}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="email"
              value={slackEmail}
              onChange={e => setSlackEmail(e.target.value)}
              placeholder="Slack email (for notifications)"
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--navy2)',
                color: 'var(--t1)', width: 240,
              }}
            />
            <button
              className="btn btn-sm"
              onClick={saveSlackEmail}
              style={{ fontSize: 12 }}
            >
              {slackEmailSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/StaffProfile.jsx
git commit -m "feat: add Slack email field to staff profile"
```

---

## Task 7: Push to Railway

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

- [ ] **Step 2: Manual verification checklist**

Once Railway redeploys:

1. Go to Settings → Slack Integration card is visible
2. Enter a webhook URL, bot token, portal URL and save — "✓ Saved" confirms
3. Go to a staff profile → Slack email input is visible below name/role
4. Enter a Slack email and save — "✓ Saved" confirms
5. Complete a QC check → Slack DM sent to the cleaner's Slack (if configured)
6. Complete a QC check with a score below threshold → channel alert fires
7. Issue a disciplinary warning → Slack DM sent to cleaner

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `slack_email` column on staff (auto-migration) | Task 1 |
| 5 default settings keys in db.js | Task 1 |
| `backend/services/slack.js` with `getSlackConfig`, `postToChannel`, `sendDM` | Task 2 |
| `notifyCheckComplete` — DM to cleaner on check complete | Task 2 |
| `notifyBelowThreshold` — single check alert + rolling average alert | Task 2 |
| `notifyDisciplinary` — DM to cleaner on warning created | Task 2 |
| DB value takes precedence over env var | Task 2 (`getSlackConfig`) |
| Empty webhookUrl/botToken returns immediately | Task 2 (guard checks) |
| All errors logged, never thrown | Task 2 (try/catch in all functions) |
| `PUT /checks/:id` triggers notifications after commit | Task 3 |
| `POST /warnings` triggers `notifyDisciplinary` | Task 3 |
| `PUT /staff/:id` accepts `slack_email` | Task 4 |
| Settings UI — all 5 fields + 2 toggles | Task 5 |
| Staff profile — inline slack email field with save | Task 6 |
| Portal URL trailing slash stripped | Task 2 (`replace(/\/$/, '')`) |
| Level labels formatted correctly | Task 2 (`notifyDisciplinary`) |
| Rolling average alert only fires when avg first drops below threshold | Task 2 (prevAvg >= threshold AND currentAvg < threshold) |

All spec requirements covered. No placeholders found.
