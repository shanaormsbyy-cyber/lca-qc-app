import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/Badge';
import { fmtDate } from '../utils';
import useLiveSync from '../hooks/useLiveSync';

export default function Training() {
  useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
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
  useLiveSync(load);

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
        <button className="btn btn-primary" onClick={() => setShowNewSession(true)}>+ New Session</button>
      </div>

      <div className="tab-row">
        <button className="tab-btn active">Sessions</button>
        <button className="tab-btn" onClick={() => navigate('/training/induction')}>New Hire Induction</button>
      </div>

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
                  <td>{fmtDate(s.date)}</td>
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
