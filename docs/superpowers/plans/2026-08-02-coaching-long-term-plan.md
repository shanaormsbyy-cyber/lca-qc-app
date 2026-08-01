# Coaching Long Term Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager tick "Long term plan required?" on a coaching session, then define multiple dated checkpoints (each trackable as done/pending with notes) that persist and can be checked off over time, instead of the single `followup_date` field.

**Architecture:** A new `coaching_plan_checkpoints` child table (FK to `coaching_sessions`) plus a `long_term_plan` boolean column on `coaching_sessions`. Backend gets a new checkpoint-toggle route in the existing `backend/routes/coaching.js`, and the existing session GET/POST/PUT routes are extended to read/write checkpoints as a set. Frontend adds a toggle + repeatable checkpoint rows to the existing New/Edit modal in `Coaching.jsx` and to `CoachingSession.jsx`'s edit mode, and a new read-only "Long Term Plan" card to `CoachingSession.jsx`'s detail view with inline per-checkpoint completion toggling.

**Tech Stack:** Node/Express backend with `node-sqlite3-wasm` (better-sqlite3-style wrapper in `backend/db.js`), vanilla SQL (no ORM). React 18 + Vite frontend, `axios` via `frontend/src/api.js`, no component library — inline styles using CSS custom properties (`var(--cyan)`, `var(--ok)`, `var(--amber)`, etc.) and a shared `.card` / `.form-input` / `.btn` class set. No test framework is installed in this repo — verification is done via `node -c` (syntax check), `vite build`, and manual smoke-testing against the running dev server (`npm run dev` from repo root, which runs both backend and frontend concurrently).

## Global Constraints

- SQLite (`node-sqlite3-wasm`) via `backend/db.js` — its `db.prepare(...).run/get/all` wrapper accepts spread args OR a single array; always call with individual args to match existing route code style.
- New table creation follows the `PRAGMA table_info` + `cols.length === 0` block pattern already used for `coaching_sessions` in `backend/server.js` (not the `migrations` array in `backend/db.js`, which is only for single-column `ALTER TABLE ADD COLUMN` on existing tables).
- The single-column addition (`long_term_plan` on `coaching_sessions`) DOES belong in the `migrations` array in `backend/db.js:194-220`, matching how every other single-column addition in this codebase is done.
- All coaching routes require `requireAuth` (already applied via `router.use(requireAuth)` in `backend/routes/coaching.js:6`).
- Every mutating coaching route must call `emit()` from `backend/emitter.js` before responding, so `useLiveSync` on the frontend picks up the change. (The current file does not call this yet for the existing routes — add it everywhere in this plan, including the pre-existing POST/PUT/DELETE, so the whole file is consistent.)
- Design language: pending state uses `var(--amber)` / `rgba(245,158,11,0.12)`; completed/resolved state uses `var(--ok)` / `rgba(34,197,94,0.12)`, matching the existing Open/Resolved status badge styling in `Coaching.jsx` and `CoachingSession.jsx`.
- No new dependencies — everything is achievable with what's already installed (`express`, `node-sqlite3-wasm`, `react`, `axios`).

---

### Task 1: Database schema — `long_term_plan` column and `coaching_plan_checkpoints` table

**Files:**
- Modify: `backend/db.js:194-220` (migrations array)
- Modify: `backend/server.js` (add new auto-migration block after the existing coaching_sessions block)

**Interfaces:**
- Produces: `coaching_sessions.long_term_plan` column (INTEGER 0/1, default 0)
- Produces: `coaching_plan_checkpoints` table with columns `id, coaching_session_id, target_date, notes, completed, completed_note, completed_at, sort_order, created_at`

- [ ] **Step 1: Add the `long_term_plan` column migration**

In `backend/db.js`, add a new line to the `migrations` array (around line 219, right after the existing `staff` migrations):

```js
  "ALTER TABLE coaching_sessions ADD COLUMN long_term_plan INTEGER NOT NULL DEFAULT 0",
```

The full array entry list should end with:

```js
  "ALTER TABLE staff ADD COLUMN archived INTEGER DEFAULT 0",
  "ALTER TABLE staff ADD COLUMN archived_at TEXT DEFAULT NULL",
  "ALTER TABLE coaching_sessions ADD COLUMN long_term_plan INTEGER NOT NULL DEFAULT 0",
];
```

- [ ] **Step 2: Add the `coaching_plan_checkpoints` table auto-migration in server.js**

Find the existing coaching_sessions auto-migration block in `backend/server.js` (it starts with `// Auto-migrate: coaching_sessions table` around line 287 and ends around line 311 with the closing `}`). Immediately after that closing `}`, insert a new block:

```js
// Auto-migrate: coaching_plan_checkpoints table
{
  const s = db.prepare("PRAGMA table_info(coaching_plan_checkpoints)");
  const cols = s.all();
  s.finalize();
  if (cols.length === 0) {
    db.exec(`
      CREATE TABLE coaching_plan_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coaching_session_id INTEGER NOT NULL REFERENCES coaching_sessions(id),
        target_date TEXT NOT NULL,
        notes TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_note TEXT,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    console.log('Migration complete: created coaching_plan_checkpoints table.');
  }
}
```

- [ ] **Step 3: Verify the migrations run cleanly**

Run: `cd backend && node -c server.js && node -c db.js`
Expected: no output (syntax OK).

Then start the backend once to trigger the real migration against the dev DB:

Run (from repo root): `node backend/server.js`
Expected console output includes: `Migration complete: created coaching_plan_checkpoints table.`
Stop the process with Ctrl+C once you see the server has started (e.g. a "listening on port" log line).

- [ ] **Step 4: Confirm schema via sqlite CLI or a one-off script**

Run this one-off check from repo root:

```bash
node -e "const db = require('./backend/db'); const s = db.prepare('PRAGMA table_info(coaching_plan_checkpoints)'); console.log(s.all()); const s2 = db.prepare('PRAGMA table_info(coaching_sessions)'); console.log(s2.all().find(c => c.name === 'long_term_plan'));"
```

Expected: prints the 9-column list for `coaching_plan_checkpoints`, and a column object for `long_term_plan` with `notnull: 1, dflt_value: '0'`.

- [ ] **Step 5: Commit**

```bash
git add backend/db.js backend/server.js
git commit -m "feat: add long_term_plan column and coaching_plan_checkpoints table"
```

---

### Task 2: Backend routes — extend coaching.js for checkpoints

**Files:**
- Modify: `backend/routes/coaching.js` (entire file — rewritten below)

**Interfaces:**
- Consumes: `coaching_plan_checkpoints` table and `coaching_sessions.long_term_plan` column from Task 1
- Consumes: `emit` from `backend/emitter.js` — `emit()` (no args, no return value)
- Produces: `GET /api/coaching/:id` response now includes `long_term_plan` (0/1) and `checkpoints: [{id, target_date, notes, completed, completed_note, completed_at, sort_order}]` (empty array if `long_term_plan` is falsy or no rows)
- Produces: `POST /api/coaching` and `PUT /api/coaching/:id` accept `long_term_plan` (boolean) and `checkpoints` (array of `{target_date, notes}`, only read when `long_term_plan` is truthy)
- Produces: new route `PUT /api/coaching/:id/checkpoints/:checkpointId` — body `{completed: boolean, completed_note?: string}`, response `{ok: true}`

- [ ] **Step 1: Rewrite `backend/routes/coaching.js`**

Replace the full file contents with:

```js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { emit } = require('../emitter');

const router = express.Router();
router.use(requireAuth);

function getCheckpoints(sessionId) {
  return db.prepare(`
    SELECT id, coaching_session_id, target_date, notes, completed, completed_note, completed_at, sort_order
    FROM coaching_plan_checkpoints
    WHERE coaching_session_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(sessionId);
}

function replaceCheckpoints(sessionId, checkpoints) {
  db.prepare('DELETE FROM coaching_plan_checkpoints WHERE coaching_session_id = ?').run(sessionId);
  if (!Array.isArray(checkpoints)) return;
  const ins = db.prepare(`
    INSERT INTO coaching_plan_checkpoints (coaching_session_id, target_date, notes, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  checkpoints.forEach((cp, idx) => {
    if (!cp || !cp.target_date) return;
    ins.run(sessionId, cp.target_date, cp.notes || null, idx);
  });
}

// GET /api/coaching — all sessions, optional ?staff_id=
router.get('/', (req, res) => {
  const { staff_id } = req.query;
  const rows = db.prepare(`
    SELECT cs.*, s.name as staff_name, m.name as manager_name
    FROM coaching_sessions cs
    JOIN staff s ON s.id = cs.staff_id
    JOIN managers m ON m.id = cs.manager_id
    ${staff_id ? 'WHERE cs.staff_id = ?' : ''}
    ORDER BY cs.date DESC, cs.created_at DESC
  `).all(...(staff_id ? [staff_id] : []));
  res.json(rows);
});

// GET /api/coaching/:id — single session
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT cs.*, s.name as staff_name, m.name as manager_name
    FROM coaching_sessions cs
    JOIN staff s ON s.id = cs.staff_id
    JOIN managers m ON m.id = cs.manager_id
    WHERE cs.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  row.checkpoints = row.long_term_plan ? getCheckpoints(row.id) : [];
  res.json(row);
});

// POST /api/coaching — create session
router.post('/', (req, res) => {
  const {
    staff_id, date, topic, how_coached, outcome,
    followup_date, sessions_required, status,
    long_term_plan, checkpoints,
  } = req.body;
  const manager_id = req.manager.id;
  const isPlan = !!long_term_plan;
  const result = db.prepare(`
    INSERT INTO coaching_sessions
      (staff_id, manager_id, date, topic, problem_type, how_coached, outcome, followup_date, sessions_required, status, long_term_plan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    staff_id, manager_id, date, topic, 'didnt',
    how_coached, outcome, isPlan ? null : (followup_date || null),
    sessions_required || 1, status || 'open', isPlan ? 1 : 0
  );
  const sessionId = result.lastInsertRowid;
  if (isPlan) replaceCheckpoints(sessionId, checkpoints);
  emit();
  res.json({ id: sessionId });
});

// PUT /api/coaching/:id — update session
router.put('/:id', (req, res) => {
  const {
    date, topic, how_coached, outcome,
    followup_date, sessions_required, status,
    long_term_plan, checkpoints,
  } = req.body;
  const isPlan = !!long_term_plan;
  db.prepare(`
    UPDATE coaching_sessions
    SET date=?, topic=?, how_coached=?, outcome=?,
        followup_date=?, sessions_required=?, status=?, long_term_plan=?
    WHERE id=?
  `).run(
    date, topic, how_coached, outcome,
    isPlan ? null : (followup_date || null), sessions_required, status, isPlan ? 1 : 0,
    req.params.id
  );
  replaceCheckpoints(req.params.id, isPlan ? checkpoints : []);
  emit();
  res.json({ ok: true });
});

// PUT /api/coaching/:id/checkpoints/:checkpointId — toggle a single checkpoint
router.put('/:id/checkpoints/:checkpointId', (req, res) => {
  const { completed, completed_note } = req.body;
  const isCompleted = !!completed;
  db.prepare(`
    UPDATE coaching_plan_checkpoints
    SET completed = ?, completed_note = ?, completed_at = ?
    WHERE id = ? AND coaching_session_id = ?
  `).run(
    isCompleted ? 1 : 0,
    isCompleted ? (completed_note || null) : null,
    isCompleted ? new Date().toISOString().slice(0, 10) : null,
    req.params.checkpointId, req.params.id
  );
  emit();
  res.json({ ok: true });
});

// DELETE /api/coaching/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM coaching_plan_checkpoints WHERE coaching_session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM coaching_sessions WHERE id=?').run(req.params.id);
  emit();
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Syntax check**

Run: `cd backend && node -c routes/coaching.js`
Expected: no output.

- [ ] **Step 3: Manual smoke test against the running server**

Start the app: from repo root, `npm run dev` (runs backend + frontend concurrently). Wait for both to report ready.

In a second terminal, log in to get a token (adjust credentials to a real manager account in the dev DB — check `backend/seed.js` or ask if unsure which seeded manager login to use), then exercise the new endpoints with curl. Example shape (replace `TOKEN`, `STAFF_ID`):

```bash
curl -s -X POST http://localhost:3001/api/coaching \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"staff_id":STAFF_ID,"date":"2026-08-02","topic":"Test plan","how_coached":"Demo","outcome":"Improved","status":"open","long_term_plan":true,"checkpoints":[{"target_date":"2026-08-09","notes":"Check bathroom presentation"},{"target_date":"2026-08-23","notes":"Follow-up"}]}'
```

Expected: `{"id": <number>}`.

```bash
curl -s http://localhost:3001/api/coaching/<id> -H "Authorization: Bearer TOKEN"
```

Expected: JSON includes `"long_term_plan":1`, `"followup_date":null`, and a `checkpoints` array with 2 entries, `sort_order` 0 and 1, `completed:0`.

```bash
curl -s -X PUT http://localhost:3001/api/coaching/<id>/checkpoints/<checkpointId> \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"completed":true,"completed_note":"Done, improved a lot"}'
```

Expected: `{"ok":true}`. Re-fetch the session and confirm that checkpoint now has `completed:1`, `completed_note:"Done, improved a lot"`, and a `completed_at` date.

Stop the dev server (Ctrl+C) when done, or leave it running if continuing to Task 3/4.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/coaching.js
git commit -m "feat: add long-term plan checkpoints to coaching API"
```

---

### Task 3: Frontend — New/Edit modal in Coaching.jsx

**Files:**
- Modify: `frontend/src/pages/Coaching.jsx`

**Interfaces:**
- Consumes: `POST /api/coaching` and `PUT /api/coaching/:id` from Task 2, now accepting `long_term_plan` (bool) and `checkpoints` (`[{target_date, notes}]`)
- Produces: no new exports; internal form state shape gains `long_term_plan: boolean` and `checkpoints: [{target_date: string, notes: string}]`

- [ ] **Step 1: Extend `EMPTY_FORM`**

In `frontend/src/pages/Coaching.jsx`, update the `EMPTY_FORM` constant (currently lines 36-40):

```js
const EMPTY_FORM = {
  staff_id: '', date: new Date().toISOString().slice(0, 10),
  topic: '', how_coached: '', outcome: '',
  followup_date: '', sessions_required: 1, status: 'open',
  long_term_plan: false, checkpoints: [],
};
```

- [ ] **Step 2: Populate `long_term_plan`/`checkpoints` in `openEdit`**

Update the `openEdit` function (currently lines 76-90) to also copy these fields from the session:

```js
  const openEdit = (session) => {
    setEditingId(session.id);
    setForm({
      staff_id: session.staff_id,
      date: session.date,
      topic: session.topic,
      how_coached: session.how_coached,
      outcome: session.outcome,
      followup_date: session.followup_date || '',
      sessions_required: session.sessions_required,
      status: session.status,
      long_term_plan: !!session.long_term_plan,
      checkpoints: session.long_term_plan
        ? (session.checkpoints || []).map(c => ({ target_date: c.target_date, notes: c.notes || '' }))
        : [],
    });
    setModalPocketOpen(false);
    setShowModal(true);
  };
```

Note: `Coaching.jsx`'s `load()` calls `api.get('/coaching')` which does NOT include `checkpoints` (only the single-session GET does — see Task 2). This means editing from the list view's Edit button won't have checkpoint data available. Handle this by fetching the single session when opening edit — change the Edit button's `onClick` and `openEdit` to be async:

Replace the table row's Edit button (currently around line 194-197):

```jsx
                      <button
                        className="btn btn-sm"
                        onClick={e => { e.stopPropagation(); openEdit(s); }}
                      >Edit</button>
```

with:

```jsx
                      <button
                        className="btn btn-sm"
                        onClick={async e => { e.stopPropagation(); const r = await api.get(`/coaching/${s.id}`); openEdit(r.data); }}
                      >Edit</button>
```

This ensures `openEdit` always receives a full session object (including `checkpoints`) whether it's called from the table or (in Task 4) from the detail page.

- [ ] **Step 3: Add validation for long-term plan checkpoints**

Update `saveSession`'s validation (currently lines 92-96):

```js
  const saveSession = async () => {
    if (!form.staff_id || !form.date || !form.topic || !form.how_coached || !form.outcome) {
      alert('Please fill in all required fields.');
      return;
    }
    if (form.long_term_plan && form.checkpoints.filter(c => c.target_date).length === 0) {
      alert('Add at least one checkpoint date for the long term plan, or untick "Long term plan required?".');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/coaching/${editingId}`, form);
      } else {
        await api.post('/coaching', form);
      }
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 4: Add checkpoint row helper functions**

Add these functions inside the `Coaching` component, after `saveSession` (before `const filtered = ...`):

```js
  const addCheckpoint = () => {
    setForm(f => ({ ...f, checkpoints: [...f.checkpoints, { target_date: '', notes: '' }] }));
  };

  const updateCheckpoint = (idx, field, value) => {
    setForm(f => ({
      ...f,
      checkpoints: f.checkpoints.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const removeCheckpoint = (idx) => {
    setForm(f => ({ ...f, checkpoints: f.checkpoints.filter((_, i) => i !== idx) }));
  };
```

- [ ] **Step 5: Replace the Follow-up Date / Sessions Required block with the toggle + conditional sections**

In the modal JSX, replace the current block (lines 253-262):

```jsx
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Follow-up Date</label>
                <input className="form-input" type="date" value={form.followup_date} onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
              </div>
              <div style={{ width: 120 }}>
                <label className="form-label">Sessions Required</label>
                <input className="form-input" type="number" min={1} value={form.sessions_required} onChange={e => setForm(f => ({ ...f, sessions_required: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
```

with:

```jsx
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                <input
                  type="checkbox"
                  checked={form.long_term_plan}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      long_term_plan: checked,
                      checkpoints: checked && f.checkpoints.length === 0 ? [{ target_date: '', notes: '' }] : (checked ? f.checkpoints : []),
                    }));
                  }}
                />
                Long term plan required?
              </label>
            </div>

            {form.long_term_plan ? (
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Checkpoints *</label>
                {form.checkpoints.map((cp, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <input
                      className="form-input"
                      type="date"
                      style={{ maxWidth: 150 }}
                      value={cp.target_date}
                      onChange={e => updateCheckpoint(idx, 'target_date', e.target.value)}
                    />
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Notes for this checkpoint"
                      value={cp.notes}
                      onChange={e => updateCheckpoint(idx, 'notes', e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => removeCheckpoint(idx)}
                      style={{ flexShrink: 0 }}
                    >×</button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm" onClick={addCheckpoint}>+ Add checkpoint</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Follow-up Date</label>
                  <input className="form-input" type="date" value={form.followup_date} onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
                </div>
                <div style={{ width: 120 }}>
                  <label className="form-label">Sessions Required</label>
                  <input className="form-input" type="number" min={1} value={form.sessions_required} onChange={e => setForm(f => ({ ...f, sessions_required: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
            )}
```

- [ ] **Step 6: Build check**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors (warnings about chunk size are pre-existing and fine).

- [ ] **Step 7: Manual smoke test in browser**

With `npm run dev` running from repo root, open the app, go to Coaching, click "+ New Session". Fill required fields, tick "Long term plan required?" — confirm Follow-up Date/Sessions Required disappear and one empty checkpoint row appears. Click "+ Add checkpoint" to add a second row, fill both dates + notes, save. Confirm no error and the modal closes.

Then click Edit on that same row in the table — confirm the checkbox is ticked and both checkpoint rows are pre-filled with the correct data (this exercises the async `openEdit` fetch from Step 2).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Coaching.jsx
git commit -m "feat: add long-term plan toggle and checkpoints to coaching form"
```

---

### Task 4: Frontend — CoachingSession.jsx detail view and edit mode

**Files:**
- Modify: `frontend/src/pages/CoachingSession.jsx`

**Interfaces:**
- Consumes: `GET /api/coaching/:id` response shape from Task 2 (`long_term_plan`, `checkpoints`)
- Consumes: `PUT /api/coaching/:id/checkpoints/:checkpointId` from Task 2 — body `{completed: boolean, completed_note?: string}`
- Consumes: same checkpoint helper pattern as Task 3 (duplicated locally — this file doesn't share state with `Coaching.jsx`)

- [ ] **Step 1: Load `long_term_plan`/`checkpoints` into edit form state**

Update the `useEffect` in `CoachingSession.jsx` (currently lines 28-44):

```jsx
  useEffect(() => {
    api.get(`/coaching/${id}`)
      .then(r => {
        setSession(r.data);
        setForm({
          date: r.data.date,
          topic: r.data.topic,
          how_coached: r.data.how_coached,
          outcome: r.data.outcome,
          followup_date: r.data.followup_date || '',
          sessions_required: r.data.sessions_required,
          status: r.data.status,
          long_term_plan: !!r.data.long_term_plan,
          checkpoints: r.data.long_term_plan
            ? (r.data.checkpoints || []).map(c => ({ target_date: c.target_date, notes: c.notes || '' }))
            : [],
        });
      })
      .catch(() => navigate('/coaching'))
      .finally(() => setLoading(false));
  }, [id]);
```

- [ ] **Step 2: Add a `toggleCheckpoint` function for the read view**

Add this function inside the `CoachingSession` component, after `deleteSession` (before `if (loading) return ...`):

```jsx
  const toggleCheckpoint = async (checkpoint) => {
    const willComplete = !checkpoint.completed;
    let note = checkpoint.completed_note || '';
    if (willComplete) {
      const entered = prompt('Completion note (optional):', note);
      if (entered === null) return; // user cancelled
      note = entered;
    }
    await api.put(`/coaching/${id}/checkpoints/${checkpoint.id}`, {
      completed: willComplete,
      completed_note: note,
    });
    const r = await api.get(`/coaching/${id}`);
    setSession(r.data);
  };
```

- [ ] **Step 3: Add checkpoint row helpers for edit mode**

Add these alongside `toggleCheckpoint` (same placement):

```jsx
  const addCheckpoint = () => {
    setForm(f => ({ ...f, checkpoints: [...f.checkpoints, { target_date: '', notes: '' }] }));
  };

  const updateCheckpoint = (idx, field, value) => {
    setForm(f => ({
      ...f,
      checkpoints: f.checkpoints.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const removeCheckpoint = (idx) => {
    setForm(f => ({ ...f, checkpoints: f.checkpoints.filter((_, i) => i !== idx) }));
  };
```

- [ ] **Step 4: Replace the Follow-up Date / Sessions Required block in edit mode**

Replace the current block in the `editing` branch (currently lines 92-101):

```jsx
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Follow-up Date</label>
              <input className="form-input" type="date" value={form.followup_date} onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
            </div>
            <div style={{ width: 120 }}>
              <label className="form-label">Sessions Required</label>
              <input className="form-input" type="number" min={1} value={form.sessions_required} onChange={e => setForm(f => ({ ...f, sessions_required: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
```

with:

```jsx
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
              <input
                type="checkbox"
                checked={form.long_term_plan}
                onChange={e => {
                  const checked = e.target.checked;
                  setForm(f => ({
                    ...f,
                    long_term_plan: checked,
                    checkpoints: checked && f.checkpoints.length === 0 ? [{ target_date: '', notes: '' }] : (checked ? f.checkpoints : []),
                  }));
                }}
              />
              Long term plan required?
            </label>
          </div>

          {form.long_term_plan ? (
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Checkpoints</label>
              {form.checkpoints.map((cp, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                  <input
                    className="form-input"
                    type="date"
                    style={{ maxWidth: 150 }}
                    value={cp.target_date}
                    onChange={e => updateCheckpoint(idx, 'target_date', e.target.value)}
                  />
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Notes for this checkpoint"
                    value={cp.notes}
                    onChange={e => updateCheckpoint(idx, 'notes', e.target.value)}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => removeCheckpoint(idx)} style={{ flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={addCheckpoint}>+ Add checkpoint</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Follow-up Date</label>
                <input className="form-input" type="date" value={form.followup_date} onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
              </div>
              <div style={{ width: 120 }}>
                <label className="form-label">Sessions Required</label>
                <input className="form-input" type="number" min={1} value={form.sessions_required} onChange={e => setForm(f => ({ ...f, sessions_required: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
          )}
```

- [ ] **Step 5: Replace the Follow-up Date / Sessions Required Fields in the read view with a Long Term Plan card**

Replace the current lines (currently lines 165-166):

```jsx
        {session.followup_date && <Field label="Follow-up Date" value={fmtDate(session.followup_date)} />}
        <Field label="Sessions Required" value={String(session.sessions_required)} />
```

with:

```jsx
        {session.long_term_plan ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 8 }}>Long Term Plan</div>
            {(session.checkpoints || []).map(cp => (
              <div key={cp.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', marginBottom: 8,
                borderRadius: 8, border: '1px solid var(--border)',
                background: cp.completed ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.06)',
              }}>
                <input type="checkbox" checked={!!cp.completed} onChange={() => toggleCheckpoint(cp)} style={{ marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: cp.completed ? 'var(--ok)' : 'var(--amber)',
                    textDecoration: cp.completed ? 'line-through' : 'none',
                  }}>
                    {fmtDate(cp.target_date)}
                  </div>
                  {cp.notes && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>{cp.notes}</div>}
                  {cp.completed && cp.completed_note && (
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                      Completed {cp.completed_at ? fmtDate(cp.completed_at) : ''}{cp.completed_note ? ` — ${cp.completed_note}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {session.followup_date && <Field label="Follow-up Date" value={fmtDate(session.followup_date)} />}
            <Field label="Sessions Required" value={String(session.sessions_required)} />
          </>
        )}
```

- [ ] **Step 6: Build check**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manual smoke test in browser**

With the dev server running, navigate to the detail page (`/coaching/:id`) of the long-term-plan session created in Task 3's smoke test. Confirm the "Long Term Plan" card shows both checkpoints with amber (pending) styling. Click a checkpoint's checkbox — confirm a prompt appears for a completion note, entering text and confirming updates the row to green/strikethrough with the completion note and date shown, without a full page reload. Click Edit — confirm the checkbox and checkpoint rows are pre-filled correctly; add a third checkpoint, save, and confirm the read view now shows 3 checkpoints.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/CoachingSession.jsx
git commit -m "feat: show and manage long-term plan checkpoints on coaching session detail"
```

---

### Task 5: Final end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full build check**

Run from repo root: `npm run build`
Expected: succeeds (this runs `cd frontend && npm install && npm run build`).

- [ ] **Step 2: Backend syntax check of all touched files**

Run: `cd backend && node -c server.js && node -c db.js && node -c routes/coaching.js`
Expected: no output from any.

- [ ] **Step 3: Full manual regression pass**

With `npm run dev` running from repo root:
1. Create a normal (non-long-term-plan) coaching session — confirm it saves and the detail page shows Follow-up Date / Sessions Required as before (no regression for the common case).
2. Create a long-term-plan session with 2 checkpoints — confirm it saves, appears correctly in the Coaching table (Follow-up column shows `—` since `followup_date` is null for plan sessions), and the detail page shows the plan card.
3. Tick off one checkpoint, refresh the page (hard reload), confirm the completed state persisted.
4. Edit the session to toggle `long_term_plan` OFF — confirm checkpoints are cleared and Follow-up Date/Sessions Required reappear; save; confirm the detail page now shows the simple fields and no plan card.
5. On the Staff Profile page for the relevant staff member, confirm the Coaching tab table still renders correctly for both plan and non-plan sessions (no crash, Date/Topic/Sessions/Status columns as before).
6. Delete a long-term-plan session from its detail page — confirm no error (verifies the checkpoint cleanup in the DELETE route).

- [ ] **Step 4: Final commit if any fixups were needed**

If Step 3 surfaced any bugs, fix them in the relevant file and commit:

```bash
git add -A
git commit -m "fix: address issues found in coaching long-term plan regression pass"
```

If no fixups were needed, skip this step — nothing to commit.
