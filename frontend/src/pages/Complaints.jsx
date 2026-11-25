import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { fmtDate } from '../utils';
import { fmtScore } from '../lib/complaintScore';

const SOURCE_LABELS = {
  guest:            'Guest',
  property_manager: 'Property Manager',
  property_owner:   'Property Owner',
};

// Points each severity takes off the cleaner's QC score.
const SEVERITY_META = {
  minor:    { label: 'Minor',    color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)', points: 0.5, hint: "Minor — takes 0.5% off their QC score. Won't trigger the watchlist on its own." },
  moderate: { label: 'Moderate', color: 'var(--cyan)',  bg: 'rgba(58,181,217,0.12)', points: 1,   hint: 'Moderate — takes 1% off their QC score. 2 in 90 days puts them on the watchlist.' },
  serious:  { label: 'Serious',  color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)',  points: 4,   hint: 'Serious — takes 4% off their QC score and puts them on the watchlist.' },
};

const PERIODS = [['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['180d', 'Last 180 days'], ['12m', 'Last 12 months'], ['all', 'All time']];
const FILTERS = [['all', 'All'], ['serious', 'Serious'], ['moderate', 'Moderate'], ['minor', 'Minor'], ['open', 'Not addressed']];

function Pill({ children, color, bg, border }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, color, background: bg, border: border ? `1px solid ${border}` : 'none', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function initials(name = '') {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

const EMPTY_FORM = {
  staff_id: '', property_id: '', source: 'guest', severity: 'minor',
  date: new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }), description: '', resolution: '',
};

export default function Complaints() {
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [scores, setScores] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('90d');
  const [filter, setFilter] = useState('all');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get(`/complaints?period=${period}`).then(r => setComplaints(r.data)).catch(() => {});
    api.get(`/complaints/scores?period=${period}`).then(r => setScores(r.data.cleaners || [])).catch(() => {});
  };

  useEffect(() => {
    Promise.all([api.get('/staff'), api.get('/properties')])
      .then(([sR, pR]) => { setStaff(sR.data); setProperties(pR.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveSync(load);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      staff_id: String(c.staff_id),
      property_id: c.property_id ? String(c.property_id) : '',
      source: c.source, severity: c.severity, date: c.date,
      description: c.description, resolution: c.resolution || '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.staff_id || !form.description || !form.date) return alert('Team member, date and description are required');
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

  const inScope = complaints.filter(c =>
    (!filterStaff || String(c.staff_id) === filterStaff) && (!filterSource || c.source === filterSource));
  const shown = inScope.filter(c =>
    filter === 'all' ? true : filter === 'open' ? !c.resolution : c.severity === filter);

  const count = (f) => inScope.filter(c => f === 'all' ? true : f === 'open' ? !c.resolution : c.severity === f).length;
  const seriousCount = count('serious');
  const openCount = count('open');
  const onWatchlist = scores.filter(s => s.watchlist_trigger).length;
  const periodLabel = (PERIODS.find(p => p[0] === period) || PERIODS[1])[1].replace('Last ', '');

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page cp-page">
      {/* Header */}
      <div className="cp-head">
        <div>
          <h1 className="cp-title">Complaints</h1>
          <p className="cp-sub">Guest, owner and property manager complaints — each one takes points off the cleaner's QC score.</p>
        </div>
        <div className="cp-head-actions">
          <select className="form-select" style={{ width: 'auto', minWidth: 150 }} value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew}>+ Log Complaint</button>
        </div>
      </div>

      {/* Tiles */}
      <div className="cp-tiles">
        <div className="cp-tile cp-cyan">
          <div className="cp-tile-value">{inScope.length}</div>
          <div className="cp-tile-label">Complaints</div>
          <div className="cp-tile-sub">{period === 'all' ? 'All time' : `Last ${periodLabel}`}</div>
        </div>
        <div className={`cp-tile ${seriousCount ? 'cp-red' : 'cp-plain'}`}>
          <div className="cp-tile-value">{seriousCount}</div>
          <div className="cp-tile-label">Serious</div>
          <div className="cp-tile-sub">−4% QC each</div>
        </div>
        <div className={`cp-tile ${openCount ? 'cp-amber' : 'cp-plain'}`}>
          <div className="cp-tile-value">{openCount}</div>
          <div className="cp-tile-label">Not addressed</div>
          <div className="cp-tile-sub">Still need action</div>
        </div>
        <div className={`cp-tile ${onWatchlist ? 'cp-red' : 'cp-plain'}`}>
          <div className="cp-tile-value">{onWatchlist}</div>
          <div className="cp-tile-label">On watchlist from complaints</div>
          <div className="cp-tile-sub">1 serious or 2 moderate in 90 days</div>
        </div>
      </div>

      <div className="cp-layout">
        {/* Feed */}
        <div className="cp-feed">
          <div className="cp-filters">
            <div className="cp-chips">
              {FILTERS.map(([k, l]) => (
                <button key={k} className={`cp-chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
                  {l} <span className="cp-chip-count">{count(k)}</span>
                </button>
              ))}
            </div>
            <div className="cp-selects">
              <select className="form-select" value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
                <option value="">All team members</option>
                {staff.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <select className="form-select" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                <option value="">All sources</option>
                {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="cp-empty">No complaints for these filters.</div>
          ) : shown.map(c => {
            const m = SEVERITY_META[c.severity] || SEVERITY_META.minor;
            return (
              <div key={c.id} className="cp-card" style={{ borderLeftColor: m.color }}>
                <div className="cp-card-top">
                  <div className="cp-card-who">
                    <Pill color={m.color} bg={m.bg}>{m.label}</Pill>
                    <button className="cp-name" onClick={() => navigate(`/staff/${c.staff_id}`)}>{c.staff_name}</button>
                    {c.property_name && <span className="cp-muted">· {c.property_name}</span>}
                  </div>
                  <div className="cp-card-right">
                    <Pill color={m.color} bg={m.bg} border={m.color}>−{m.points}% QC</Pill>
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(c)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteComplaint(c.id)}>Delete</button>
                  </div>
                </div>
                <p className="cp-desc">{c.description}</p>
                <div className={`cp-card-foot${c.resolution ? ' addressed' : ''}`}>
                  <span className="cp-muted">{SOURCE_LABELS[c.source] || c.source} · {fmtDate(c.date)} · logged by {c.issued_by}</span>
                  {c.resolution
                    ? <span className="cp-addressed"><Pill color="var(--green)" bg="rgba(34,197,94,0.12)">Addressed</Pill><span className="cp-res">{c.resolution}</span></span>
                    : <Pill color="var(--amber)" bg="rgba(245,158,11,0.12)">Not addressed</Pill>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cleaners affected */}
        <div className="cp-side">
          <div className="cp-panel">
            <div className="cp-panel-title">Cleaners affected</div>
            <div className="cp-muted" style={{ fontSize: 12, marginBottom: 12 }}>QC score {period === 'all' ? 'all time' : `for the last ${periodLabel}`}, after complaint points.</div>
            {scores.length === 0 ? <div className="cp-muted" style={{ fontSize: 13 }}>No complaints in this period.</div> : scores.map(s => (
              <div key={s.staff_id} className="cp-cleaner" onClick={() => navigate(`/staff/${s.staff_id}`)}>
                <span className="cp-avatar">{initials(s.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cp-cleaner-name">
                    {s.name}
                    {s.watchlist_trigger && <Pill color="var(--red)" bg="rgba(239,68,68,0.12)">Watchlist</Pill>}
                  </div>
                  <div className="cp-muted" style={{ fontSize: 12 }}>
                    {s.checks_avg != null
                      ? <>{fmtScore(s.checks_avg)} checks − {s.points} = <b style={{ color: s.adjusted >= 85 ? 'var(--green)' : s.adjusted >= 70 ? 'var(--amber)' : 'var(--red)' }}>{fmtScore(s.adjusted)}</b></>
                      : <>−{s.points} {s.points === 1 ? 'point' : 'points'} · no QC checks in this period</>}
                  </div>
                  <div className="cp-mini">
                    {s.serious > 0 && <span style={{ color: 'var(--red)' }}>{s.serious} serious</span>}
                    {s.moderate > 0 && <span style={{ color: 'var(--cyan)' }}>{s.moderate} moderate</span>}
                    {s.minor > 0 && <span style={{ color: 'var(--amber)' }}>{s.minor} minor</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="cp-panel cp-key">
            <div className="cp-panel-title">How points work</div>
            {Object.values(SEVERITY_META).map(m => (
              <div key={m.label} className="cp-key-row"><Pill color={m.color} bg={m.bg}>{m.label}</Pill><span>−{m.points}% off QC score</span></div>
            ))}
            <div className="cp-muted" style={{ fontSize: 11, marginTop: 8 }}>Complaints count while they're inside the period being viewed (the last 90 days on other pages). Addressed complaints still count.</div>
          </div>
        </div>
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
                {Object.keys(SOURCE_LABELS).map(src => (
                  <button key={src} onClick={() => setForm(f => ({ ...f, source: src }))} style={{
                    flex: '1 1 100px', padding: '9px 6px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    border: `2px solid ${form.source === src ? 'var(--cyan)' : 'var(--glass-border)'}`,
                    background: form.source === src ? 'rgba(58,181,217,0.12)' : 'transparent',
                    color: form.source === src ? 'var(--cyan)' : 'var(--t2)', whiteSpace: 'nowrap',
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
                    border: `2px solid ${form.severity === key ? m.color : 'var(--glass-border)'}`,
                    background: form.severity === key ? m.bg : 'transparent',
                    color: form.severity === key ? m.color : 'var(--t2)',
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, minHeight: 16 }}>{SEVERITY_META[form.severity].hint}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Description *</label>
              <textarea className="form-input" rows={3} placeholder="Describe the complaint…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">How it was addressed</label>
              <textarea className="form-input" rows={2} placeholder="What was done about it? Leave blank if not addressed yet." value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))} />
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
