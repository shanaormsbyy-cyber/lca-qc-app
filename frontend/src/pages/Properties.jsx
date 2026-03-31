import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { ScoreBadge, StatusBadge, DueBadge } from '../components/Badge';

function AccessDetailsTab({ properties }) {
  const [codes, setCodes] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    const initial = {};
    properties.forEach(p => { initial[p.id] = p.access_code || ''; });
    setCodes(initial);
  }, [properties]);

  const save = async (id) => {
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await api.put(`/properties/${id}`, { access_code: codes[id] });
      setSaved(s => ({ ...s, [id]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000);
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const sorted = [...properties]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Access Details</span>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>Enter access codes, lockbox combos, door codes etc.</span>
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
              <th style={{ width: '40%' }}>Property</th>
              <th>Access Code / Notes</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 700 }}>{p.name}</td>
                <td>
                  <input
                    className="form-input"
                    style={{ padding: '6px 10px', fontSize: 13 }}
                    placeholder="e.g. Lockbox: 1234, Front door: 5678…"
                    value={codes[p.id] ?? ''}
                    onChange={e => setCodes(c => ({ ...c, [p.id]: e.target.value }))}
                    onBlur={() => save(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                  />
                </td>
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

export default function Properties() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [properties, setProperties] = useState([]);
  const [checks, setChecks] = useState([]);
  const [due, setDue] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [checkForm, setCheckForm] = useState({ property_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => Promise.all([
    api.get('/properties'),
    api.get('/qc/checks'),
    api.get('/scheduling/due'),
    api.get('/qc/checklists'),
    api.get('/managers'),
  ]).then(([p, q, d, cl, m]) => {
    setProperties(p.data);
    setChecks(q.data);
    setDue(d.data);
    setChecklists(cl.data);
    setManagers(m.data);
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const dueInfo = id => due?.properties.find(p => p.id === id);
  const avgScore = id => {
    const c = checks.filter(c => c.property_id === id && c.status === 'complete' && c.check_type === 'property');
    return c.length ? c.reduce((s, c) => s + c.score_pct, 0) / c.length : null;
  };

  const createCheck = async () => {
    const { property_id, checklist_id, assigned_to_id, date } = checkForm;
    if (!property_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    const r = await api.post('/qc/checks', { ...checkForm, staff_id: null, check_type: 'property' });
    setShowModal(false);
    navigate(`/qc/checks/${r.data.id}`);
  };

  const deleteCheck = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this QC check?')) return;
    await api.delete(`/qc/checks/${id}`);
    setChecks(c => c.filter(x => x.id !== id));
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const filteredChecks = filter === 'all' ? checks
    : checks.filter(c => c.status === filter);

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px' }}>Properties</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>{properties.length} properties</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Property Health Check</button>
      </div>

      <div className="tab-row">
        <button className={`tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab-btn${tab === 'qc' ? ' active' : ''}`} onClick={() => setTab('qc')}>Health Checks</button>
        <button className={`tab-btn${tab === 'access' ? ' active' : ''}`} onClick={() => setTab('access')}>Access Details</button>
      </div>

      {tab === 'overview' && (
        <>
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
            <thead><tr>
              <th>Property</th><th>Due Status</th><th>Last Check</th><th>Next Due</th><th>Avg Score</th><th>Total Checks</th>
            </tr></thead>
            <tbody>
              {properties.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => {
                const d = dueInfo(p.id);
                const avg = avgScore(p.id);
                const total = checks.filter(c => c.property_id === p.id && c.status === 'complete' && c.check_type === 'property').length;
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/properties/${p.id}`)}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td>{d ? <DueBadge status={d.status} daysLeft={d.days_left} /> : <span style={{ color: 'var(--t3)' }}>—</span>}</td>
                    <td style={{ color: 'var(--t2)' }}>{d?.last_check_date || 'Never'}</td>
                    <td style={{ color: 'var(--t2)' }}>{d?.next_due || '—'}</td>
                    <td><ScoreBadge score={avg} /></td>
                    <td style={{ color: 'var(--t2)' }}>{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'access' && (
        <AccessDetailsTab properties={properties} />
      )}

      {tab === 'qc' && (
        <>
          <div className="tab-row mb-6">
            {[['all','All'],['pending','Pending'],['complete','Complete']].map(([v,l]) => (
              <button key={v} className={`tab-btn${filter===v?' active':''}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          {filteredChecks.length === 0
            ? <div className="empty-state"><div className="icon">🏠</div>No property health checks found.</div>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Property</th><th>Staff</th><th>Checklist</th><th>Score</th><th>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {filteredChecks.map(c => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                        <td style={{ color: 'var(--t3)' }}>{c.date}</td>
                        <td style={{ fontWeight: 700 }}>{c.property_name}</td>
                        <td style={{ color: 'var(--t2)' }}>{c.staff_name}</td>
                        <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                        <td>{c.status === 'complete' ? <ScoreBadge score={c.score_pct} /> : <span style={{ color: 'var(--t3)' }}>—</span>}</td>
                        <td><StatusBadge status={c.status} /></td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-danger" onClick={e => deleteCheck(c.id, e)}>Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Property Health Check</div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select className="form-select" value={checkForm.property_id} onChange={e => setCheckForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Checklist</label>
              <select className="form-select" value={checkForm.checklist_id} onChange={e => setCheckForm(f => ({ ...f, checklist_id: e.target.value }))}>
                <option value="">Select checklist…</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assign To</label>
              <select className="form-select" value={checkForm.assigned_to_id} onChange={e => setCheckForm(f => ({ ...f, assigned_to_id: e.target.value }))}>
                <option value="">Select manager…</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={checkForm.date} onChange={e => setCheckForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={createCheck}>Create & Open</button>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
