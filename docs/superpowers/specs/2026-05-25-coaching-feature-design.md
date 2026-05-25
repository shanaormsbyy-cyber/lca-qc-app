# Coaching Feature Design

**Date:** 2026-05-25  
**Status:** Approved

---

## Goal

Replace the Disciplinary section with a Coaching feature. Managers log coaching sessions linked to individual staff members, recording what was coached, how, and the outcome. A pocket card reference (Can't / Didn't / Won't + five moves) is embedded in the UI for managers to reference on the go.

---

## What Gets Removed

- `frontend/src/pages/Disciplinary.jsx` — deleted
- `frontend/src/pages/WarningDetail.jsx` — deleted
- Disciplinary nav entry in `frontend/src/components/Layout.jsx` — replaced with Coaching
- `/disciplinary` and `/disciplinary/:id` routes in `frontend/src/App.jsx` — replaced with `/coaching` and `/coaching/:id`
- Disciplinary Warnings section in `frontend/src/pages/StaffProfile.jsx` — replaced with Coaching tab
- Warnings count stat card in StaffProfile — replaced with Coaching Sessions count
- Staff portal warnings section in `frontend/src/pages/StaffPortalDashboard.jsx` — removed entirely

Backend `/api/warnings` routes are **left in place** — data is preserved, just no longer surfaced in the UI.

---

## Database

New table: `coaching_sessions`

```sql
CREATE TABLE IF NOT EXISTS coaching_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  manager_id INTEGER NOT NULL REFERENCES managers(id),
  date TEXT NOT NULL,
  topic TEXT NOT NULL,
  problem_type TEXT NOT NULL CHECK(problem_type IN ('cant', 'didnt', 'wont')),
  how_coached TEXT NOT NULL,
  outcome TEXT NOT NULL,
  followup_date TEXT,
  sessions_required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Backend — `backend/routes/coaching.js` (new file)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/coaching` | All sessions, optional `?staff_id=` filter |
| GET | `/api/coaching/:id` | Single session |
| POST | `/api/coaching` | Create session |
| PUT | `/api/coaching/:id` | Update session (status, outcome, followup_date, sessions_required) |
| DELETE | `/api/coaching/:id` | Delete session |

All routes require `requireAuth`. Emits change event after POST, PUT, DELETE.

Registered in `backend/server.js` as `/api/coaching`.

---

## Frontend Pages

### 1. `frontend/src/pages/Coaching.jsx` (new file)

**Layout:**
- Page header: "Coaching" + staff count subtext + "+ New Session" button
- Collapsible Pocket Card at the top (collapsed by default)
- Filter row: staff member dropdown + status filter (All / Open / Resolved)
- Table: Date | Staff | Topic | Problem Type | Follow-up Date | Sessions | Status | Actions

**Pocket Card content (collapsible):**
```
First — which problem?
  Can't   skill gap — retrain, demo, more reps. Coach it.
  Didn't  unclear or blocked — fix the expectation or the barrier.
  Won't   can, but chooses not to — Code conversation, don't coach.

The five moves
  1. Show the gap.     Evidence, not opinion. Private, calm.
  2. Ask why — then stop.  Let them talk first.
  3. One thing.        Pick the single fix; show what good looks like.
  4. Lock it.          One checkable step + a date.
  5. Back them.        "I know you can." Then follow up.
```

**New Session modal fields:**
- Staff member (select, required)
- Date (date picker, default today, DD/MM/YYYY display)
- Topic (text input, required — e.g. "Bathroom presentation")
- Problem type (3-button toggle: Can't / Didn't / Won't, required)
- How it was coached (textarea, required)
- Outcome / follow-up action (textarea, required)
- Follow-up date (date picker, optional)
- Sessions required (number input, min 1, default 1)
- Status (toggle: Open / Resolved, default Open)

Pocket card is also shown inside the modal (collapsed by default).

**Edit:** clicking a row opens the same modal pre-filled for editing.

### 2. `frontend/src/pages/CoachingSession.jsx` (new file)

Detail view for a single coaching session at `/coaching/:id`.

Displays all fields in a clean read-only card layout. "Edit" button opens inline edit mode. "Delete" button with confirmation. "← Back" to `/coaching`.

Shows the staff member's name prominently with a link back to their profile.

### 3. `frontend/src/pages/StaffProfile.jsx` (modified)

- Remove: warnings state, warnings API call, Disciplinary Warnings card, warnings count stat
- Add: coaching sessions state, `api.get('/coaching?staff_id=...')` call
- Add: "Coaching" tab alongside existing tabs (QC checks, training, insights)
- Coaching tab shows a table of that staff member's sessions: Date | Topic | Problem Type | Sessions | Status — rows clickable to `/coaching/:id`
- Stat card: "Coaching Sessions" count (replacing "Warnings")

### 4. `frontend/src/pages/StaffPortalDashboard.jsx` (modified)

- Remove: `portalWarnings` state, warnings API call, `acknowledgeWarning` function, warnings render block
- Nothing replaces it — staff don't need visibility into coaching sessions

### 5. `frontend/src/components/Layout.jsx` (modified)

- Replace `{ to: '/disciplinary', label: 'Disciplinary' }` with `{ to: '/coaching', label: 'Coaching' }`

### 6. `frontend/src/App.jsx` (modified)

- Remove: `Disciplinary` and `WarningDetail` imports and routes
- Add: `Coaching` and `CoachingSession` imports and routes (`/coaching`, `/coaching/:id`)

---

## Problem Type Display

| Value | Label | Colour |
|-------|-------|--------|
| `cant` | Can't | amber |
| `didnt` | Didn't | blue/cyan |
| `wont` | Won't | red |

Status badges:
- Open: amber
- Resolved: green

---

## Design Language

Follows existing LCA glassmorphism style:
- Background: `#08080c`, accent: `#3AB5D9`
- Cards: `backdrop-filter: blur`, `rgba(255,255,255,0.04)` bg, `rgba(255,255,255,0.09)` border
- Pocket card uses a distinct subtle cyan-tinted background to stand out as a reference element
- Problem type toggle uses the same 3-button pattern as existing score buttons in QCCheckForm

---

## Scope Explicitly Out

- No staff visibility of coaching sessions
- No Slack notifications for coaching (disciplinary had these — not needed here)
- Backend warnings routes not deleted (data preserved)
- No PDF export for coaching sessions
