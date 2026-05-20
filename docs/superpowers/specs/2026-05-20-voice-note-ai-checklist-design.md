# Voice Note AI Checklist — Design Spec
**Date:** 2026-05-20  
**Status:** Approved  
**Project:** LCA QC App

---

## Overview

Managers doing QC inspections can record a voice note while walking through a property describing issues they find. The Web Speech API transcribes the audio live in the browser. When recording is complete, the manager triggers an AI analysis — Claude reads the transcript against the full checklist and returns structured results: confident fails, ambiguous items needing manager input, and a plain-English summary. The manager reviews in a confirmation modal and either confirms or goes to edit manually. Nothing not in `fails` or `ambiguous` is failed — everything else is treated as a pass.

Designed for speed: a manager doing 15 houses a day can walk a property speaking observations aloud, tap Confirm, and move on — without manually tapping through checklist items.

---

## Workflow

1. Manager opens QC check form (`/qc/checks/:id`) for a pending check
2. Voice Note card is visible at the top of the form (hidden once check is complete)
3. Manager taps **Record**, speaks walkthrough observations
4. Live transcript builds on screen via Web Speech API
5. Manager taps **Stop**
6. Manager taps **Analyse with AI**
7. Backend calls Claude with transcript + full checklist items
8. Confirmation modal appears with summary, fails list, and ambiguous items
9. Manager resolves any ambiguous items (mark fail / leave as pass)
10. Manager taps **Confirm & Apply** or **Edit Manually**
11. If confirmed: `PUT /qc/checks/:id` is called with updated item scores
12. Transcript is saved to `qc_checks.voice_transcript`

---

## Data Model

### `qc_checks` table — new column
| Column | Type | Notes |
|---|---|---|
| `voice_transcript` | TEXT | NULL until a voice note is recorded. Added via auto-migration. |

---

## Backend

### New endpoint: `POST /qc/checks/:id/voice-analyse`

Protected by `requireAuth`. Does NOT write scores — returns analysis only.

**Request body:**
```json
{ "transcript": "Kitchen bin liner not changed, bedroom 1 side table is dusty, bathroom sink has hair in it" }
```

**Process:**
1. Fetch check + items from DB (id, text, category, room_label, score_type)
2. Save transcript to `qc_checks.voice_transcript`
3. Build Claude prompt (see below)
4. Call Claude (`claude-haiku-4-5-20251001`, max_tokens 1000)
5. Parse JSON from response
6. Return structured result

**Claude prompt structure:**
```
You are a QC inspection assistant for a cleaning company. A manager has walked through a property and recorded a voice note describing issues they found.

Your job is to map their observations to specific checklist items.

Rules:
- If an item is clearly mentioned as an issue in the transcript, add it to "fails"
- If the transcript mentions something that could match an item but the specific room/area is unclear (e.g. "bedroom" when there are multiple bedroom sections), add it to "ambiguous"
- Everything else is a pass — do not include it in your response
- Return ONLY valid JSON, no other text

Checklist items:
[{ "id": 1, "text": "All windowsills dusted", "category": "Bedroom/s", "room_label": "Bedroom 1" }, ...]

Transcript: "[transcript text]"

Return JSON in this exact format:
{
  "summary": "2-3 sentence plain English overview of what was found",
  "fails": [
    { "item_id": 1, "reason": "short phrase from transcript explaining why" }
  ],
  "ambiguous": [
    { "item_id": 2, "reason": "what was mentioned", "note": "why it's unclear which room/item" }
  ]
}
```

**Response to frontend:**
```json
{
  "summary": "...",
  "fails": [{ "item_id": 1, "reason": "..." }],
  "ambiguous": [{ "item_id": 2, "reason": "...", "note": "..." }]
}
```

---

## Frontend

### Voice Note card — `QCCheckForm.jsx`

Positioned at the top of the check form, above checklist sections. Hidden when `check.status === 'complete'`.

**Three states:**

**Idle:**
- Microphone icon + "Record Voice Note" button
- Subtext: "Walk through the property and describe any issues. AI will fill in the checklist for you."

**Recording:**
- Pulsing red dot + "Recording..." label
- Live transcript textarea (read-only, builds as manager speaks)
- "Stop" button
- Fallback: if `window.SpeechRecognition` and `window.webkitSpeechRecognition` are both unavailable, show an editable textarea so manager can type manually

**Done:**
- Transcript text displayed
- "Analyse with AI" button (primary)
- "Re-record" button (ghost) — clears transcript and returns to Idle state
- "Analysing..." loading state while waiting for backend

### Confirmation modal

Appears after `POST /voice-analyse` returns successfully.

**Sections:**
1. **Header:** "AI Checklist Analysis"
2. **Summary:** Plain text paragraph from Claude
3. **Will Fail** — list of items AI is confident about:
   - Each row: `[room_label] — [item text]` with reason in muted text below
   - Red left border
4. **Needs Your Input** — only rendered if `ambiguous.length > 0`:
   - Each row: item text + ambiguity note + toggle ("Mark as Fail" / "Leave as Pass")
   - Amber left border
   - Defaults to "Leave as Pass"
5. **Buttons:**
   - **Confirm & Apply** (primary) — calls `PUT /qc/checks/:id` with all scores, closes modal
   - **Edit Manually** (ghost) — closes modal, manager adjusts checklist items themselves

**Score application logic on Confirm:**
- All `fails` items: `score = 0` (pass_fail) or `score = 1` (1_to_5)
- Ambiguous items toggled to "Mark as Fail": same as above
- All other items: `score = 1` (pass_fail) or `score = 5` (1_to_5) — treated as pass
- This replaces all existing item scores for the check

---

## Settings page addition

New "Voice Analysis" section on the existing `/settings` page:

- **Default unmentioned items to:** dropdown — "Pass (recommended)" or "Leave unchanged"
  - "Pass": all items not in fails/ambiguous get set to pass score
  - "Leave unchanged": only fails/ambiguous items are updated; existing scores stay. Note: if the check has no prior scores, unmentioned items remain at 0 — manager should complete the rest of the checklist manually.
  - Stored as `voice_default_unmentioned` in the `settings` table, default `'pass'`
- Explanatory note: "Items not mentioned in your voice note are treated as passed. Switch to 'Leave unchanged' if you want to fill in the rest of the checklist manually."

---

## Web Speech API — Browser Support Notes

- Works on Chrome (desktop + Android), Safari (iOS 14.5+), Edge
- Does NOT work on Firefox
- Requires HTTPS (Railway deployment satisfies this)
- `continuous: true` mode used so recording doesn't auto-stop after silence
- `interimResults: true` so transcript builds live on screen
- Language set to `'en-NZ'` for NZ accent recognition

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Browser doesn't support Web Speech API | Show editable textarea fallback |
| Microphone permission denied | Show inline error: "Microphone access denied. Please allow microphone access and try again." |
| AI analysis fails (network/API error) | Show inline error below the Analyse button: "Analysis failed — please try again." |
| Claude returns malformed JSON | Backend returns 500 with error message, frontend shows same inline error |
| Empty transcript submitted | Frontend validation: disable "Analyse" button until transcript has at least 10 characters |

---

## Out of Scope
- Saving audio recordings (transcript only is saved)
- Staff portal access to voice notes
- Voice notes on property health checks (staff checks only for now)
- Multiple voice notes per check (one per check, re-record overwrites)
- Automatic check submission after AI confirm (manager still manually signs off)
