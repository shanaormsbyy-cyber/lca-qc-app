# Voice Note AI Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers record a voice note while walking through a property, then have Claude automatically fill in the QC checklist based on what was described.

**Architecture:** Three parts — (1) a DB migration adding `voice_transcript` to `qc_checks` and a `voice_default_unmentioned` setting, (2) a new `POST /qc/checks/:id/voice-analyse` backend endpoint that calls Claude and returns structured fails/ambiguous/summary, (3) a `VoiceNoteCard` React component added to `QCCheckForm.jsx` that handles recording, transcript, AI call, confirmation modal, and score application.

**Tech Stack:** Node.js/Express, better-sqlite3, Anthropic API (claude-haiku-4-5-20251001), React (JSX), Web Speech API (`webkitSpeechRecognition`), existing CSS vars and classes.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/server.js` | Modify | Add auto-migrations for `voice_transcript` column + `voice_default_unmentioned` default setting |
| `backend/routes/qc.js` | Modify | Add `POST /checks/:id/voice-analyse` endpoint |
| `frontend/src/pages/QCCheckForm.jsx` | Modify | Add VoiceNoteCard component and confirmation modal |
| `frontend/src/pages/Settings.jsx` | Modify | Add Voice Analysis settings section |

---

## Task 1: DB migration — voice_transcript column + setting

**Files:**
- Modify: `lca-qc-app/backend/server.js`

- [ ] **Step 1: Add migration block**

Read `backend/server.js`. Find the existing warnings migration block (starts with `// Auto-migrate: warnings tables`). Add a NEW migration block directly AFTER it (before the route mounts):

```js
// Auto-migrate: voice_transcript column on qc_checks
{
  const s = db.prepare('PRAGMA table_info(qc_checks)');
  const cols = s.all();
  s.finalize();
  if (!cols.find(c => c.name === 'voice_transcript')) {
    db.exec('ALTER TABLE qc_checks ADD COLUMN voice_transcript TEXT');
    console.log('Migration complete: added voice_transcript column to qc_checks.');
  }
}
```

Also add the default setting in `db.js`. Read `backend/db.js`, find the block of `insertSetting.run(...)` calls and add at the end:

```js
insertSetting.run('voice_default_unmentioned', 'pass');
```

- [ ] **Step 2: Verify migration runs cleanly**

```bash
cd lca-qc-app && node -e "require('./backend/db.js'); console.log('db ok')"
```

Expected: `db ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js backend/db.js
git commit -m "feat: add voice_transcript migration and voice_default_unmentioned setting"
```

---

## Task 2: Backend — voice-analyse endpoint

**Files:**
- Modify: `lca-qc-app/backend/routes/qc.js`

- [ ] **Step 1: Add the endpoint**

Read `backend/routes/qc.js`. Find the line `router.delete('/checks/:id', ...)` near the bottom. Add the following route BEFORE it:

```js
// POST /qc/checks/:id/voice-analyse — AI maps voice transcript to checklist items
router.post('/checks/:id/voice-analyse', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured — set ANTHROPIC_API_KEY' });

  const { transcript } = req.body;
  if (!transcript || transcript.trim().length < 10) {
    return res.status(400).json({ error: 'Transcript is too short' });
  }

  // Fetch check + items
  const check = db.prepare('SELECT * FROM qc_checks WHERE id = ?').get(req.params.id);
  if (!check) return res.status(404).json({ error: 'Check not found' });

  const items = db.prepare(`
    SELECT qci.id, qci.item_id, qi.text, qi.score_type, qi.weight,
      COALESCE(qci.room_label, qi.category) as room_label,
      qi.category
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    WHERE qci.check_id = ?
    ORDER BY qci.id
  `).all(req.params.id);

  // Save transcript to DB
  db.prepare('UPDATE qc_checks SET voice_transcript = ? WHERE id = ?').run(transcript.trim(), req.params.id);

  // Build item list for prompt
  const itemList = items.map(i => ({
    id: i.id,
    text: i.text,
    room_label: i.room_label || i.category || 'General',
  }));

  const prompt = `You are a QC inspection assistant for a professional cleaning company. A manager has walked through a property and recorded a voice note describing issues they found during their inspection.

Your job is to map their observations to specific checklist items.

Rules:
- If an item is clearly mentioned as an issue in the transcript, add it to "fails"
- If the transcript mentions something that could match an item but the specific room/area is unclear (e.g. "bedroom" when there are multiple bedroom sections like "Bedroom 1", "Bedroom 2"), add it to "ambiguous"
- Everything else is considered passed — do not include passed items in your response
- Return ONLY valid JSON, no explanation, no markdown, no other text

Checklist items (use the "id" field in your response):
${JSON.stringify(itemList, null, 2)}

Voice note transcript:
"${transcript.trim()}"

Return JSON in this exact format:
{
  "summary": "2-3 sentence plain English overview of what was found and what will be failed",
  "fails": [
    { "item_id": 123, "reason": "short phrase from transcript explaining the issue" }
  ],
  "ambiguous": [
    { "item_id": 456, "reason": "what was mentioned in the transcript", "note": "brief explanation of why it is unclear which room or item this refers to" }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'AI request failed' });

    const text = data.content?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'AI returned malformed response — please try again.' });
    }

    res.json({
      summary: parsed.summary || '',
      fails: parsed.fails || [],
      ambiguous: parsed.ambiguous || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Verify the endpoint is reachable**

Start the backend locally and confirm no syntax errors:

```bash
node -e "require('./backend/routes/qc.js'); console.log('qc routes ok')"
```

Expected: `qc routes ok`

- [ ] **Step 3: Commit**

```bash
git add backend/routes/qc.js
git commit -m "feat: add POST /qc/checks/:id/voice-analyse endpoint"
```

---

## Task 3: Frontend — VoiceNoteCard component in QCCheckForm

**Files:**
- Modify: `lca-qc-app/frontend/src/pages/QCCheckForm.jsx`

This is the largest task. Read the full file before making changes to understand the current structure. The component state declarations start around line 34, the `return (` is around line 399, and the `<div className="page">` wraps everything.

- [ ] **Step 1: Add voice-related state**

Find the existing state declarations block (lines ~34-46). After `const [openSections, setOpenSections] = useState(new Set());`, add:

```jsx
// Voice note state
const [voiceState, setVoiceState] = useState('idle'); // 'idle' | 'recording' | 'done'
const [transcript, setTranscript] = useState('');
const [voiceAnalysing, setVoiceAnalysing] = useState(false);
const [voiceError, setVoiceError] = useState('');
const [voiceResult, setVoiceResult] = useState(null); // { summary, fails, ambiguous }
const [ambiguousChoices, setAmbiguousChoices] = useState({}); // { item_id: 'fail' | 'pass' }
const [showVoiceModal, setShowVoiceModal] = useState(false);
const speechRef = useRef(null);
```

- [ ] **Step 2: Add voice helper functions**

After the `deleteCheck` function (around line 161) and before the `save` function, add:

```jsx
const startRecording = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setVoiceState('done'); // fall through to manual textarea
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-NZ';
  let finalText = '';
  recognition.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    setTranscript(finalText + interim);
  };
  recognition.onerror = e => {
    if (e.error === 'not-allowed') setVoiceError('Microphone access denied. Please allow microphone access and try again.');
    setVoiceState('idle');
  };
  recognition.onend = () => {
    setTranscript(t => t.trim());
    setVoiceState('done');
  };
  speechRef.current = recognition;
  recognition.start();
  setVoiceState('recording');
  setVoiceError('');
};

const stopRecording = () => {
  speechRef.current?.stop();
};

const analyseVoice = async () => {
  if (transcript.trim().length < 10) return;
  setVoiceAnalysing(true);
  setVoiceError('');
  try {
    const r = await api.post(`/qc/checks/${id}/voice-analyse`, { transcript });
    setVoiceResult(r.data);
    const choices = {};
    (r.data.ambiguous || []).forEach(a => { choices[a.item_id] = 'pass'; });
    setAmbiguousChoices(choices);
    setShowVoiceModal(true);
  } catch {
    setVoiceError('Analysis failed — please try again.');
  } finally {
    setVoiceAnalysing(false);
  }
};

const applyVoiceScores = () => {
  const failIds = new Set([
    ...(voiceResult.fails || []).map(f => f.item_id),
    ...Object.entries(ambiguousChoices).filter(([, v]) => v === 'fail').map(([k]) => parseInt(k)),
  ]);

  setItems(prev => prev.map(item => {
    if (item.na) return item;
    if (failIds.has(item.id)) {
      return { ...item, score: item.score_type === 'pass_fail' ? 0 : 1 };
    }
    // unmentioned — set to pass (score_type determines pass value)
    return { ...item, score: item.score_type === 'pass_fail' ? 1 : 5 };
  }));

  setShowVoiceModal(false);
  setVoiceResult(null);
};
```

- [ ] **Step 3: Add the VoiceNoteCard JSX**

Find the `return (` of the component. The JSX starts with `<div className="page">` then a back button then the check header. Find the score card block that starts with:

```jsx
<div className="card mb-6" style={{ padding: '16px 20px' }}>
```

Insert the Voice Note card BEFORE that score card (so it appears at the very top, below the back button and header):

```jsx
      {/* Voice Note Card — only shown on pending checks or when editing */}
      {(check.status !== 'complete' || editingComplete) && (
        <div className="card mb-4" style={{ padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Voice Note</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
            Walk through the property and describe any issues aloud. AI will fill in the checklist for you.
          </div>

          {voiceError && (
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{voiceError}</div>
          )}

          {voiceState === 'idle' && (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 18 }}>🎙️</span> Record Voice Note
            </button>
          )}

          {voiceState === 'recording' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%', background: 'var(--red)',
                  animation: 'pulse 1s infinite',
                  display: 'inline-block',
                }} />
                <span style={{ fontWeight: 700, color: 'var(--red)', fontSize: 14 }}>Recording...</span>
              </div>
              {transcript && (
                <div style={{
                  fontSize: 13, color: 'var(--t2)', background: 'var(--navy2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 12, minHeight: 60, lineHeight: 1.6,
                }}>
                  {transcript}
                </div>
              )}
              <button className="btn btn-danger" onClick={stopRecording}>⏹ Stop</button>
            </div>
          )}

          {voiceState === 'done' && (
            <div>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={4}
                style={{
                  width: '100%', fontSize: 13, color: 'var(--t1)', background: 'var(--navy2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 12, lineHeight: 1.6, resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                placeholder="Your transcript appears here. You can also type observations manually."
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={analyseVoice}
                  disabled={voiceAnalysing || transcript.trim().length < 10}
                >
                  {voiceAnalysing ? 'Analysing...' : '✨ Analyse with AI'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setVoiceState('idle'); setTranscript(''); setVoiceError(''); }}
                >
                  Re-record
                </button>
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Add the confirmation modal JSX**

Find the existing photo picker modal at the bottom of the JSX (starts with `{photoPickerItem !== null && (`). Add the voice confirmation modal BEFORE it:

```jsx
      {/* Voice Analysis Confirmation Modal */}
      {showVoiceModal && voiceResult && (
        <div className="modal-overlay" onClick={() => setShowVoiceModal(false)}>
          <div className="modal" style={{ maxWidth: 580, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">AI Checklist Analysis</div>

            {/* Summary */}
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 20 }}>
              {voiceResult.summary}
            </p>

            {/* Will Fail */}
            {voiceResult.fails.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 10 }}>
                  Will Fail ({voiceResult.fails.length} item{voiceResult.fails.length !== 1 ? 's' : ''})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {voiceResult.fails.map(f => {
                    const item = items.find(i => i.id === f.item_id);
                    if (!item) return null;
                    return (
                      <div key={f.item_id} style={{
                        padding: '8px 12px', borderRadius: 8,
                        border: '1px solid rgba(239,68,68,0.3)',
                        background: 'rgba(239,68,68,0.07)',
                        borderLeft: '3px solid var(--red)',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {item.room_label || item.category} — {item.text}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{f.reason}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ambiguous */}
            {voiceResult.ambiguous.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 10 }}>
                  Needs Your Input ({voiceResult.ambiguous.length} item{voiceResult.ambiguous.length !== 1 ? 's' : ''})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {voiceResult.ambiguous.map(a => {
                    const item = items.find(i => i.id === a.item_id);
                    if (!item) return null;
                    const choice = ambiguousChoices[a.item_id] || 'pass';
                    return (
                      <div key={a.item_id} style={{
                        padding: '8px 12px', borderRadius: 8,
                        border: '1px solid rgba(245,158,11,0.3)',
                        background: 'rgba(245,158,11,0.07)',
                        borderLeft: '3px solid var(--amber)',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                          {item.room_label || item.category} — {item.text}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>{a.note}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setAmbiguousChoices(c => ({ ...c, [a.item_id]: 'fail' }))}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                              border: '1px solid var(--red)',
                              background: choice === 'fail' ? 'var(--red)' : 'transparent',
                              color: choice === 'fail' ? '#fff' : 'var(--red)',
                            }}
                          >Mark as Fail</button>
                          <button
                            onClick={() => setAmbiguousChoices(c => ({ ...c, [a.item_id]: 'pass' }))}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                              border: '1px solid var(--border)',
                              background: choice === 'pass' ? 'var(--border)' : 'transparent',
                              color: 'var(--t2)',
                            }}
                          >Leave as Pass</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {voiceResult.fails.length === 0 && voiceResult.ambiguous.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--green)', marginBottom: 20 }}>
                ✓ No issues found in the transcript — all items will be marked as passed.
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={applyVoiceScores}>
                Confirm & Apply
              </button>
              <button className="btn btn-ghost" onClick={() => setShowVoiceModal(false)}>
                Edit Manually
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/QCCheckForm.jsx
git commit -m "feat: add voice note recording, AI analysis, and confirmation modal to QC check form"
```

---

## Task 4: Settings page — voice analysis section

**Files:**
- Modify: `lca-qc-app/frontend/src/pages/Settings.jsx`

- [ ] **Step 1: Add voice setting to state**

Read `frontend/src/pages/Settings.jsx`. Find the `qcSettings` state object (around line 17). Add `voice_default_unmentioned: 'pass'` to it:

```jsx
const [qcSettings, setQcSettings] = useState({
  qc_freq_staff_days: '30',
  qc_freq_property_days: '14',
  watchlist_threshold: '90',
  top_performers_threshold: '90',
  top_performers_min_checks: '3',
  heatpump_freq_days: '90',
  flag_min_count: '3',
  flag_moderate_min: '3',
  flag_moderate_max: '4',
  flag_major_min: '5',
  flag_major_max: '7',
  flag_urgent_min: '8',
  voice_default_unmentioned: 'pass',
});
```

- [ ] **Step 2: Add Voice Analysis card to JSX**

Find the last `</div>` that closes the final settings card before the `</div>` closing the page. Add a new card directly before the closing `</div>` of the page:

```jsx
      {/* Voice Analysis Settings */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Voice Analysis</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.6 }}>
          When a manager uses the Voice Note feature to fill in a QC checklist, items not mentioned in the voice note can either be automatically passed or left unchanged.
        </div>
        <div className="form-row mb-4">
          <div className="form-group">
            <label className="form-label">Default unmentioned items to</label>
            <select
              className="form-select"
              value={qcSettings.voice_default_unmentioned}
              onChange={e => setSetting('voice_default_unmentioned', e.target.value)}
            >
              <option value="pass">Pass (recommended)</option>
              <option value="leave">Leave unchanged</option>
            </select>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
              {qcSettings.voice_default_unmentioned === 'pass'
                ? 'Items not mentioned will be marked as passed. Use this when the voice note covers the full walkthrough.'
                : 'Only mentioned items will be updated. Use this when you want to manually complete the rest of the checklist.'}
            </div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={saveQcSettings}>
          {settingsSaved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
```

- [ ] **Step 3: Update applyVoiceScores to respect the setting**

The current `applyVoiceScores` in `QCCheckForm.jsx` always passes unmentioned items. We need to respect the `voice_default_unmentioned` setting. This requires reading the setting from the API.

In `QCCheckForm.jsx`, add a `voiceSetting` state after the other voice states:

```jsx
const [voiceDefaultUnmentioned, setVoiceDefaultUnmentioned] = useState('pass');
```

In the existing `useEffect(() => { load(true); }, [id]);`, after `load(true)` is called, add a settings fetch. Find the existing useEffect and change it to:

```jsx
useEffect(() => {
  load(true);
  api.get('/scheduling/settings').then(r => {
    setVoiceDefaultUnmentioned(r.data.voice_default_unmentioned || 'pass');
  }).catch(() => {});
}, [id]);
```

Then update `applyVoiceScores` to use `voiceDefaultUnmentioned`:

```jsx
const applyVoiceScores = () => {
  const failIds = new Set([
    ...(voiceResult.fails || []).map(f => f.item_id),
    ...Object.entries(ambiguousChoices).filter(([, v]) => v === 'fail').map(([k]) => parseInt(k)),
  ]);

  setItems(prev => prev.map(item => {
    if (item.na) return item;
    if (failIds.has(item.id)) {
      return { ...item, score: item.score_type === 'pass_fail' ? 0 : 1 };
    }
    if (voiceDefaultUnmentioned === 'pass') {
      return { ...item, score: item.score_type === 'pass_fail' ? 1 : 5 };
    }
    return item; // leave unchanged
  }));

  setShowVoiceModal(false);
  setVoiceResult(null);
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Settings.jsx frontend/src/pages/QCCheckForm.jsx
git commit -m "feat: add voice analysis settings and wire default-unmentioned behaviour"
```

---

## Task 5: Push and verify

- [ ] **Step 1: Push to Railway**

```bash
git push origin main
```

- [ ] **Step 2: Manual verification checklist**

Once Railway redeploys, open a QC check in pending status and verify:

1. Voice Note card appears at top of form
2. Click "Record Voice Note" — browser asks for microphone permission
3. Speak: "The kitchen bin liner hasn't been changed and the bathroom mirror has streaks" — transcript builds live
4. Click Stop — transcript is shown in editable textarea
5. Click "Analyse with AI" — loading state shows
6. Confirmation modal appears with summary, fails list
7. Click "Confirm & Apply" — checklist items update, modal closes
8. Re-open form — failed items show as failed, others show as passed
9. Complete check status = voice note card is hidden

- [ ] **Step 3: Verify fallback (optional — Firefox or private mode)**

Open in a browser without Web Speech API support. Voice Note card should show "Record" button, clicking it should immediately show the textarea fallback for manual input.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered by |
|---|---|
| `voice_transcript` column on `qc_checks` | Task 1 |
| `voice_default_unmentioned` setting | Task 1 + Task 4 |
| `POST /qc/checks/:id/voice-analyse` endpoint | Task 2 |
| Claude prompt with item list + transcript | Task 2 |
| Saves transcript to DB | Task 2 |
| Returns summary/fails/ambiguous | Task 2 |
| Voice Note card with idle/recording/done states | Task 3 |
| Live transcript via Web Speech API | Task 3 |
| `continuous: true`, `interimResults: true`, `lang: 'en-NZ'` | Task 3 |
| Fallback textarea when no Web Speech API | Task 3 (voiceState='done' skips to textarea when SpeechRecognition unavailable) |
| Microphone denied error | Task 3 (`recognition.onerror`) |
| Min 10 chars before Analyse enabled | Task 3 (disabled condition on button) |
| Confirmation modal with summary | Task 3 |
| Will Fail section (red border, room+item+reason) | Task 3 |
| Needs Your Input section (amber border, toggle) | Task 3 |
| Ambiguous defaults to "Leave as Pass" | Task 3 (`choices[a.item_id] = 'pass'`) |
| Confirm & Apply applies scores | Task 3 + Task 4 |
| Edit Manually closes modal | Task 3 |
| Hidden when check is complete | Task 3 (condition on card render) |
| Settings Voice Analysis section | Task 4 |
| `voice_default_unmentioned` respected in score apply | Task 4 |
| Analysis error shown inline | Task 3 (`voiceError` state) |

All spec requirements covered. No placeholders found.
