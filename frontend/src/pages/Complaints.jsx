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
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: m.color, background: m.bg }}>
      {m.label}
    </span>
  );
}

function SourceBadge({ source }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: 'var(--t2)', background: 'var(--glass)', border: '1px solid var(--glass-border)' }}>
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
    Promise.all([
      api.get('/staff'),
      api.get('/properties'),
    ]).then(([sR, pR]) => {
      setStaff(sR.data);
      setProperties(pR.data);
    }).finally(() => setLoading(false));
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

  // Summary stats for the period
  const totalComplaints = filtered.length;
  const seriousCount    = filtered.filter(c => c.severity === 'serious').length;
  const unresolvedCount = filtered.filter(c => !c.resolution).length;
  const staffAtRisk     = impactData.filter(s => s.risk_flag).length;

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Complaints</h1>
          <p>Track guest, property manager and owner complaints — feeds into watchlist and coaching triggers</p>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()}>+ Log Complaint</button>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Total ({period === '90d' ? '90 days' : period === '180d' ? '180 days' : '12 months'})</div>
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
          <div className="stat-label">Staff at Risk (90d)</div>
          <div className={`stat-value${staffAtRisk > 0 ? ' red' : ' green'}`}>{staffAtRisk}</div>
          <div className="stat-sub">{staffAtRisk > 0 ? 'On complaint watchlist' : 'No one flagged'}</div>
        </div>
      </div>

      {/* Impact table */}
      {impactData.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Complaint Impact (Last 90 Days)</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Score starts at 100 — minor −2, moderate −5, serious −10</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Impact Score</th>
                  <th>Minor</th>
                  <th>Moderate</th>
                  <th>Serious</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {impactData.sort((a, b) => a.impact_score - b.impact_score).map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>
                      <button onClick={() => navigate(`/staff/${s.id}`)} style={{ background: 'none', border: 'none', color: 'var(--t1)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
                        {s.name}
                      </button>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 800, fontSize: 16,
                        color: s.impact_score >= 90 ? 'var(--ok)' : s.impact_score >= 75 ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {s.impact_score}
                      </span>
                    </td>
                    <td style={{ color: 'var(--t2)' }}>{s.minor_count || 0}</td>
                    <td style={{ color: s.moderate_count > 0 ? 'var(--cyan)' : 'var(--t3)' }}>{s.moderate_count || 0}</td>
                    <td style={{ color: s.serious_count > 0 ? 'var(--red)' : 'var(--t3)' }}>{s.serious_count || 0}</td>
                    <td>
                      {s.risk_flag
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: 'var(--red)', background: 'rgba(239,68,68,0.12)' }}>Watchlist risk</span>
                        : <span style={{ fontSize: 11, color: 'var(--t3)' }}>Monitoring</span>
                      }
                    </td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => openNew(String(s.id))}>+ Add</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters + log */}
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <span className="card-title" style={{ marginRight: 'auto' }}>Complaint Log</span>
          <select className="form-select" style={{ width: 140 }} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="90d">Last 90 days</option>
            <option value="180d">Last 180 days</option>
            <option value="12m">Last 12 months</option>
            <option value="all">All time</option>
          </select>
          <select className="form-select" style={{ width: 160 }} value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
            <option value="">All team members</option>
            {staff.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <select className="form-select" style={{ width: 130 }} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
            <option value="">All severities</option>
            <option value="minor">Minor</option>
            <option value="moderate">Moderate</option>
            <option value="serious">Serious</option>
          </select>
          <select className="form-select" style={{ width: 160 }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="guest">Guest</option>
            <option value="property_manager">Property Manager</option>
            <option value="property_owner">Property Owner</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: 'var(--t3)', padding: '20px 0' }}>No complaints recorded for the selected filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Team Member</th>
                  <th>Source</th>
                  <th>Severity</th>
                  <th>Property</th>
                  <th>Description</th>
                  <th>Resolution</th>
                  <th>Logged By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.date)}</td>
                    <td style={{ fontWeight: 700 }}>
                      <button onClick={() => navigate(`/staff/${c.staff_id}`)} style={{ background: 'none', border: 'none', color: 'var(--t1)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
                        {c.staff_name}
                      </button>
                    </td>
                    <td><SourceBadge source={c.source} /></td>
                    <td><SeverityBadge severity={c.severity} /></td>
                    <td style={{ color: 'var(--t2)' }}>{c.property_name || '—'}</td>
                    <td style={{ maxWidth: 260, color: 'var(--t1)', fontSize: 13 }}>{c.description}</td>
                    <td style={{ maxWidth: 200, color: c.resolution ? 'var(--ok)' : 'var(--t3)', fontSize: 13, fontStyle: c.resolution ? 'normal' : 'italic' }}>
                      {c.resolution || 'Unresolved'}
                    </td>
                    <td style={{ color: 'var(--t3)', fontSize: 12 }}>{c.issued_by}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteComplaint(c.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New / Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit Complaint' : 'Log Complaint'}</div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Team Member *</label>
              <select className="form-select" value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select team member…</option>
                {staff.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Date *</label>
                <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Property</label>
                <select className="form-select" value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
                  <option value="">Not specified</option>
                  {properties.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Source *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['guest', 'property_manager', 'property_owner'].map(src => (
                  <button key={src} onClick={() => setForm(f => ({ ...f, source: src }))} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                    border: `2px solid ${form.source === src ? 'var(--cyan)' : 'var(--border)'}`,
                    background: form.source === src ? 'rgba(58,181,217,0.12)' : 'transparent',
                    color: form.source === src ? 'var(--cyan)' : 'var(--t2)',
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
                    flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    border: `2px solid ${form.severity === key ? m.color : 'var(--border)'}`,
                    background: form.severity === key ? m.bg : 'transparent',
                    color: form.severity === key ? m.color : 'var(--t2)',
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>
                {form.severity === 'minor' && 'Minor issues — −2 impact points. Won\'t trigger watchlist alone.'}
                {form.severity === 'moderate' && 'Moderate issues — −5 impact points. 2+ in 90 days triggers watchlist.'}
                {form.severity === 'serious' && 'Serious complaint — −10 impact points. Immediately triggers watchlist.'}
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
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Log Complaint'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
