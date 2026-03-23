import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/Badge';

function ChecklistBuilder({ checklist, onSave, onCancel }) {
  const [name, setName] = useState(checklist?.name || '');
  const [desc, setDesc] = useState(checklist?.description || '');
  const [sections, setSections] = useState(checklist?.sections || []);

  const addSection = () => setSections(s => [...s, { name: '', items: [] }]);
  const updateSection = (i, name) => setSections(s => s.map((sec, idx) => idx === i ? { ...sec, name } : sec));
  const removeSection = i => setSections(s => s.filter((_, idx) => idx !== i));
  const addItem = si => setSections(s => s.map((sec, i) => i === si ? { ...sec, items: [...sec.items, { text: '' }] } : sec));
  const updateItem = (si, ii, text) => setSections(s => s.map((sec, i) => i === si ? { ...sec, items: sec.items.map((it, j) => j === ii ? { text } : it) } : sec));
  const removeItem = (si, ii) => setSections(s => s.map((sec, i) => i === si ? { ...sec, items: sec.items.filter((_, j) => j !== ii) } : sec));

  const handleSave = () => {
    if (!name.trim()) return alert('Checklist name required');
    onSave({ name, description: desc, sections });
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Checklist Name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Description (optional)</label>
        <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      {sections.map((sec, si) => (
        <div key={si} className="section-block mb-4">
          <div className="section-block-header">
            <input
              className="form-input" style={{ flex: 1, background: 'transparent', border: 'none', padding: '4px 0', fontSize: 14, fontWeight: 600 }}
              placeholder="Section name…" value={sec.name}
              onChange={e => updateSection(si, e.target.value)}
            />
            <button className="btn btn-sm btn-danger" onClick={() => removeSection(si)}>✕</button>
          </div>
          <div className="section-block-body">
            {sec.items.map((item, ii) => (
              <div key={ii} className="checklist-item-row">
                <span style={{ color: 'var(--t3)', fontSize: 12, minWidth: 20 }}>{ii + 1}.</span>
                <input
                  className="form-input" style={{ flex: 1 }}
                  placeholder="Checklist item…" value={item.text}
                  onChange={e => updateItem(si, ii, e.target.value)}
                />
                <button className="btn btn-sm btn-ghost" onClick={() => removeItem(si, ii)}>✕</button>
              </div>
            ))}
            <button className="btn btn-sm btn-ghost mt-4" onClick={() => addItem(si)}>+ Add item</button>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mb-4" onClick={addSection}>+ Add Section</button>
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={handleSave}>Save Checklist</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function Training() {
  const { manager } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCL, setEditingCL] = useState(null); // null=list, 'new', or checklist object
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({ trainee_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });

  const load = () => Promise.all([
    api.get('/training/sessions'),
    api.get('/training/checklists'),
    api.get('/staff'),
    api.get('/managers'),
  ]).then(([s, c, st, m]) => {
    setSessions(s.data); setChecklists(c.data); setStaff(st.data); setManagers(m.data);
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const saveCL = async data => {
    if (editingCL && editingCL !== 'new') await api.put(`/training/checklists/${editingCL.id}`, data);
    else await api.post('/training/checklists', data);
    await load();
    setEditingCL(null);
  };

  const deleteCL = async id => {
    if (!confirm('Delete this checklist?')) return;
    await api.delete(`/training/checklists/${id}`);
    setChecklists(c => c.filter(x => x.id !== id));
  };

  const createSession = async () => {
    const { trainee_id, checklist_id, assigned_to_id, date } = sessionForm;
    if (!trainee_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    const r = await api.post('/training/sessions', sessionForm);
    setShowNewSession(false);
    navigate(`/training/sessions/${r.data.id}`);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="section-header">
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Training</h1>
        <div className="flex gap-3">
          {tab === 'sessions' && <button className="btn btn-primary" onClick={() => setShowNewSession(true)}>+ New Session</button>}
          {tab === 'checklists' && <button className="btn btn-primary" onClick={() => setEditingCL('new')}>+ New Checklist</button>}
        </div>
      </div>

      <div className="tab-row">
        <button className={`tab-btn${tab === 'sessions' ? ' active' : ''}`} onClick={() => setTab('sessions')}>Sessions</button>
        <button className={`tab-btn${tab === 'checklists' ? ' active' : ''}`} onClick={() => setTab('checklists')}>Checklists</button>
        <button className="tab-btn" onClick={() => navigate('/training/induction')}>Induction Plan</button>
      </div>

      {tab === 'sessions' && (
        <>
          {sessions.length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div>No training sessions yet. Create one above.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Date</th><th>Trainee</th><th>Checklist</th><th>Assigned To</th><th>Completion</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/training/sessions/${s.id}`)}>
                      <td>{s.date}</td>
                      <td style={{ fontWeight: 600 }}>{s.trainee_name}</td>
                      <td style={{ color: 'var(--t2)' }}>{s.checklist_name}</td>
                      <td>{s.assigned_to_name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--navy3)', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
                            <div style={{ height: '100%', background: 'var(--green)', width: `${s.completion_pct}%` }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--t2)', minWidth: 32 }}>{Math.round(s.completion_pct)}%</span>
                        </div>
                      </td>
                      <td><StatusBadge status={s.status} /></td>
                      <td><button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); navigate(`/training/sessions/${s.id}`); }}>Open</button></td>
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
            <ChecklistBuilder
              checklist={editingCL === 'new' ? null : editingCL}
              onSave={saveCL}
              onCancel={() => setEditingCL(null)}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checklists.map(cl => (
                <div key={cl.id} className="card">
                  <div className="card-header">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{cl.name}</div>
                      {cl.description && <div style={{ color: 'var(--t2)', fontSize: 13, marginTop: 2 }}>{cl.description}</div>}
                      <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 4 }}>{cl.sections?.length || 0} sections · {cl.sections?.reduce((s, sec) => s + (sec.items?.length || 0), 0)} items</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditingCL(cl)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteCL(cl.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
              {checklists.length === 0 && <div className="empty-state"><div className="icon">📝</div>No checklists yet. Create one above.</div>}
            </div>
          )}
        </>
      )}

      {showNewSession && (
        <div className="modal-overlay" onClick={() => setShowNewSession(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Training Session</div>
            <div className="form-group">
              <label className="form-label">Trainee</label>
              <select className="form-select" value={sessionForm.trainee_id} onChange={e => setSessionForm(f => ({ ...f, trainee_id: e.target.value }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Checklist</label>
              <select className="form-select" value={sessionForm.checklist_id} onChange={e => setSessionForm(f => ({ ...f, checklist_id: e.target.value }))}>
                <option value="">Select checklist…</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assign To</label>
              <select className="form-select" value={sessionForm.assigned_to_id} onChange={e => setSessionForm(f => ({ ...f, assigned_to_id: e.target.value }))}>
                <option value="">Select manager…</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-textarea" value={sessionForm.notes} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={createSession}>Create & Open</button>
              <button className="btn btn-ghost" onClick={() => setShowNewSession(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
