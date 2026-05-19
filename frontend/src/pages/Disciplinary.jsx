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
  const [checks, setChecks] = useState([]);
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
