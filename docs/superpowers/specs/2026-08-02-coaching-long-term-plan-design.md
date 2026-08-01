# Coaching Long Term Plan — Design

**Date:** 2026-08-02
**Status:** Approved

---

## Goal

Let a manager mark a coaching session as needing a long-term plan. When ticked, the manager defines multiple dated checkpoints (each with notes) instead of relying on the single `followup_date` / `sessions_required` fields the form uses today. Each checkpoint can later be marked complete with its own completion note, so managers can track progress over weeks without re-editing the whole session.

---

## Database

### New column on `coaching_sessions`

Added via the existing `ALTER TABLE ADD COLUMN` auto-migration pattern in `backend/server.js`:

```sql
ALTER TABLE coaching_sessions ADD COLUMN long_term_plan INTEGER NOT NULL DEFAULT 0;
```

### New table: `coaching_plan_checkpoints`

```sql
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
);
```

Created via the same `PRAGMA table_info` / `cols.length === 0` auto-migration block pattern used for `coaching_sessions` and other tables in `backend/server.js`.

When a coaching session is deleted, its checkpoints must be deleted too (no `ON DELETE CASCADE` is used elsewhere in this codebase, so handle it explicitly in the DELETE route).

---

## Backend — `backend/routes/coaching.js`

### `GET /api/coaching/:id`

Also fetches and returns `checkpoints: [...]` (ordered by `sort_order`) for that session when `long_term_plan` is true; empty array otherwise.

### `POST /api/coaching`

Accepts `long_term_plan` (bool) and, when true, a `checkpoints` array: `[{ target_date, notes }, ...]`. Inserts the session, then bulk-inserts checkpoints with `sort_order` set to array index. When `long_term_plan` is false, `followup_date` / `sessions_required` are used as today — no checkpoints inserted.

### `PUT /api/coaching/:id`

Same shape as POST. When `long_term_plan` is true: delete all existing checkpoints for the session, reinsert the provided array (simplest correct approach for a manager editing a short list — avoids diffing). When `long_term_plan` is false: delete any existing checkpoints (switching a session back off the plan clears it) and go back to writing `followup_date` / `sessions_required`.

### New: `PUT /api/coaching/:id/checkpoints/:checkpointId`

Body: `{ completed: bool, completed_note?: string }`. Sets `completed`, `completed_note`, and `completed_at` (server-set `datetime('now')` when marking complete; cleared when un-marking). Used for the "tick off a checkpoint weeks later" action without resending the whole session. Requires `requireAuth` like other coaching routes. Emits the same change event used by other coaching mutations (for live sync).

### `DELETE /api/coaching/:id`

Also runs `DELETE FROM coaching_plan_checkpoints WHERE coaching_session_id = ?` before deleting the session.

---

## Frontend

### `frontend/src/pages/Coaching.jsx` (new/edit modal)

- Add a "Long term plan required?" checkbox after the Sessions Required field.
- **Unticked (default):** form looks exactly as it does today — Follow-up Date + Sessions Required shown.
- **Ticked:** Follow-up Date and Sessions Required are hidden. A "Checkpoints" section appears:
  - Repeatable rows: date picker + notes text input per row.
  - "+ Add checkpoint" button appends a row.
  - "×" per row removes it.
  - Starts with 1 empty row when first ticked.
  - Validation: if `long_term_plan` is ticked, at least 1 checkpoint with a date is required before saving.
- Toggling the checkbox off clears any entered checkpoint rows from local form state (they're not saved anyway until submit).
- `EMPTY_FORM` gains `long_term_plan: false` and `checkpoints: []`.
- `saveSession` sends `long_term_plan` and, when true, `checkpoints`; otherwise omits/ignores them.

### `frontend/src/pages/CoachingSession.jsx` (detail page)

- **Read view:** if `session.long_term_plan` is true, replace the Follow-up Date / Sessions Required `Field` rows with a "Long Term Plan" card:
  - Lists each checkpoint: date, notes, a checkbox for completed.
  - Unchecked checkpoints show date + notes only.
  - Checking the box opens a small inline prompt (text input) for a completion note, then immediately calls the new checkpoint endpoint and updates state — this does not require entering the session's full edit mode.
  - Completed checkpoints show a check style (e.g. strikethrough or green accent), the completion note, and completed date.
  - Unchecking a completed checkpoint clears its completed note/date via the same endpoint.
- **Edit mode:** mirrors the Coaching.jsx modal — toggle for `long_term_plan`, checkpoint rows editable (add/remove/edit date+notes) when ticked, plain Follow-up Date/Sessions Required when not. Saving goes through the existing `PUT /api/coaching/:id` (full replace of checkpoints, per backend design above).

### `frontend/src/pages/StaffProfile.jsx` (coaching tab)

No changes. The existing table (Date / Topic / Sessions / Status) continues to work — long-term-plan sessions appear the same as any other row; full plan detail is only in `CoachingSession.jsx`.

---

## Design Language

Follows existing LCA glassmorphism style used elsewhere in Coaching:
- Checkpoint rows use the same `form-input` styling as other form fields.
- Completed checkpoint accent uses `var(--ok)` (green), matching the "Resolved" status badge elsewhere.
- Pending checkpoint accent uses `var(--amber)`, matching "Open" status badge elsewhere.
- "Long Term Plan" card uses the same `.card` container style as other sections on the detail page.

---

## Scope Explicitly Out

- No due-soon / overdue highlighting on checkpoints (e.g. no red flag if a checkpoint date has passed and isn't completed) — future enhancement if needed.
- No Slack/notification integration for checkpoint due dates.
- No reordering UI for checkpoints beyond add/remove (sort_order is set by array position at save time).
- No checkpoint-level history — editing a checkpoint's date/notes in edit mode simply overwrites it (delete-and-reinsert on save), it does not preserve prior edits.
