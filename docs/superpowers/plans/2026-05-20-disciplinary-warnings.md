# Disciplinary Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a disciplinary warnings system — managers issue warnings linked to QC checks, staff acknowledge them on their portal, managers see overdue flags.

**Architecture:** New `warnings` route on the backend (Express/SQLite), three new DB tables created via auto-migration in `server.js`, two new frontend pages (`Disciplinary` list + `WarningDetail`), staff portal dashboard extended with a warnings section, and staff profile extended with a warnings count + list.

**Tech Stack:** Node.js/Express, better-sqlite3, React (JSX), React Router v6, existing CSS vars and component classes.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/server.js` | Modify | Add auto-migrations for 3 new tables + mount `/api/warnings` route |
| `backend/routes/warnings.js` | Create | All manager warning CRUD + staff portal warning routes |
| `frontend/src/App.jsx` | Modify | Add `/disciplinary` and `/disciplinary/:id` routes |
| `frontend/src/components/Layout.jsx` | Modify | Add "Disciplinary" nav item |
| `frontend/src/pages/Disciplinary.jsx` | Create | Manager warnings list page |
| `frontend/src/pages/WarningDetail.jsx` | Create | Manager warning detail + edit + history |
| `frontend/src/pages/StaffProfile.jsx` | Modify | Add warnings stat card + warnings list at bottom |
| `frontend/src/pages/StaffPortalDashboard.jsx` | Modify | Add warnings section between trend and flagged issues |

---

## Task 1: DB migrations — three new tables

**Files:**
- Modify: `lca-qc-app/backend/server.js` (after the last auto-migrate block, before the route mounts)

- [ ] **Step 1: Add the three auto-migration blocks**

Find the line `app.use('/api/auth', ...)` in `server.js`. Directly above it, add:

```js
// Auto-migrate: warnings tables
{
  const cols = db.prepare('PRAGMA table_info(warnings)').all();
  if (cols.length === 0) {
    db.exec(`
      CREATE TABLE warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        level TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        corrective_actions TEXT NOT NULL DEFAULT '',
        issued_by TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        acknowledged_at TEXT,
        acknowledged_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE warning_check_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warning_id INTEGER NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
        check_id INTEGER NOT NULL REFERENCES qc_checks(id) ON DELETE CASCADE
      );
      CREATE TABLE warning_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warning_id INTEGER NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
        edited_by TEXT NOT NULL,
        edited_at TEXT NOT NULL,
        prev_level TEXT NOT NULL,
        prev_reason TEXT NOT NULL,
        prev_details TEXT NOT NULL,
        prev_corrective_actions TEXT NOT NULL
      );
    `);
    console.log('Migration complete: created warnings, warning_check_links, warning_edits tables.');
  }
}
```

- [ ] **Step 2: Restart the backend and verify migration ran**

```bash
cd lca-qc-app && node backend/server.js
```

Expected in console: `Migration complete: created warnings, warning_check_links, warning_edits tables.`

On second restart the message should NOT appear (idempotent).

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat: add warnings DB migration (warnings, warning_check_links, warning_edits tables)"
```

---

## Task 2: Backend — manager warnings routes

**Files:**
- Create: `lca-qc-app/backend/routes/warnings.js`
- Modify: `lca-qc-app/backend/server.js` (add route mount)

- [ ] **Step 1: Create `backend/routes/warnings.js`**

```js
const express = require('express');
const db = require('../db');
const { requireAuth, requireStaffAuth } = require('../middleware/auth');

const router = express.Router();

// Helper: compute acknowledgement status for a warning row
function ackStatus(w) {
  if (w.acknowledged_at) return 'acknowledged';
  const days = Math.floor((Date.now() - new Date(w.issued_at)) / 86400000);
  return days >= 3 ? 'overdue' : 'pending';
}

// Helper: fetch linked check summaries for a warning
function linkedChecks(warningId) {
  return db.prepare(`
    SELECT qc.id, qc.date, qc.score_pct, p.name as property_name
    FROM warning_check_links wcl
    JOIN qc_checks qc ON qc.id = wcl.check_id
    JOIN properties p ON p.id = qc.property_id
    WHERE wcl.warning_id = ?
    ORDER BY qc.date DESC
  `).all(warningId);
}

// ── Manager routes ────────────────────────────────────────────────────────────

// GET /api/warnings — list all warnings, optional ?staff_id=
router.get('/', requireAuth, (req, res) => {
  const { staff_id } = req.query;
  const rows = db.prepare(`
    SELECT w.*, s.name as staff_name
    FROM warnings w
    JOIN staff s ON s.id = w.staff_id
    ${staff_id ? 'WHERE w.staff_id = ?' : ''}
    ORDER BY w.issued_at DESC
  `).all(...(staff_id ? [staff_id] : []));

  res.json(rows.map(w => ({ ...w, ack_status: ackStatus(w) })));
});

// GET /api/warnings/:id — full detail with linked checks + edit history
router.get('/:id', requireAuth, (req, res) => {
  const w = db.prepare(`
    SELECT w.*, s.name as staff_name
    FROM warnings w
    JOIN staff s ON s.id = w.staff_id
    WHERE w.id = ?
  `).get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });

  const checks = linkedChecks(w.id);
  const edits = db.prepare('SELECT * FROM warning_edits WHERE warning_id = ? ORDER BY edited_at DESC').all(w.id);

  res.json({ ...w, ack_status: ackStatus(w), linked_checks: checks, edit_history: edits });
});

// POST /api/warnings — create warning
router.post('/', requireAuth, (req, res) => {
  const { staff_id, level, reason, details, corrective_actions, check_ids } = req.body;
  if (!staff_id || !level || !reason) {
    return res.status(400).json({ error: 'staff_id, level, and reason are required' });
  }
  const validLevels = ['verbal_note', 'written_warning', 'final_warning'];
  if (!validLevels.includes(level)) {
    return res.status(400).json({ error: 'Invalid level' });
  }

  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO warnings (staff_id, level, reason, details, corrective_actions, issued_by, issued_at)
      VALUES (?, ?, ?, ?, ?, ?, date('now'))
    `).run(staff_id, level, reason, details || '', corrective_actions || '', req.manager.name);

    const warningId = result.lastInsertRowid;

    (check_ids || []).forEach(checkId => {
      db.prepare('INSERT INTO warning_check_links (warning_id, check_id) VALUES (?, ?)').run(warningId, checkId);
    });

    db.exec('COMMIT');
    res.json({ id: warningId });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/warnings/:id — edit warning, preserve history
router.put('/:id', requireAuth, (req, res) => {
  const { level, reason, details, corrective_actions, check_ids } = req.body;
  const existing = db.prepare('SELECT * FROM warnings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.exec('BEGIN');
  try {
    // Save edit history
    db.prepare(`
      INSERT INTO warning_edits (warning_id, edited_by, edited_at, prev_level, prev_reason, prev_details, prev_corrective_actions)
      VALUES (?, ?, datetime('now'), ?, ?, ?, ?)
    `).run(req.params.id, req.manager.name, existing.level, existing.reason, existing.details, existing.corrective_actions);

    // Apply changes
    db.prepare(`
      UPDATE warnings SET level = ?, reason = ?, details = ?, corrective_actions = ? WHERE id = ?
    `).run(
      level ?? existing.level,
      reason ?? existing.reason,
      details ?? existing.details,
      corrective_actions ?? existing.corrective_actions,
      req.params.id
    );

    // Replace check links if provided
    if (check_ids !== undefined) {
      db.prepare('DELETE FROM warning_check_links WHERE warning_id = ?').run(req.params.id);
      (check_ids || []).forEach(checkId => {
        db.prepare('INSERT INTO warning_check_links (warning_id, check_id) VALUES (?, ?)').run(req.params.id, checkId);
      });
    }

    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/warnings/:id
router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM warnings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Staff portal routes ───────────────────────────────────────────────────────

// GET /api/warnings/my-warnings — staff sees their own warnings (no edit history)
router.get('/my-warnings', requireStaffAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM warnings WHERE staff_id = ? ORDER BY issued_at DESC
  `).all(req.staffUser.id);

  const result = rows.map(w => ({
    ...w,
    ack_status: ackStatus(w),
    linked_checks: linkedChecks(w.id),
  }));

  res.json(result);
});

// POST /api/warnings/my-warnings/:id/acknowledge
router.post('/my-warnings/:id/acknowledge', requireStaffAuth, (req, res) => {
  const w = db.prepare('SELECT * FROM warnings WHERE id = ? AND staff_id = ?').get(req.params.id, req.staffUser.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  if (w.acknowledged_at) return res.json({ ok: true }); // idempotent

  db.prepare(`
    UPDATE warnings SET acknowledged_at = datetime('now'), acknowledged_by = ? WHERE id = ?
  `).run(req.staffUser.name, req.params.id);

  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Mount the route in `server.js`**

Add after the existing route mounts (e.g. after the `staff-portal` line):

```js
app.use('/api/warnings', require('./routes/warnings'));
```

- [ ] **Step 3: Restart backend and verify routes respond**

```bash
# Should return [] with no errors
curl http://localhost:3001/api/warnings -H "Authorization: Bearer <your-manager-token>"
```

Expected: `[]`

- [ ] **Step 4: Commit**

```bash
git add backend/routes/warnings.js backend/server.js
git commit -m "feat: add warnings backend routes (CRUD + staff portal acknowledge)"
```

---

## Task 3: Sidebar nav item

**Files:**
- Modify: `lca-qc-app/frontend/src/components/Layout.jsx`

- [ ] **Step 1: Add "Disciplinary" to the NAV array**

In `Layout.jsx`, find the `NAV` array and add the new item after `{ to: '/staff', label: 'Staff' }`:

```js
const NAV = [
  { to: '/',             label: 'Dashboard',   end: true },
  { to: '/staff',        label: 'Staff' },
  { to: '/disciplinary', label: 'Disciplinary' },
  { to: '/properties',   label: 'Properties' },
  { to: '/qc',           label: 'QC Checks' },
  { to: '/checklists',   label: 'Checklists' },
  { to: '/training',     label: 'Training' },
  { to: '/heatpump',     label: 'Heat Pumps' },
  { to: '/kpis',         label: 'KPIs' },
  { to: '/staff-logins', label: 'Staff Logins' },
  { to: '/settings',     label: 'Settings' },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Layout.jsx
git commit -m "feat: add Disciplinary nav item to sidebar"
```

---

## Task 4: Disciplinary list page

**Files:**
- Create: `lca-qc-app/frontend/src/pages/Disciplinary.jsx`

- [ ] **Step 1: Create the page**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { fmtDate } from '../utils';

const LEVEL_LABELS = {
  verbal_note:     'Verbal Note',
  written_warning: 'Written Warning',
  final_warning:   'Final Warning',
};

const LEVEL_COLORS = {
  verbal_note:     { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
  written_warning: { color: '#f97316',      bg: 'rgba(249,115,22,0.12)' },
  final_warning:   { color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)'  },
};

function LevelBadge({ level }) {
  const s = LEVEL_COLORS[level] || LEVEL_COLORS.verbal_note;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: s.color, background: s.bg }}>
      {LEVEL_LABELS[level] || level}
    </span>
  );
}

function AckBadge({ status }) {
  if (status === 'acknowledged') return null;
  const overdue = status === 'overdue';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
      color: overdue ? 'var(--red)' : 'var(--amber)',
      background: overdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
    }}>
      {overdue ? 'Overdue — not acknowledged' : 'Awaiting acknowledgement'}
    </span>
  );
}

const BLANK = { staff_id: '', level: 'verbal_note', reason: '', details: '', corrective_actions: '', check_ids: [] };

export default function Disciplinary() {
  const navigate = useNavigate();
  const [warnings, setWarnings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [checks, setChecks] = useState([]); // checks for selected staff in modal
  const [loading, setLoading] = useState(true);
  const [filterStaff, setFilterStaff] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([
      api.get('/warnings'),
      api.get('/staff'),
    ]).then(([w, s]) => {
      setWarnings(w.data);
      setStaff(s.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // When staff member selected in form, load their checks
  useEffect(() => {
    if (!form.staff_id) { setChecks([]); return; }
    api.get('/qc/checks').then(r => {
      setChecks(r.data.filter(c => c.staff_id === parseInt(form.staff_id) && c.status === 'complete'));
    });
  }, [form.staff_id]);

  const toggleCheck = (checkId) => {
    setForm(f => ({
      ...f,
      check_ids: f.check_ids.includes(checkId)
        ? f.check_ids.filter(id => id !== checkId)
        : [...f.check_ids, checkId],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.staff_id || !form.reason) return;
    setSaving(true);
    try {
      await api.post('/warnings', { ...form, staff_id: parseInt(form.staff_id) });
      setShowModal(false);
      setForm({ ...BLANK });
      load();
    } finally {
      setSaving(false);
    }
  };

  const filtered = warnings
    .filter(w => !filterStaff || w.staff_id === parseInt(filterStaff))
    .filter(w => !filterLevel || w.level === filterLevel);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Disciplinary Records</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>{warnings.length} warning{warnings.length !== 1 ? 's' : ''} on record</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({ ...BLANK }); setShowModal(true); }}>+ New Warning</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select className="form-select" style={{ maxWidth: 200 }} value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
          <option value="">All staff</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 200 }} value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
          <option value="">All levels</option>
          <option value="verbal_note">Verbal Note</option>
          <option value="written_warning">Written Warning</option>
          <option value="final_warning">Final Warning</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--t3)' }}>No warnings found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Level</th>
                <th>Reason</th>
                <th>Date Issued</th>
                <th>Issued By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => (
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.staff_name}</td>
                  <td><LevelBadge level={w.level} /></td>
                  <td style={{ color: 'var(--t2)', maxWidth: 220 }}>{w.reason}</td>
                  <td style={{ color: 'var(--t2)' }}>{fmtDate(w.issued_at)}</td>
                  <td style={{ color: 'var(--t2)' }}>{w.issued_by}</td>
                  <td><AckBadge status={w.ack_status} /></td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => navigate(`/disciplinary/${w.id}`)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Warning Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Warning</div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Staff Member</label>
                <select required className="form-select" value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value, check_ids: [] }))}>
                  <option value="">Select staff member</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Warning Level</label>
                <select className="form-select" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                  <option value="verbal_note">Verbal Note</option>
                  <option value="written_warning">Written Warning</option>
                  <option value="final_warning">Final Warning</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reason <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(short summary)</span></label>
                <input required className="form-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Persistent dusting failures" />
              </div>
              <div className="form-group">
                <label className="form-label">Details</label>
                <textarea className="form-input" rows={4} value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} placeholder="Full warning text..." style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Corrective Actions</label>
                <textarea className="form-input" rows={3} value={form.corrective_actions} onChange={e => setForm(f => ({ ...f, corrective_actions: e.target.value }))} placeholder="What the staff member must do..." style={{ resize: 'vertical' }} />
              </div>

              {/* Link QC checks */}
              {form.staff_id && checks.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Link QC Checks <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(optional)</span></label>
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                    {checks.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.check_ids.includes(c.id)}
                          onChange={() => toggleCheck(c.id)}
                        />
                        <span style={{ fontSize: 13 }}>
                          {fmtDate(c.date)} — {c.property_name}
                          <span style={{ marginLeft: 8, color: c.score_pct >= 85 ? 'var(--green)' : c.score_pct >= 70 ? 'var(--amber)' : 'var(--red)', fontWeight: 700 }}>
                            {Math.round(c.score_pct)}%
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Issue Warning'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Disciplinary.jsx
git commit -m "feat: add Disciplinary list page with new warning modal"
```

---

## Task 5: Warning detail page

**Files:**
- Create: `lca-qc-app/frontend/src/pages/WarningDetail.jsx`

- [ ] **Step 1: Create the page**

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { fmtDate } from '../utils';

const LEVEL_LABELS = {
  verbal_note:     'Verbal Note',
  written_warning: 'Written Warning',
  final_warning:   'Final Warning',
};

const LEVEL_COLORS = {
  verbal_note:     { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
  written_warning: { color: '#f97316',      bg: 'rgba(249,115,22,0.12)' },
  final_warning:   { color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)'  },
};

function LevelBadge({ level }) {
  const s = LEVEL_COLORS[level] || LEVEL_COLORS.verbal_note;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: s.color, background: s.bg }}>
      {LEVEL_LABELS[level] || level}
    </span>
  );
}

function AckBadge({ status, acknowledgedAt, acknowledgedBy }) {
  if (status === 'acknowledged') {
    return (
      <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: 'var(--green)', background: 'rgba(34,197,94,0.12)' }}>
        Acknowledged on {fmtDate(acknowledgedAt)} by {acknowledgedBy}
      </span>
    );
  }
  const overdue = status === 'overdue';
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
      color: overdue ? 'var(--red)' : 'var(--amber)',
      background: overdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
    }}>
      {overdue ? 'Overdue — not acknowledged' : 'Awaiting acknowledgement'}
    </span>
  );
}

export default function WarningDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [warning, setWarning] = useState(null);
  const [allChecks, setAllChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = () => {
    api.get(`/warnings/${id}`).then(r => {
      setWarning(r.data);
      setForm({
        level: r.data.level,
        reason: r.data.reason,
        details: r.data.details,
        corrective_actions: r.data.corrective_actions,
        check_ids: r.data.linked_checks.map(c => c.id),
      });
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // Load all checks for this staff member when editing
  useEffect(() => {
    if (editing && warning) {
      api.get('/qc/checks').then(r => {
        setAllChecks(r.data.filter(c => c.staff_id === warning.staff_id && c.status === 'complete'));
      });
    }
  }, [editing]);

  const toggleCheck = (checkId) => {
    setForm(f => ({
      ...f,
      check_ids: f.check_ids.includes(checkId)
        ? f.check_ids.filter(id => id !== checkId)
        : [...f.check_ids, checkId],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/warnings/${id}`, form);
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm('Delete this warning permanently? This cannot be undone.')) return;
    await api.delete(`/warnings/${id}`);
    navigate('/disciplinary');
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!warning) return <div className="page"><p>Warning not found.</p></div>;

  return (
    <div className="page">
      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/disciplinary')}>← Back</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>}
          <button className="btn btn-sm btn-danger" onClick={del}>Delete</button>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <LevelBadge level={warning.level} />
        <span style={{ fontWeight: 800, fontSize: 20 }}>{warning.staff_name}</span>
        <span style={{ color: 'var(--t3)', fontSize: 13 }}>Issued {fmtDate(warning.issued_at)} by {warning.issued_by}</span>
      </div>

      {/* Acknowledgement status */}
      <div style={{ marginBottom: 24 }}>
        <AckBadge status={warning.ack_status} acknowledgedAt={warning.acknowledged_at} acknowledgedBy={warning.acknowledged_by} />
      </div>

      {editing ? (
        /* Edit form */
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Edit Warning</div>
          <div className="form-group">
            <label className="form-label">Warning Level</label>
            <select className="form-select" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
              <option value="verbal_note">Verbal Note</option>
              <option value="written_warning">Written Warning</option>
              <option value="final_warning">Final Warning</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <input className="form-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Details</label>
            <textarea className="form-input" rows={4} value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Corrective Actions</label>
            <textarea className="form-input" rows={3} value={form.corrective_actions} onChange={e => setForm(f => ({ ...f, corrective_actions: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          {allChecks.length > 0 && (
            <div className="form-group">
              <label className="form-label">Linked QC Checks</label>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {allChecks.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.check_ids.includes(c.id)} onChange={() => toggleCheck(c.id)} />
                    <span style={{ fontSize: 13 }}>
                      {fmtDate(c.date)} — {c.property_name}
                      <span style={{ marginLeft: 8, color: c.score_pct >= 85 ? 'var(--green)' : c.score_pct >= 70 ? 'var(--amber)' : 'var(--red)', fontWeight: 700 }}>
                        {Math.round(c.score_pct)}%
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button className="btn btn-ghost" onClick={() => { setEditing(false); load(); }}>Cancel</button>
          </div>
        </div>
      ) : (
        /* View mode */
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Reason</div>
              <div style={{ fontWeight: 600 }}>{warning.reason}</div>
            </div>
            {warning.details && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>Details</div>
                <div style={{ color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{warning.details}</div>
              </div>
            )}
            {warning.corrective_actions && (
              <div style={{ background: 'rgba(58,181,217,0.07)', border: '1px solid rgba(58,181,217,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cyan)', marginBottom: 6 }}>Corrective Actions Required</div>
                <div style={{ color: 'var(--t1)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{warning.corrective_actions}</div>
              </div>
            )}
          </div>

          {/* Linked checks */}
          {warning.linked_checks.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Linked QC Checks</div>
              {warning.linked_checks.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                  <span style={{ fontSize: 13 }}>{fmtDate(c.date)} — {c.property_name}</span>
                  <span style={{ fontWeight: 700, color: c.score_pct >= 85 ? 'var(--green)' : c.score_pct >= 70 ? 'var(--amber)' : 'var(--red)' }}>
                    {Math.round(c.score_pct)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Edit history — manager only */}
          {warning.edit_history.length > 0 && (
            <div className="card">
              <button
                style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setHistoryOpen(o => !o)}
              >
                {historyOpen ? '▾' : '▸'} Edit History ({warning.edit_history.length} edit{warning.edit_history.length !== 1 ? 's' : ''})
              </button>
              {historyOpen && (
                <div style={{ marginTop: 12 }}>
                  {warning.edit_history.map((e, i) => (
                    <div key={e.id} style={{ padding: '10px 0', borderBottom: i < warning.edit_history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>Edited by {e.edited_by} on {e.edited_at.slice(0, 10)}</div>
                      <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                        Previous: <strong>{LEVEL_LABELS[e.prev_level]}</strong> — {e.prev_reason}
                        {e.prev_corrective_actions && <span> · Actions: {e.prev_corrective_actions.slice(0, 80)}{e.prev_corrective_actions.length > 80 ? '…' : ''}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/WarningDetail.jsx
git commit -m "feat: add Warning detail page with edit, history accordion, and delete"
```

---

## Task 6: Wire up routes in App.jsx

**Files:**
- Modify: `lca-qc-app/frontend/src/App.jsx`

- [ ] **Step 1: Add imports and routes**

Add to the import block at the top of `App.jsx`:

```jsx
import Disciplinary from './pages/Disciplinary';
import WarningDetail from './pages/WarningDetail';
```

Add inside the `<Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>` block, after the `settings` route:

```jsx
<Route path="disciplinary" element={<Disciplinary />} />
<Route path="disciplinary/:id" element={<WarningDetail />} />
```

- [ ] **Step 2: Verify navigation works**

Start the dev server and confirm:
- `/disciplinary` loads the list page
- Clicking "New Warning" opens the modal
- "View" on a row navigates to `/disciplinary/:id`
- Back button returns to `/disciplinary`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: register /disciplinary and /disciplinary/:id routes"
```

---

## Task 7: Staff profile — warnings stat card + list

**Files:**
- Modify: `lca-qc-app/frontend/src/pages/StaffProfile.jsx`

- [ ] **Step 1: Add warnings state and fetch**

In `StaffProfile.jsx`, add `warnings` state and fetch alongside the other loads. Find the existing state declarations and add:

```jsx
const [warnings, setWarnings] = useState([]);
```

In the `load` function, add after the existing `api.get` calls:

```jsx
api.get(`/warnings?staff_id=${id}`).then(r => setWarnings(r.data)).catch(() => {});
```

- [ ] **Step 2: Add warnings stat card to the 4-card grid**

Replace the existing `stat-grid` div with a 5-card version. Find:

```jsx
<div className="stat-grid mb-6">
  <div className="stat-card"><div className="stat-label">QC Checks</div><div className="stat-value">{qcChecks.length}</div></div>
  <div className="stat-card"><div className="stat-label">Avg QC Score</div><div className="stat-value" style={{ color: avgScore >= 85 ? 'var(--ok)' : avgScore >= 70 ? 'var(--amber)' : 'var(--red)' }}>{avgScore ? Math.round(avgScore) + '%' : '—'}</div></div>
  <div className="stat-card"><div className="stat-label">Training Sessions</div><div className="stat-value">{trainSessions.length}</div></div>
  <div className="stat-card"><div className="stat-label">Service Time</div><div className="stat-value" style={{ fontSize: 28, letterSpacing: -1 }}>{(() => { const days = Math.floor((new Date() - new Date(staff.start_date)) / 86400000); return days >= 365 ? `${Math.floor(days/365)}y ${Math.floor((days%365)/30)}m` : days >= 30 ? `${Math.floor(days/30)}m` : `${days}d`; })()}</div></div>
</div>
```

Replace with:

```jsx
<div className="stat-grid mb-6">
  <div className="stat-card"><div className="stat-label">QC Checks</div><div className="stat-value">{qcChecks.length}</div></div>
  <div className="stat-card"><div className="stat-label">Avg QC Score</div><div className="stat-value" style={{ color: avgScore >= 85 ? 'var(--ok)' : avgScore >= 70 ? 'var(--amber)' : 'var(--red)' }}>{avgScore ? Math.round(avgScore) + '%' : '—'}</div></div>
  <div className="stat-card"><div className="stat-label">Training Sessions</div><div className="stat-value">{trainSessions.length}</div></div>
  <div className="stat-card"><div className="stat-label">Warnings</div><div className="stat-value" style={{ color: warnings.length > 0 ? 'var(--red)' : 'var(--t1)' }}>{warnings.length}</div></div>
  <div className="stat-card"><div className="stat-label">Service Time</div><div className="stat-value" style={{ fontSize: 28, letterSpacing: -1 }}>{(() => { const days = Math.floor((new Date() - new Date(staff.start_date)) / 86400000); return days >= 365 ? `${Math.floor(days/365)}y ${Math.floor((days%365)/30)}m` : days >= 30 ? `${Math.floor(days/30)}m` : `${days}d`; })()}</div></div>
</div>
```

- [ ] **Step 3: Add warnings list at the bottom of the profile, before the closing `</div>` of the page**

Add these constants near the top of the component (after the imports, inside the function before the return):

```jsx
const LEVEL_LABELS = { verbal_note: 'Verbal Note', written_warning: 'Written Warning', final_warning: 'Final Warning' };
const LEVEL_COLORS = {
  verbal_note:     { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
  written_warning: { color: '#f97316',      bg: 'rgba(249,115,22,0.12)' },
  final_warning:   { color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)'  },
};
```

Add the warnings card after the training history card (before the final `</div>` closing the page):

```jsx
{warnings.length > 0 && (
  <div className="card" style={{ marginTop: 24 }}>
    <div className="card-title" style={{ marginBottom: 16 }}>Disciplinary Warnings</div>
    <div className="table-wrap">
      <table>
        <thead><tr><th>Level</th><th>Reason</th><th>Date Issued</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {warnings.map(w => {
            const overdue = !w.acknowledged_at && Math.floor((Date.now() - new Date(w.issued_at)) / 86400000) >= 3;
            const s = LEVEL_COLORS[w.level] || LEVEL_COLORS.verbal_note;
            return (
              <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/disciplinary/${w.id}`)}>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: s.color, background: s.bg }}>
                    {LEVEL_LABELS[w.level] || w.level}
                  </span>
                </td>
                <td style={{ color: 'var(--t2)' }}>{w.reason}</td>
                <td style={{ color: 'var(--t2)' }}>{fmtDate(w.issued_at)}</td>
                <td>
                  {w.acknowledged_at ? null : (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: overdue ? 'var(--red)' : 'var(--amber)', background: overdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)' }}>
                      {overdue ? 'Overdue' : 'Awaiting'}
                    </span>
                  )}
                </td>
                <td><button className="btn btn-sm" onClick={e => { e.stopPropagation(); navigate(`/disciplinary/${w.id}`); }}>View</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/StaffProfile.jsx
git commit -m "feat: add warnings count stat card and warnings list to staff profile"
```

---

## Task 8: Staff portal — warnings section

**Files:**
- Modify: `lca-qc-app/frontend/src/pages/StaffPortalDashboard.jsx`

- [ ] **Step 1: Add warnings state and fetch**

Add to existing state declarations:

```jsx
const [portalWarnings, setPortalWarnings] = useState([]);
```

In the existing `Promise.all` load (alongside `my-stats`, `my-checks`, `my-flags`), add the warnings fetch after it resolves. After the `Promise.all` block, add:

```jsx
api.get('/warnings/my-warnings', { headers }).then(r => setPortalWarnings(r.data)).catch(() => {});
```

- [ ] **Step 2: Add acknowledge handler**

Add this function inside the component, after the `loadFlags` function:

```jsx
const acknowledgeWarning = async (warningId) => {
  const token = localStorage.getItem('staff_token');
  await api.post(`/warnings/my-warnings/${warningId}/acknowledge`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Refresh warnings
  api.get('/warnings/my-warnings', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => setPortalWarnings(r.data)).catch(() => {});
};
```

- [ ] **Step 3: Add the warnings section to the JSX**

Add the following block between the score trend card and the flagged issues card (look for the `{/* Flagged issues by room */}` comment and place this before it):

```jsx
{/* Warnings */}
{portalWarnings.length > 0 && (
  <div style={{ marginBottom: 24 }}>
    {portalWarnings.map(w => {
      const LEVEL_LABELS = { verbal_note: 'Verbal Note', written_warning: 'Written Warning', final_warning: 'Final Warning' };
      const LEVEL_COLORS = {
        verbal_note:     { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
        written_warning: { color: '#f97316',      bg: 'rgba(249,115,22,0.12)' },
        final_warning:   { color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)'  },
      };
      const s = LEVEL_COLORS[w.level] || LEVEL_COLORS.verbal_note;
      return (
        <div key={w.id} className="card" style={{ marginBottom: 16, border: `1px solid ${s.color}40` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: s.color, background: s.bg }}>
              {LEVEL_LABELS[w.level] || w.level}
            </span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Issued {fmtDate(w.issued_at)} by {w.issued_by}</span>
          </div>

          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{w.reason}</div>

          {w.details && (
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{w.details}</p>
          )}

          {w.corrective_actions && (
            <div style={{ background: 'rgba(58,181,217,0.07)', border: '1px solid rgba(58,181,217,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cyan)', marginBottom: 6 }}>Corrective Actions Required</div>
              <p style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{w.corrective_actions}</p>
            </div>
          )}

          {w.linked_checks.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 6 }}>Linked QC Checks</div>
              {w.linked_checks.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--glass-border)', cursor: 'pointer' }}
                  onClick={() => navigate(`/portal/check/${c.id}`)}>
                  <span style={{ fontSize: 13 }}>{fmtDate(c.date)} — {c.property_name}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: c.score_pct >= 85 ? 'var(--green)' : c.score_pct >= 70 ? 'var(--amber)' : 'var(--red)' }}>
                    {Math.round(c.score_pct)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {w.acknowledged_at ? (
            <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
              ✓ Acknowledged on {fmtDate(w.acknowledged_at)}
            </div>
          ) : (
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => acknowledgeWarning(w.id)}
            >
              I have read and acknowledge this warning and agree to the corrective actions
            </button>
          )}
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/StaffPortalDashboard.jsx
git commit -m "feat: add warnings section to staff portal with acknowledgement button"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| 3 DB tables (warnings, warning_check_links, warning_edits) | Task 1 |
| Manager CRUD routes | Task 2 |
| Staff portal my-warnings + acknowledge routes | Task 2 |
| Sidebar nav item | Task 3 |
| Disciplinary list page with filters + new warning modal | Task 4 |
| Link multiple QC checks in modal | Task 4 |
| Warning detail page with edit (preserves history) | Task 5 |
| Edit history accordion (manager-only) | Task 5 |
| Delete with confirmation | Task 5 |
| Routes registered in App.jsx | Task 6 |
| Warnings stat card on staff profile | Task 7 |
| Warnings list on staff profile linking to /disciplinary/:id | Task 7 |
| Staff portal warnings section | Task 8 |
| Corrective actions in distinct box | Task 8 |
| Linked checks clickable to /portal/check/:id | Task 8 |
| Acknowledge button → replaced with confirmation | Task 8 |
| Ack status badges (pending/overdue after 3 days) | Tasks 4, 5, 7 |
| Level colours (amber/orange/red) | Tasks 4, 5, 7, 8 |
| Edit history never exposed to staff portal | Task 2 (my-warnings route omits it) |

All spec requirements covered. No placeholders or TBDs found.
