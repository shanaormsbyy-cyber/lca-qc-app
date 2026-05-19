# Disciplinary Warnings — Design Spec
**Date:** 2026-05-20  
**Status:** Approved  
**Project:** LCA QC App

---

## Overview

Add a disciplinary warnings system to the QC app. Managers can issue formal warnings to staff members, optionally linking them to one or more QC checks (a specific incident) or leaving them unlinked (pattern-based). Staff can view their warnings on their portal and acknowledge them. Managers see acknowledgement status and are flagged when a warning is overdue.

---

## Data Model

### `warnings` table
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `staff_id` | INTEGER FK | References `staff.id` |
| `level` | TEXT | `verbal_note`, `written_warning`, `final_warning` |
| `reason` | TEXT | Short summary (e.g. "Persistent dusting failures") |
| `details` | TEXT | Full warning text |
| `corrective_actions` | TEXT | What the staff member must do |
| `issued_by` | TEXT | Manager name (denormalised for simplicity) |
| `issued_at` | TEXT | ISO date string |
| `acknowledged_at` | TEXT | NULL until acknowledged |
| `acknowledged_by` | TEXT | Staff name, NULL until acknowledged |
| `created_at` | TEXT | Auto-set on insert |

### `warning_check_links` table
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `warning_id` | INTEGER FK | References `warnings.id` |
| `check_id` | INTEGER FK | References `qc_checks.id` |

### `warning_edits` table — manager-only, never exposed to staff portal
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `warning_id` | INTEGER FK | References `warnings.id` |
| `edited_by` | TEXT | Manager name |
| `edited_at` | TEXT | ISO timestamp |
| `prev_level` | TEXT | |
| `prev_reason` | TEXT | |
| `prev_details` | TEXT | |
| `prev_corrective_actions` | TEXT | |

---

## Backend Routes

All routes under `/warnings`, protected by `requireAuth` (manager only) except the staff portal routes.

### Manager routes
| Method | Path | Action |
|---|---|---|
| `GET` | `/warnings` | List all warnings, includes staff name, level, reason, issued_at, acknowledged_at. Supports `?staff_id=` filter. |
| `GET` | `/warnings/:id` | Full warning detail including linked checks and edit history. |
| `POST` | `/warnings` | Create warning. Body: `staff_id`, `level`, `reason`, `details`, `corrective_actions`, `check_ids[]`. |
| `PUT` | `/warnings/:id` | Edit warning. Saves previous values to `warning_edits` before applying changes. |
| `DELETE` | `/warnings/:id` | Delete warning and its links/history. |

### Staff portal routes
Protected by `requireStaffAuth`.

| Method | Path | Action |
|---|---|---|
| `GET` | `/staff-portal/my-warnings` | Returns all warnings for the authenticated staff member. Includes linked check summaries (property name, date, score). Never includes `warning_edits`. |
| `POST` | `/staff-portal/my-warnings/:id/acknowledge` | Records `acknowledged_at` and `acknowledged_by` on the warning. Idempotent — no-ops if already acknowledged. |

---

## Manager UI

### Sidebar
New "Disciplinary" nav item below "Team". Uses a shield or file icon.

### `/disciplinary` — Warnings list page
- Header with "Disciplinary Records" title and "New Warning" button (top right)
- Filter row: staff member dropdown, level dropdown
- Table rows: staff name, level badge (colour-coded), reason, date issued, acknowledgement status badge, "View" button
- **Acknowledgement status badges:**
  - No badge — acknowledged
  - Amber "Awaiting acknowledgement" — not yet acknowledged, within 3 days of `issued_at`
  - Red "Overdue — not acknowledged" — not acknowledged and 3+ days since `issued_at`

### New Warning — modal form
Fields:
1. Staff member (dropdown of all active staff)
2. Level (dropdown: Verbal Note / Written Warning / Final Warning)
3. Reason (short text input)
4. Details (textarea — full warning text)
5. Corrective Actions (textarea)
6. Link QC checks (optional) — once a staff member is selected, shows a list of their completed checks (date + property + score) with checkboxes

Submit creates the warning and its check links.

### `/disciplinary/:id` — Warning detail page
- Warning level badge + date issued + issued by
- Reason, full details, corrective actions (clearly separated)
- Acknowledgement status — shows acknowledged date/name if done, or overdue badge if not
- Linked QC checks — cards showing property name, date, score, clickable to `/qc/checks/:id`
- Edit button — opens same form pre-filled; on save, writes current values to `warning_edits` then applies changes
- Edit history accordion at bottom — shows each edit as a row: edited by, edited at, what the previous values were. Manager-only, never visible on staff portal.
- Delete button with confirmation

### Staff profile page integration
- "Warnings" stat card added to the 4-card stat grid (shows count, red if >0)
- Warnings list at bottom of staff profile — same row format as disciplinary list (level badge, reason, date, acknowledgement status), each row links to `/disciplinary/:id`

---

## Staff Portal UI

### Warnings section on dashboard
- Sits between the score trend card and the flagged issues card
- Only renders if the staff member has 1+ warnings; no empty state shown if none
- Each warning is a card containing:
  - **Level badge** (colour-coded: amber = Verbal Note, orange = Written Warning, red = Final Warning)
  - Date issued + "Issued by [manager name]"
  - **Reason** — short summary line
  - **Details** — full warning text
  - **Corrective Actions** — displayed in a visually distinct box (e.g. slightly different background) so it's clearly what's expected
  - **Linked QC checks** — listed below as clickable rows: property name, date, score → links to `/portal/check/:id`
  - **Acknowledgement button** — "I have read and acknowledge this warning and agree to the corrective actions" — only shown if not yet acknowledged. On click: calls `POST /staff-portal/my-warnings/:id/acknowledge`, button replaced with "Acknowledged on DD/MM/YYYY"

---

## Acknowledgement Overdue Logic

- Computed on the fly in both the list and detail views — no cron job needed
- `overdue = !acknowledged_at && daysSince(issued_at) >= 3`
- Days calculated as: `Math.floor((now - new Date(issued_at)) / 86400000)`

---

## Level Colours
Uses existing CSS vars where possible. Written Warning uses an inline orange (`#f97316`) since the app has no `--orange` var.

| Level | Colour | CSS |
|---|---|---|
| Verbal Note | Amber | `var(--amber)` / `rgba(245,158,11,...)` |
| Written Warning | Orange | `#f97316` / `rgba(249,115,22,...)` |
| Final Warning | Red | `var(--red)` / `rgba(239,68,68,...)` |

---

## Out of Scope
- Email or push notifications when a warning is issued
- Staff ability to dispute or add a written response to a warning
- PDF export of warnings
- Archiving/resolving warnings (all warnings remain on record permanently unless deleted by a manager)
