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

  useEffect(() => {
    if (editing && warning) {
      api.get('/qc/checks').then(r => {
        setAllChecks(r.data.filter(c => c.staff_id === warning.staff_id && c.status === 'complete'));
      });
    }
  }, [editing, warning]);

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <LevelBadge level={warning.level} />
        <span style={{ fontWeight: 800, fontSize: 20 }}>{warning.staff_name}</span>
        <span style={{ color: 'var(--t3)', fontSize: 13 }}>Issued {fmtDate(warning.issued_at)} by {warning.issued_by}</span>
      </div>

      <div style={{ marginBottom: 24 }}>
        <AckBadge status={warning.ack_status} acknowledgedAt={warning.acknowledged_at} acknowledgedBy={warning.acknowledged_by} />
      </div>

      {editing ? (
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
