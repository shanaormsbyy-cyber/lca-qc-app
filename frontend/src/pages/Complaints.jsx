import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { fmtDate } from '../utils';
import { useAuth } from '../context/AuthContext';

const SOURCE_LABELS = {
  guest:            'Guest',
  property_manager: 'Property Manager',
  property_owner:   'Property Owner',
};

const SEVERITY_META = {
  minor:    { label: 'Minor',    color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)',  weight: 2  },
  moderate: { label: 'Moderate', color: 'var(--cyan)',  bg: 'rgba(58,181,217,0.12)', weight: 5  },
  serious:  { label: 'Serious',  color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)',  weight: 10 },
};

function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity] || SEVERITY_META.minor;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: m.color, background: m.bg, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

function SourceBadge({ source }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: 'var(--t2)', background: 'var(--glass)', border: '1px solid var(--glass-border)', whiteSpace: 'nowrap' }}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

const EMPTY_FORM = {
  staff_id: '', property_id: '', source: 'guest', severity: 'minor',
  date: new Date().toISOString().slice(0, 10), description: '', resolution: '',
};

export default function Complaints() {
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('90d');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [impactData, setImpactData] = useState([]);

  const load = () => {
    api.get(`/complaints?period=${period}`).then(r => setComplaints(r.data)).catch(() => {});
    api.get('/complaints/impact/all').then(r => setImpactData(r.data)).catch(() => {});
  };

  useEffect(() => {
    Promise.all([api.get('/staff'), api.get('/properties')])
      .then(([sR, pR]) => { setStaff(sR.data); setProperties(pR.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [period]);
  useLiveSync(load);

  const openNew = (preStaffId = '') => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, staff_id: preStaffId });
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      staff_id: String(c.staff_id),
      property_id: c.property_id ? String(c.property_id) : '',
      source: c.source,
      severity: c.severity,
      date: c.date,
      description: c.description,
      resolution: c.resolution || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.staff_id || !form.description || !form.date) return alert('Staff, date and description are required');
    setSaving(true);
    try {
      const payload = { ...form, staff_id: parseInt(form.staff_id), property_id: form.property_id ? parseInt(form.property_id) : null };
      if (editing) await api.put(`/complaints/${editing.id}`, payload);
      else         await api.post('/complaints', payload);
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteComplaint = async (id) => {
    if (!confirm('Delete this complaint? This cannot be undone.')) return;
    await api.delete(`/complaints/${id}`);
    load();
  };

  const filtered = complaints.filter(c => {
    if (filterStaff    && String(c.staff_id) !== filterStaff)  return false;
    if (filterSeverity && c.severity !== filterSeverity)        return false;
    if (filterSource   && c.source   !== filterSource)          return false;
    return true;
  });

  const totalComplaints = filtered.length;
  const seriousCount    = filtered.filter(c => c.severity === 'serious').length;
  const unresolvedCount = filtered.filter(c => !c.resolution).length;
  const staffAtRisk     = impactData.filter(s => s.risk_flag).length;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Complaints</h1>
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>Track guest, property manager and owner complaints</p>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>+ Log Complaint</button>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total ({period === '30d' ? '30d' : period === '90d' ? '90d' : period === '180d' ? '180d' : period === '12m' ? '12mo' : 'All'})</div>
          <div className="stat-value cyan">{totalComplaints}</div>
          <div className="stat-sub">In selected period</div>
        </div>
        <div className={`stat-card${seriousCount > 0 ? ' danger' : ''}`}>
          <div className="stat-label">Serious</div>
          <div className={`stat-value${seriousCount > 0 ? ' red' : ' green'}`}>{seriousCount}</div>
          <div className="stat-sub">{seriousCount > 0 ? 'Requires action' : 'None recorded'}</div>
        </div>
        <div className={`stat-card${unresolvedCount > 0 ? ' danger' : ''}`}>
          <div className="stat-label">Unresolved</div>
          <div className={`stat-value${unresolvedCount > 0 ? ' amber' : ' green'}`}>{unresolvedCount}</div>
          <div className="stat-sub">{unresolvedCount > 0 ? 'No resolution logged' : 'All resolved'}</div>
        </div>
        <div className={`stat-card${staffAtRisk > 0 ? ' danger' : ''}`}>
          <div className="stat-label">At Risk (90d)</div>
          <div className={`stat-value${staffAtRisk > 0 ? ' red' : ' green'}`}>{staffAtRisk}</div>
          <div className="stat-sub">{staffAtRisk > 0 ? 'On complaint watchlist' : 'No one flagged'}</div>
        </div>
      </div>

      {/* Impact summary — card list on mobile, table on desktop */}
      {impactData.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="card-title">Complaint Impact — Last 90 Days</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>Score starts at 100 · Minor −2 · Moderate −5 · Serious −10</div>
          </div>

          {/* Mobile: stack cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="impact-list">
            {[...impactData].sort((a, b) => a.impact_score - b.impact_score).map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 10,
                background: s.risk_flag ? 'rgba(239,68,68,0.06)' : 'var(--navy2)',
                border: s.risk_flag ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border)',
                gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  {/* Score circle */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14,
                    color: s.impact_score >= 90 ? '#22c55e' : s.impact_score >= 75 ? 'var(--amber)' : 'var(--red)',
                    background: s.impact_score >= 90 ? 'rgba(34,197,94,0.12)' : s.impact_score >= 75 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                  }}>
                    {s.impact_score}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <button onClick={() => navigate(`/staff/${s.id}`)} style={{ background: 'none', border: 'none', color: 'var(--t1)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 14, display: 'block', textAlign: 'left' }}>
                      {s.name}
                    </button>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {s.minor_count > 0    && <span style={{ fontSize: 11, color: 'var(--amber)' }}>{s.minor_count} minor</span>}
                      {s.moderate_count > 0 && <span style={{ fontSize: 11, color: 'var(--cyan)' }}>{s.moderate_count} moderate</span>}
                      {s.serious_count > 0  && <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>{s.serious_count} serious</span>}
                      {s.total_complaints === 0 && <span style={{ fontSize: 11, color: 'var(--t3)' }}>No complaints</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {s.risk_flag && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: 'var(--red)', background: 'rgba(239,68,68,0.12)', whiteSpace: 'nowrap' }}>
                      Watchlist risk
                    </span>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={() => openNew(String(s.id))}>+ Add</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complaint log */}
      <div className="card">
        {/* Filter bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span className="card-title">Complaint Log</span>
            <select className="form-select" style={{ width: 'auto', minWidth: 130 }} value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="180d">Last 180 days</option>
              <option value="12m">Last 12 months</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="form-select" style={{ flex: '1 1 140px', minWidth: 0 }} value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
              <option value="">All team members</option>
              {staff.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
            <select className="form-select" style={{ flex: '1 1 120px', minWidth: 0 }} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="">All severities</option>
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="serious">Serious</option>
            </select>
            <select className="form-select" style={{ flex: '1 1 140px', minWidth: 0 }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">All sources</option>
              <option value="guest">Guest</option>
              <option value="property_manager">Property Manager</option>
              <option value="property_owner">Property Owner</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: 'var(--t3)', padding: '20px 0' }}>No complaints recorded for the selected filters.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(c => (
              <div key={c.id} style={{
                borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--navy2)', overflow: 'hidden',
              }}>
                {/* Top row: name + badges + actions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px 8px', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                    <button onClick={() => navigate(`/staff/${c.staff_id}`)} style={{ background: 'none', border: 'none', color: 'var(--t1)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 14 }}>
                      {c.staff_name}
                    </button>
                    <SeverityBadge severity={c.severity} />
                    <SourceBadge source={c.source} />
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteComplaint(c.id)}>Del</button>
                  </div>
                </div>

                {/* Meta row: date + property */}
                <div style={{ display: 'flex', gap: 16, padding: '0 14px 8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtDate(c.date)}</span>
                  {c.property_name && <span style={{ fontSize: 12, color: 'var(--t3)' }}>{c.property_name}</span>}
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>Logged by {c.issued_by}</span>
                </div>

                {/* Description */}
                <div style={{ padding: '0 14px 10px' }}>
                  <p style={{ fontSize: 13, color: 'var(--t1)', margin: 0, lineHeight: 1.5 }}>{c.description}</p>
                </div>

                {/* Resolution */}
                <div style={{
                  padding: '8px 14px',
                  borderTop: '1px solid var(--border)',
                  background: c.resolution ? 'rgba(34,197,94,0.05)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: c.resolution ? 'var(--ok)' : 'var(--t3)' }}>
                    {c.resolution ? 'Resolved' : 'Unresolved'}
                  </span>
                  {c.resolution && (
                    <span style={{ fontSize: 13, color: 'var(--t2)' }}>{c.resolution}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit Complaint' : 'Log Complaint'}</div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Team Member *</label>
              <select className="form-select" value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select team member…</option>
                {staff.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <label className="form-label">Date *</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <label className="form-label">Property</label>
                <select className="form-select" value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
                  <option value="">Not specified</option>
                  {properties.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Source *</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['guest', 'property_manager', 'property_owner'].map(src => (
                  <button key={src} onClick={() => setForm(f => ({ ...f, source: src }))} style={{
                    flex: '1 1 100px', padding: '9px 6px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    border: `2px solid ${form.source === src ? 'var(--cyan)' : 'var(--border)'}`,
                    background: form.source === src ? 'rgba(58,181,217,0.12)' : 'transparent',
                    color: form.source === src ? 'var(--cyan)' : 'var(--t2)',
                    whiteSpace: 'nowrap',
                  }}>
                    {SOURCE_LABELS[src]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Severity *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(SEVERITY_META).map(([key, m]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, severity: key }))} style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    border: `2px solid ${form.severity === key ? m.color : 'var(--border)'}`,
                    background: form.severity === key ? m.bg : 'transparent',
                    color: form.severity === key ? m.color : 'var(--t2)',
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, minHeight: 16 }}>
                {form.severity === 'minor'    && "Minor — −2 impact points. Won't trigger watchlist alone."}
                {form.severity === 'moderate' && 'Moderate — −5 impact points. 2+ in 90 days triggers watchlist.'}
                {form.severity === 'serious'  && 'Serious — −10 impact points. Immediately triggers watchlist.'}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Description *</label>
              <textarea className="form-input" rows={3} placeholder="Describe the complaint…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Resolution / Action Taken</label>
              <textarea className="form-input" rows={2} placeholder="How was this resolved? (optional)" value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Log Complaint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
