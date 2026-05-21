# Property Room Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store per-property room counts (bedrooms, bathrooms, etc.) and auto-apply them when creating a QC check so checkers never have to manually enter room sizes.

**Architecture:** Add a `room_config` JSON column to the `properties` table via the existing migrations pattern. Expose it via `PUT /properties/:id`. On the frontend, add a "Room Config" tab to the Properties page for editing, and update all three QC check creation modals (Dashboard, QCChecks, Properties) to pre-fill room counts from the selected property's config.

**Tech Stack:** Node.js/Express, better-sqlite3, React (no test framework — manual verification steps used throughout)

---

## File Map

| File | Change |
|------|--------|
| `backend/db.js` | Add migration for `room_config` column |
| `backend/routes/properties.js` | Accept + save `room_config` in `PUT /:id` |
| `frontend/src/pages/Properties.jsx` | Add Room Config tab; update `createCheck` to include `room_counts` |
| `frontend/src/pages/Dashboard.jsx` | Auto-fill `room_counts` when property selected in modal |
| `frontend/src/pages/QCChecks.jsx` | Auto-fill `room_counts` when property selected in modal |

---

## Task 1: DB migration — add `room_config` column

**Files:**
- Modify: `backend/db.js` (migrations array, lines ~194–201)

- [ ] **Step 1: Add the migration**

In `backend/db.js`, add one line to the `migrations` array:

```js
const migrations = [
  "ALTER TABLE qc_checklists  ADD COLUMN repeatable_sections TEXT DEFAULT '[]'",
  "ALTER TABLE qc_check_items ADD COLUMN room_label TEXT DEFAULT NULL",
  "ALTER TABLE qc_check_items ADD COLUMN na INTEGER DEFAULT 0",
  "ALTER TABLE qc_checklists  ADD COLUMN archived INTEGER DEFAULT 0",
  "ALTER TABLE properties      ADD COLUMN access_code TEXT DEFAULT NULL",
  "ALTER TABLE properties      ADD COLUMN inactive_until TEXT DEFAULT NULL",
  "ALTER TABLE staff            ADD COLUMN inactive_until TEXT DEFAULT NULL",
  "ALTER TABLE properties      ADD COLUMN room_config TEXT DEFAULT NULL",  // <-- add this
];
```

- [ ] **Step 2: Restart the backend and verify the column exists**

```bash
cd lca-qc-app
node -e "const db = require('./backend/db'); console.log(db.prepare('PRAGMA table_info(properties)').all().map(c => c.name));"
```

Expected output includes `"room_config"` in the array.

- [ ] **Step 3: Commit**

```bash
git add backend/db.js
git commit -m "feat: add room_config column to properties table"
```

---

## Task 2: Backend — accept `room_config` in PUT /properties/:id

**Files:**
- Modify: `backend/routes/properties.js`

- [ ] **Step 1: Update the PUT route to handle `room_config`**

Replace the existing `router.put('/:id', ...)` handler:

```js
router.put('/:id', (req, res) => {
  const { name, access_code, inactive_until, room_config } = req.body;
  if (name !== undefined) db.prepare('UPDATE properties SET name=? WHERE id=?').run(name, req.params.id);
  if (access_code !== undefined) db.prepare('UPDATE properties SET access_code=? WHERE id=?').run(access_code, req.params.id);
  if (inactive_until !== undefined) db.prepare('UPDATE properties SET inactive_until=? WHERE id=?').run(inactive_until || null, req.params.id);
  if (room_config !== undefined) db.prepare('UPDATE properties SET room_config=? WHERE id=?').run(JSON.stringify(room_config), req.params.id);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Verify manually with curl (or move on — tested in Task 3)**

Restart backend, then:

```bash
curl -s -X PUT http://localhost:3001/api/properties/1 \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"room_config": {"Bedroom": 3, "Bathroom": 2}}'
```

Expected: `{"ok":true}`

Then verify it saved:

```bash
curl -s http://localhost:3001/api/properties/1 -H "Cookie: <your-session-cookie>"
```

Expected: response includes `"room_config":"{\"Bedroom\":3,\"Bathroom\":2}"` (or parsed object).

- [ ] **Step 3: Commit**

```bash
git add backend/routes/properties.js
git commit -m "feat: accept room_config in PUT /properties/:id"
```

---

## Task 3: Frontend — Room Config tab on Properties page

**Files:**
- Modify: `frontend/src/pages/Properties.jsx`

The Properties page already has an `AccessDetailsTab` component as a pattern to follow. We add a `RoomConfigTab` component using the same structure.

- [ ] **Step 1: Add the `RoomConfigTab` component**

Insert this new component directly above the `export default function Properties()` line in `frontend/src/pages/Properties.jsx`:

```jsx
function RoomConfigTab({ properties, checklists }) {
  const [configs, setConfigs] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [search, setSearch] = useState('');

  // Get all repeatable sections from all checklists (deduplicated)
  const sections = [...new Set(
    checklists.flatMap(cl => cl.repeatable_sections || [])
  )];

  useEffect(() => {
    const initial = {};
    properties.forEach(p => {
      try { initial[p.id] = JSON.parse(p.room_config || '{}'); }
      catch { initial[p.id] = {}; }
    });
    setConfigs(initial);
  }, [properties, checklists]);

  const save = async (id) => {
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await api.put(`/properties/${id}`, { room_config: configs[id] });
      setSaved(s => ({ ...s, [id]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000);
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const setCount = (propId, section, val) => {
    setConfigs(c => ({ ...c, [propId]: { ...c[propId], [section]: parseInt(val) || 1 } }));
  };

  const sorted = [...properties]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  if (sections.length === 0) {
    return (
      <div className="card">
        <div className="card-header"><span className="card-title">Room Configuration</span></div>
        <p style={{ color: 'var(--t3)', padding: '16px 0' }}>No repeatable sections found. Add repeatable sections (e.g. Bedroom, Bathroom) to a checklist first.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Room Configuration</span>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>Set room counts per property — auto-applied when starting a QC check.</span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 300 }}
          placeholder="Search properties…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '35%' }}>Property</th>
              {sections.map(s => <th key={s}>{s}s</th>)}
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 700 }}>{p.name}</td>
                {sections.map(section => (
                  <td key={section}>
                    <input
                      type="number" min="1" max="20"
                      className="form-input"
                      style={{ padding: '6px 10px', fontSize: 13, width: 70 }}
                      value={configs[p.id]?.[section] ?? 1}
                      onChange={e => setCount(p.id, section, e.target.value)}
                      onBlur={() => save(p.id)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    />
                  </td>
                ))}
                <td>
                  {saving[p.id]
                    ? <span style={{ fontSize: 12, color: 'var(--t3)' }}>Saving…</span>
                    : saved[p.id]
                    ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Room Config" tab button**

Find the tab row in `Properties.jsx` (around the `tab-row` div with Overview, Health Checks, Access Details):

```jsx
<div className="tab-row">
  <button className={`tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
  <button className={`tab-btn${tab === 'qc' ? ' active' : ''}`} onClick={() => setTab('qc')}>Health Checks</button>
  <button className={`tab-btn${tab === 'access' ? ' active' : ''}`} onClick={() => setTab('access')}>Access Details</button>
  <button className={`tab-btn${tab === 'roomconfig' ? ' active' : ''}`} onClick={() => setTab('roomconfig')}>Room Config</button>
</div>
```

- [ ] **Step 3: Add the tab content render**

After the `{tab === 'access' && <AccessDetailsTab ... />}` block, add:

```jsx
{tab === 'roomconfig' && (
  <RoomConfigTab properties={properties} checklists={checklists} />
)}
```

- [ ] **Step 4: Verify in browser**

- Navigate to Properties page
- Click "Room Config" tab
- You should see a table with all properties and a column per repeatable section (e.g. Bedrooms, Bathrooms)
- Change a value and click away — should show "✓ Saved"
- Refresh and confirm the value persisted

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Properties.jsx
git commit -m "feat: add Room Config tab to Properties page"
```

---

## Task 4: Auto-fill room counts in Dashboard modal

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

The Dashboard modal currently has no `room_counts` in its `checkForm` and no room count inputs. We need to: (a) add `room_counts` to state, (b) auto-fill from property config when property is selected, (c) show the room count inputs in the modal, (d) include `room_counts` in the create payload.

- [ ] **Step 1: Update `checkForm` initial state to include `room_counts`**

Find line ~36:
```js
const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: today });
```

Change to:
```js
const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: today, room_counts: {} });
```

- [ ] **Step 2: Add a helper to compute room_counts from a property and checklist**

Insert this helper function inside the `Dashboard` component, before `openCreate`:

```js
const buildRoomCounts = (propertyId, checklistId) => {
  const prop = properties.find(p => String(p.id) === String(propertyId));
  const cl = checklists.find(c => String(c.id) === String(checklistId));
  const rs = cl?.repeatable_sections || [];
  let saved = {};
  try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
  return Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
};
```

- [ ] **Step 3: Update `openCreate` to set `room_counts`**

Find the `openCreate` function and update `setCheckForm` inside it:

```js
const openCreate = async (preselect = {}, type = 'staff') => {
  const freshCL = await api.get('/qc/checklists').then(r => r.data).catch(() => checklists);
  setChecklists(freshCL);
  setCreateType(type);
  const defaultCL = freshCL.find(cl => cl.default_for === type);
  const checklistId = defaultCL ? String(defaultCL.id) : '';
  const propertyId = String(preselect.property_id || '');
  const room_counts = checklistId && propertyId
    ? (() => {
        const prop = properties.find(p => String(p.id) === propertyId);
        const cl = freshCL.find(c => String(c.id) === checklistId);
        const rs = cl?.repeatable_sections || [];
        let saved = {};
        try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
        return Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
      })()
    : {};
  setCheckForm({
    property_id: propertyId,
    staff_id: String(preselect.staff_id || ''),
    checklist_id: checklistId,
    assigned_to_id: String(manager.id),
    date: today,
    room_counts,
  });
  setShowCreate(true);
};
```

- [ ] **Step 4: Add property onChange to also update room_counts**

Find the property `<select>` in the modal JSX (around line 521). Update its `onChange`:

```jsx
<select
  className="form-select"
  value={checkForm.property_id}
  onChange={e => {
    const propertyId = e.target.value;
    const prop = properties.find(p => String(p.id) === propertyId);
    const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
    const rs = cl?.repeatable_sections || [];
    let saved = {};
    try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
    const room_counts = Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
    setCheckForm(f => ({ ...f, property_id: propertyId, room_counts }));
  }}
>
  <option value="">Select property…</option>
  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
</select>
```

- [ ] **Step 5: Add room count inputs to the modal**

After the checklist `<select>` form-group and before the Assign To form-group in the modal, add:

```jsx
{checkForm.checklist_id && (() => {
  const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
  const rs = cl?.repeatable_sections || [];
  if (rs.length === 0) return null;
  return (
    <div className="card mb-2" style={{ padding: '14px 16px', background: 'var(--bg)' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--t2)' }}>Property room counts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {rs.map(section => (
          <div key={section}>
            <label className="form-label" style={{ fontSize: 12 }}>{section}s</label>
            <input
              type="number" min="1" max="20"
              className="form-input"
              value={checkForm.room_counts[section] ?? 1}
              onChange={e => setCheckForm(f => ({ ...f, room_counts: { ...f.room_counts, [section]: parseInt(e.target.value) || 1 } }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 6: Verify in browser**

- Click "Start Team QC Check" on the Dashboard
- Select a property that has room config saved
- Confirm the room count inputs appear pre-filled with the saved values
- Change a value to confirm manual override still works
- Create the check and verify the correct number of room sections appear in the check form

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: auto-fill room counts from property config in Dashboard modal"
```

---

## Task 5: Auto-fill room counts in QCChecks modal

**Files:**
- Modify: `frontend/src/pages/QCChecks.jsx`

The QCChecks modal already has room count inputs and a `handleChecklistChange` helper. We just need to also update room counts when the property changes.

- [ ] **Step 1: Check that `properties` is loaded in QCChecks**

Find the data loading at the top of `QCChecks.jsx`. Confirm `properties` state exists and is populated from `api.get('/properties')`. If it doesn't exist yet, add it:

```js
const [properties, setProperties] = useState([]);
// in the load function:
api.get('/properties').then(r => setProperties(r.data));
```

- [ ] **Step 2: Update the property `<select>` onChange in QCChecks modal**

Find the property `<select>` in the QCChecks new check modal. Update its `onChange` to also update `room_counts`:

```jsx
<select
  className="form-select"
  value={checkForm.property_id}
  onChange={e => {
    const propertyId = e.target.value;
    const prop = properties.find(p => String(p.id) === propertyId);
    const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
    const rs = cl?.repeatable_sections || [];
    let saved = {};
    try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
    const room_counts = Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
    setCheckForm(f => ({ ...f, property_id: propertyId, room_counts }));
  }}
>
  <option value="">Select property…</option>
  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
</select>
```

- [ ] **Step 3: Update `handleChecklistChange` to also respect saved property config**

The current `handleChecklistChange` resets all room counts to 1. Update it to seed from the selected property's `room_config` instead:

```js
const handleChecklistChange = (checklist_id) => {
  const cl = checklists.find(c => String(c.id) === String(checklist_id));
  const rs = cl?.repeatable_sections || [];
  const prop = properties.find(p => String(p.id) === String(checkForm.property_id));
  let saved = {};
  try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
  const room_counts = Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
  setCheckForm(f => ({ ...f, checklist_id, room_counts }));
};
```

- [ ] **Step 4: Verify in browser**

- Go to QC Checks page and click "+ New QC Check"
- Select a property that has room config saved
- Confirm room counts pre-fill with the saved values
- Change the property to a different one — room counts should update to that property's config

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/QCChecks.jsx
git commit -m "feat: auto-fill room counts from property config in QC Checks modal"
```

---

## Task 6: Auto-fill room counts in Properties page modal

**Files:**
- Modify: `frontend/src/pages/Properties.jsx`

The Properties page has a "New Property Health Check" modal. It currently has no room count inputs at all.

- [ ] **Step 1: Add `room_counts` to `checkForm` state**

Find line ~99:
```js
const [checkForm, setCheckForm] = useState({ property_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });
```

Change to:
```js
const [checkForm, setCheckForm] = useState({ property_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '', room_counts: {} });
```

- [ ] **Step 2: Update `createCheck` to include `room_counts` in payload**

Find `createCheck` (line ~128):
```js
const createCheck = async () => {
  const { property_id, checklist_id, assigned_to_id, date } = checkForm;
  if (!property_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
  const r = await api.post('/qc/checks', { ...checkForm, staff_id: null, check_type: 'property' });
  setShowModal(false);
  navigate(`/qc/checks/${r.data.id}`);
};
```

No change needed here — `{ ...checkForm }` already spreads `room_counts` in. Just confirm it's there.

- [ ] **Step 3: Add property onChange to update room_counts in the modal**

Find the property `<select>` in the modal (line ~287). Update its `onChange`:

```jsx
<select
  className="form-select"
  value={checkForm.property_id}
  onChange={e => {
    const propertyId = e.target.value;
    const prop = properties.find(p => String(p.id) === propertyId);
    const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
    const rs = cl?.repeatable_sections || [];
    let saved = {};
    try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
    const room_counts = Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
    setCheckForm(f => ({ ...f, property_id: propertyId, room_counts }));
  }}
>
  <option value="">Select property…</option>
  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
</select>
```

- [ ] **Step 4: Add checklist onChange to also update room_counts**

Find the checklist `<select>` in the modal (line ~294). Update its `onChange`:

```jsx
<select
  className="form-select"
  value={checkForm.checklist_id}
  onChange={e => {
    const checklistId = e.target.value;
    const cl = checklists.find(c => String(c.id) === checklistId);
    const rs = cl?.repeatable_sections || [];
    const prop = properties.find(p => String(p.id) === String(checkForm.property_id));
    let saved = {};
    try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
    const room_counts = Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
    setCheckForm(f => ({ ...f, checklist_id: checklistId, room_counts }));
  }}
>
  <option value="">Select checklist…</option>
  {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
</select>
```

- [ ] **Step 5: Add room count inputs to the Properties page modal**

After the checklist form-group and before the Assign To form-group in the modal, add:

```jsx
{checkForm.checklist_id && (() => {
  const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
  const rs = cl?.repeatable_sections || [];
  if (rs.length === 0) return null;
  return (
    <div className="card mb-2" style={{ padding: '14px 16px', background: 'var(--bg)' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--t2)' }}>Property room counts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {rs.map(section => (
          <div key={section}>
            <label className="form-label" style={{ fontSize: 12 }}>{section}s</label>
            <input
              type="number" min="1" max="20"
              className="form-input"
              value={checkForm.room_counts[section] ?? 1}
              onChange={e => setCheckForm(f => ({ ...f, room_counts: { ...f.room_counts, [section]: parseInt(e.target.value) || 1 } }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 6: Verify in browser**

- Go to Properties page and click "+ New Property Health Check"
- Select a property and checklist
- Confirm room counts pre-fill correctly
- Create the check and confirm the right number of room sections appear

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Properties.jsx
git commit -m "feat: auto-fill room counts in Properties page health check modal"
```

---

## Task 7: Push to Railway

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Verify on Railway**

Wait ~1 minute for deploy, then:
- Set room config for a property on the Room Config tab
- Start a QC check from the Dashboard for that property
- Confirm room counts pre-fill correctly
