# Slack Notifications — Design Spec
**Date:** 2026-05-21  
**Status:** Approved  
**Project:** LCA QC App

---

## Overview

Send Slack notifications to the right people at the right time:
- **Cleaner DM** when their QC check is completed (minimal, links to portal)
- **Management channel** when a single check scores below the acceptable threshold
- **Management channel** when a cleaner's rolling average drops below the acceptable threshold
- **Cleaner DM** when a disciplinary warning is issued to them (private)

Uses Slack Incoming Webhooks for channel messages and the Slack Web API (bot token) for DMs. All notifications are fire-and-forget — failures are logged but never break the primary action.

---

## Environment / Configuration

### Environment variables (Railway)
| Variable | Purpose |
|---|---|
| `SLACK_WEBHOOK_URL` | Webhook for `#lca-notifications` management channel |
| `SLACK_BOT_TOKEN` | Bot token for sending DMs to cleaners |

### Settings table keys (editable in UI)
| Key | Default | Purpose |
|---|---|---|
| `slack_webhook_url` | `''` | Overrides env var if set — webhook URL for management channel |
| `slack_bot_token` | `''` | Overrides env var if set — bot token for DMs |
| `slack_notify_check_complete` | `'true'` | Toggle cleaner DM on check completion |
| `slack_notify_below_threshold` | `'true'` | Toggle management alerts on bad scores |
| `portal_base_url` | `''` | Base URL for portal links e.g. `https://lca-qc.up.railway.app` |

DB value takes precedence over env var when both are set.

---

## Data Model

### `staff` table — new column
| Column | Type | Notes |
|---|---|---|
| `slack_email` | TEXT | Nullable. Email address the cleaner uses in Slack. Added via auto-migration. |

---

## Backend Service — `backend/services/slack.js`

Single module, four exported async functions. All are fire-and-forget (caller does not await, errors caught internally and logged with `console.error`).

### `getSlackConfig()`
Internal helper. Reads `slack_webhook_url`, `slack_bot_token`, `portal_base_url` from DB settings, falls back to env vars for webhook/token.

```js
function getSlackConfig() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return {
    webhookUrl: s.slack_webhook_url || process.env.SLACK_WEBHOOK_URL || '',
    botToken:   s.slack_bot_token   || process.env.SLACK_BOT_TOKEN   || '',
    portalUrl:  s.portal_base_url   || '',
    notifyCheckComplete:    s.slack_notify_check_complete    !== 'false',
    notifyBelowThreshold:   s.slack_notify_below_threshold   !== 'false',
  };
}
```

### `postToChannel(webhookUrl, text)`
Internal helper. POSTs `{ text }` to the webhook URL using `fetch`.

### `sendDM(botToken, email, text)`
Internal helper. Calls `users.lookupByEmail` to get the Slack user ID, then `conversations.open` to get a DM channel ID, then `chat.postMessage` to send the message. Returns silently if email not found.

### `notifyCheckComplete(checkId)`
Called after a QC check is marked complete.

**Logic:**
1. Read config — if `notifyCheckComplete` is false, return
2. Fetch check from DB (staff_id, property_name, score_pct, status)
3. Fetch staff record (name, slack_email)
4. If no `slack_email`, return silently
5. Build portal link: `${portalUrl}/portal`
6. Send DM: `"Your QC check has been completed. Please check the portal for more details: ${portalUrl}/portal"`

### `notifyBelowThreshold(checkId)`
Called after a QC check is marked complete (same trigger as above, separate function).

**Logic:**
1. Read config — if `notifyBelowThreshold` is false or no `webhookUrl`, return
2. Fetch check (staff_id, score_pct, property_name)
3. Read `watchlist_threshold` from settings (default 90)
4. Fetch staff (name)
5. **Single check alert:** if `score_pct < watchlist_threshold`, post to channel:
   `"⚠️ QC Alert: [Name] scored [X]% at [Property] — below the [threshold]% target."`
6. **Rolling average alert:** calculate avg of all completed staff checks. Fetch the previous check's rolling average (all checks except this one). If previous avg was >= threshold AND new avg is < threshold, post:
   `"📉 Performance Alert: [Name]'s average score has dropped to [X]% — below the [threshold]% acceptable average."`

### `notifyDisciplinary(warningId)`
Called after a new warning is created.

**Logic:**
1. Read config — if no `botToken`, return
2. Fetch warning (staff_id, level)
3. Fetch staff (name, slack_email)
4. If no `slack_email`, return silently
5. Format level label: `verbal_note` → "Verbal Note", `written_warning` → "Written Warning", `final_warning` → "Final Warning"
6. Build portal link: `${portalUrl}/portal`
7. Send DM: `"You have received a [level label]. Please log in to the portal to view details and acknowledge it: ${portalUrl}/portal"`

---

## Trigger Points

### `backend/routes/qc.js` — `PUT /checks/:id`
After the DB transaction commits successfully and `status === 'complete'`, add:
```js
if (complete) {
  notifyCheckComplete(req.params.id).catch(() => {});
  notifyBelowThreshold(req.params.id).catch(() => {});
}
```
Where `complete` is determined by `req.body.status === 'complete'`.

### `backend/routes/warnings.js` — `POST /`
After the warning is created and `warningId` is obtained:
```js
notifyDisciplinary(warningId).catch(() => {});
```

---

## Frontend — Settings Page

New **"Slack Integration"** card in `frontend/src/pages/Settings.jsx`, added to `qcSettings` state and saved via the existing `PUT /scheduling/settings` endpoint.

**Fields:**
| Field | Input type | Setting key |
|---|---|---|
| Notifications Channel Webhook URL | text | `slack_webhook_url` |
| Bot Token | password (masked) | `slack_bot_token` |
| Portal Base URL | text | `portal_base_url` |
| Notify cleaner on check completion | toggle (checkbox) | `slack_notify_check_complete` |
| Notify management on below-threshold scores | toggle (checkbox) | `slack_notify_below_threshold` |

Save button uses existing `saveQcSettings()`.

Helper text below the card:
> "To set up: create a Slack App at api.slack.com, add an Incoming Webhook for your notifications channel, and add the `chat:write` and `users:lookupByEmail` Bot Token Scopes."

---

## Frontend — Staff Profile Page

New **"Slack Email"** field on `frontend/src/pages/StaffProfile.jsx`:
- Shown in the staff header area (alongside name, role, start date)
- Text input, placeholder: "cleaner@example.com"
- Saved via `PUT /staff/:id` with `{ slack_email }` in body
- Inline save — small "Save" button next to the field, shows "✓ Saved" on success

`PUT /staff/:id` in `backend/routes/staff.js` needs to be updated to accept `slack_email`.

---

## Error Handling

All Slack calls are wrapped in try/catch. Errors are logged with `console.error('Slack notification failed:', e.message)` but never thrown. The primary operation (saving the check, creating the warning) is never affected by a Slack failure.

If `webhookUrl` or `botToken` is empty, the relevant functions return immediately without attempting any network call.

---

## Slack App Setup (for documentation)

Managers need to:
1. Go to `api.slack.com/apps` → Create New App → From Scratch
2. Add **Incoming Webhooks** — activate and create a webhook for `#lca-notifications`
3. Add **Bot Token Scopes**: `chat:write`, `users:lookupByEmail`
4. Install app to workspace → copy Bot User OAuth Token
5. Paste webhook URL and bot token into Settings → Slack Integration

---

## Out of Scope
- Slack notifications for training sessions
- Slack notifications for heat pump filter reminders
- Two-way Slack interaction (slash commands, buttons)
- Per-manager Slack notification preferences
- Notification history / audit log in the app
