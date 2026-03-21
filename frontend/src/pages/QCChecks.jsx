import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ScoreBadge, StatusBadge } from '../components/Badge';

function QCChecklistBuilder({ checklist, onSave, onCancel }) {
  const [name, setName] = useState(checklist?.name || '');
  const [desc, setDesc] = useState(checklist?.description || '');
  const [items, setItems] = useState(checklist?.items || []);

  const addItem = () => setItems(i => [...i, { text: '', category: '', score_type: 'pass_fail', weight: 1 }]);
  const update = (idx, field, val) => setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));
  const remove = idx => setItems(i => i.filter((_, j) => j !== idx));

  const handleSave = () => {
    if (!name.trim()) return alert('Checklist name required');
    onSave({ name, description: desc, items });
  };

  return (
    <div>
      <div className="form-row mb-4">
        <div className="form-group">
          <label className="form-label">Checklist Name</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 14, color: 'var(--t2)' }}>Checklist Items ({items.length})</div>
      {items.map((item, i) => (
        <div key={i} className="card mb-4" style={{ padding: '14px 16px' }}>
          <div className="flex gap-2 mb-4">
            <div style={{ flex: 2 }}>
              <label className="form-label">Item Text</label>
              <input className="form-input" placeholder="What to check…" value={item.text} onChange={e => update(i, 'text', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Category</label>
              <input className="form-input" placeholder="e.g. Bathrooms" value={item.category} onChange={e => update(i, 'category', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div style={{ flex: 1 }}>
              <label className="form-label">Score Type</label>
              <select className="form-select" value={item.score_type} onChange={e => update(i, 'score_type', e.target.value)}>
                <option value="pass_fail">Pass / Fail</option>
                <option value="1_to_5">Score 1–5</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Weight</label>
              <select className="form-select" value={item.weight} onChange={e => update(i, 'weight', parseFloat(e.target.value))}>
                <option value="1">1 — Standard</option>
                <option value="2">2 — Important</option>
                <option value="3">3 — Critical</option>
              </select>
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>✕ Remove</button>
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mb-6" onClick={addItem}>+ Add Item</button>
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={handleSave}>Save Checklist</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function QCChecks() {
  const { manager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('checks');
  const [checks, setChecks] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCL, setEditingCL] = useState(null);
  const [showNewCheck, setShowNewCheck] = useState(false);
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [filter, setFilter] = useState('all');

  const load = () => Promise.all([
    api.get('/qc/checks'),
    api.get('/qc/checklists'),
    api.get('/staff'),
    api.get('/properties'),
    api.get('/managers'),
  ]).then(([c, cl, s, p, m]) => {
    setChecks(c.data); setChecklists(cl.data); setStaff(s.data); setProperties(p.data); setManagers(m.data);
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading && searchParams.get('openNew')) {
      const staffId = searchParams.get('staff_id') || '';
      const propertyId = searchParams.get('property_id') || '';
      setCheckForm(f => ({
        ...f,
        staff_id: staffId,
        property_id: propertyId,
        assigned_to_id: String(manager.id),
      }));
      setShowNewCheck(true);
      navigate(location.pathname, { replace: true });
    }
  }, [loading]);

  const saveCL = async data => {
    if (editingCL && editingCL !== 'new') await api.put(`/qc/checklists/${editingCL.id}`, data);
    else await api.post('/qc/checklists', data);
    await load(); setEditingCL(null);
  };

  const deleteCL = async id => {
    if (!confirm('Delete this checklist?')) return;
    await api.delete(`/qc/checklists/${id}`);
    setChecklists(c => c.filter(x => x.id !== id));
  };

  const createCheck = async () => {
    const { property_id, staff_id, checklist_id, assigned_to_id, date } = checkForm;
    if (!property_id || !staff_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    const r = await api.post('/qc/checks', checkForm);
    setShowNewCheck(false);
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
    : filter === 'mine' ? checks.filter(c => c.assigned_to_id === manager.id)
    : checks.filter(c => c.status === filter);

  return (
    <div className="page">
      <div className="section-header">
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>QC Checks</h1>
        <div className="flex gap-3">
          {tab === 'checks' && <button className="btn btn-primary" onClick={() => setShowNewCheck(true)}>+ New QC Check</button>}
          {tab === 'checklists' && <button className="btn btn-primary" onClick={() => setEditingCL('new')}>+ New Checklist</button>}
        </div>
      </div>

      <div className="tab-row">
        <button className={`tab-btn${tab === 'checks' ? ' active' : ''}`} onClick={() => setTab('checks')}>Checks</button>
        <button className={`tab-btn${tab === 'checklists' ? ' active' : ''}`} onClick={() => setTab('checklists')}>Checklists</button>
      </div>

      {tab === 'checks' && (
        <>
          <div className="tab-row mb-6">
            {[['all','All'],['pending','Pending'],['complete','Complete'],['mine','Assigned to me']].map(([v,l]) => (
              <button key={v} className={`tab-btn${filter===v?' active':''}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          {filteredChecks.length === 0 ? (
            <div className="empty-state"><div className="icon">✅</div>No QC checks found.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Date</th><th>Property</th><th>Staff</th><th>Checklist</th><th>Assigned To</th><th>Score</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {filteredChecks.map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                      <td>{c.date}</td>
                      <td style={{ fontWeight: 600 }}>{c.property_name}</td>
                      <td>{c.staff_name}</td>
                      <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                      <td>{c.assigned_to_name}</td>
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
          )}
        </>
      )}

      {tab === 'checklists' && (
        <>
          {editingCL ? (
            <QCChecklistBuilder checklist={editingCL === 'new' ? null : editingCL} onSave={saveCL} onCancel={() => setEditingCL(null)} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checklists.map(cl => (
                <div key={cl.id} className="card">
                  <div className="card-header">
                    <div>
                      <div style={{ fontWeight: 700 }}>{cl.name}</div>
                      {cl.description && <div style={{ color: 'var(--t2)', fontSize: 13, marginTop: 2 }}>{cl.description}</div>}
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{cl.items?.length || 0} items</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditingCL(cl)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteCL(cl.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {checklists.length === 0 && <div className="empty-state"><div className="icon">📝</div>No checklists yet.</div>}
            </div>
          )}
        </>
      )}

      {showNewCheck && (
        <div className="modal-overlay" onClick={() => setShowNewCheck(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New QC Check</div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select className="form-select" value={checkForm.property_id} onChange={e => setCheckForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Staff Member Being Assessed</label>
              <select className="form-select" value={checkForm.staff_id} onChange={e => setCheckForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
              <button className="btn btn-ghost" onClick={() => setShowNewCheck(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
