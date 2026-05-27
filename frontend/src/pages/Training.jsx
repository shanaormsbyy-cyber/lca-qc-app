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
  const [tab, setTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({ trainee_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });

  // Resources
  const [resources, setResources] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewingResource, setViewingResource] = useState(null);

  const loadResources = () => api.get('/training/resources').then(r => setResources(r.data));

  const load = () => Promise.all([
    api.get('/training/sessions'),
    api.get('/training/checklists'),
    api.get('/staff'),
    api.get('/managers'),
    api.get('/training/resources'),
  ]).then(([s, c, st, m, res]) => {
    setSessions(s.data); setChecklists(c.data); setStaff(st.data); setManagers(m.data);
    setResources(res.data);
    const induction = c.data.find(cl => /induction|onboarding/i.test(cl.name)) || c.data[0];
    if (induction) setSessionForm(f => ({ ...f, checklist_id: String(induction.id) }));
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
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Onboarding</h1>
        {tab === 'sessions' && (
          <button className="btn btn-primary" onClick={() => setShowNewSession(true)}>+ New Session</button>
        )}
      </div>

      <div className="tab-row">
        <button className={`tab-btn${tab === 'sessions' ? ' active' : ''}`} onClick={() => setTab('sessions')}>Sessions</button>
        <button className={`tab-btn${tab === 'resources' ? ' active' : ''}`} onClick={() => setTab('resources')}>Resources</button>
        <button className="tab-btn" onClick={() => navigate('/training/induction')}>New Hire Induction</button>
      </div>

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && (
        sessions.length === 0 ? (
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
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); navigate(`/training/sessions/${s.id}`); }}>Open</button>
                        <button className="btn btn-sm btn-danger" onClick={async e => {
                          e.stopPropagation();
                          if (!confirm(`Delete session for ${s.trainee_name}?`)) return;
                          await api.delete(`/training/sessions/${s.id}`);
                          load();
                        }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Resources tab ── */}
      {tab === 'resources' && (
        <>
          <div className="card mb-5" style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Upload Resource</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>PDFs and images (max 20MB). Shared across all onboarding sessions.</div>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '20px', borderRadius: 10, cursor: 'pointer',
              border: '2px dashed rgba(58,181,217,0.4)', background: 'rgba(58,181,217,0.05)',
              color: uploading ? 'var(--t3)' : 'var(--cyan)', fontWeight: 700, fontSize: 14,
            }}>
              {uploading ? <><span className="spinner" /> Uploading…</> : '+ Tap to upload PDF or image'}
              <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                disabled={uploading}
                onChange={async e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setUploading(true);
                  const fd = new FormData();
                  fd.append('file', file);
                  await api.post('/training/resources', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  await loadResources();
                  setUploading(false);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {resources.length === 0 ? (
            <div style={{ color: 'var(--t3)', textAlign: 'center', padding: '32px 0' }}>
              No resources uploaded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {resources.map(r => {
                const isImage = r.mimetype.startsWith('image/');
                const url = `/uploads/${r.filename}`;
                return (
                  <div key={r.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div onClick={() => setViewingResource(r)} style={{
                      flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                      background: 'var(--glass)', border: '1px solid var(--glass-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isImage
                        ? <img src={url} alt={r.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 26 }}>📄</span>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.original_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                        Uploaded by {r.uploaded_by} · {new Date(r.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setViewingResource(r)}>Open</button>
                      <button className="btn btn-sm btn-danger" onClick={async () => {
                        if (!confirm(`Delete "${r.original_name}"?`)) return;
                        await api.delete(`/training/resources/${r.id}`);
                        setResources(prev => prev.filter(x => x.id !== r.id));
                      }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Resource viewer (fullscreen) ── */}
      {viewingResource && (
        <div onClick={() => setViewingResource(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', background: 'rgba(0,0,0,0.6)', flexShrink: 0,
          }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 120px)' }}>
              {viewingResource.original_name}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href={`/uploads/${viewingResource.filename}`} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()} className="btn btn-sm btn-secondary">↗ Open</a>
              <button className="btn btn-sm btn-ghost" onClick={() => setViewingResource(null)}>✕ Close</button>
            </div>
          </div>
          <div onClick={e => e.stopPropagation()} style={{
            flex: 1, width: '100%', overflow: 'auto',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16,
          }}>
            {viewingResource.mimetype.startsWith('image/') ? (
              <img src={`/uploads/${viewingResource.filename}`} alt={viewingResource.original_name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
            ) : (
              <iframe src={`/uploads/${viewingResource.filename}`} title={viewingResource.original_name}
                style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 80px)', border: 'none', borderRadius: 8 }} />
            )}
          </div>
        </div>
      )}

      {/* ── New session modal ── */}
      {showNewSession && (
        <div className="modal-overlay" onClick={() => setShowNewSession(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Onboarding Session</div>
            <div className="form-group">
              <label className="form-label">Trainee</label>
              <select className="form-select" value={sessionForm.trainee_id} onChange={e => setSessionForm(f => ({ ...f, trainee_id: e.target.value }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
