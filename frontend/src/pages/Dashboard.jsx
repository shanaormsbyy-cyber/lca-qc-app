import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ScoreBadge, DueBadge } from '../components/Badge';

const today = new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const { manager } = useAuth();
  const navigate = useNavigate();
  const [due, setDue] = useState(null);
  const [myQC, setMyQC] = useState([]);
  const [myTrain, setMyTrain] = useState([]);
  const [recentQC, setRecentQC] = useState([]);
  const [allQC, setAllQC] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create check modal
  const [showCreate, setShowCreate] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: today });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/scheduling/due'),
      api.get('/qc/checks'),
      api.get('/training/sessions'),
      api.get('/qc/checklists'),
      api.get('/staff'),
      api.get('/properties'),
      api.get('/managers'),
    ]).then(([dueR, qcR, trainR, clR, sR, pR, mR]) => {
      setDue(dueR.data);
      const qc = qcR.data;
      const train = trainR.data;
      setAllQC(qc);
      setMyQC(qc.filter(q => q.assigned_to_id === manager.id && q.status === 'pending'));
      setMyTrain(train.filter(t => t.assigned_to_id === manager.id && t.status === 'pending'));
      setRecentQC(qc.filter(q => q.status === 'complete').slice(0, 5));
      setChecklists(clR.data);
      setStaff(sR.data);
      setProperties(pR.data);
      setManagers(mR.data);
    }).finally(() => setLoading(false));
  }, [manager.id]);

  const openCreate = (preselect = {}) => {
    setCheckForm({
      property_id: String(preselect.property_id || ''),
      staff_id: String(preselect.staff_id || ''),
      checklist_id: '',
      assigned_to_id: String(manager.id),
      date: today,
    });
    setShowCreate(true);
  };

  const createCheck = async () => {
    const { property_id, staff_id, checklist_id, assigned_to_id, date } = checkForm;
    if (!property_id || !staff_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    setCreating(true);
    try {
      const r = await api.post('/qc/checks', checkForm);
      setShowCreate(false);
      navigate(`/qc/checks/${r.data.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading…</span></div>;

  const overdueStaff  = due?.staff.filter(s => s.status === 'overdue').length || 0;
  const dueSoonStaff  = due?.staff.filter(s => s.status === 'due_soon').length || 0;
  const overdueProps  = due?.properties.filter(p => p.status === 'overdue').length || 0;
  const dueSoonProps  = due?.properties.filter(p => p.status === 'due_soon').length || 0;
  const totalPending  = myQC.length + myTrain.length;

  const completeQC = allQC.filter(q => q.status === 'complete');

  const staffIds = [...new Set(completeQC.map(q => q.staff_id))];
  const staffAvg = staffIds.length
    ? Math.round(staffIds.reduce((sum, sid) => {
        const c = completeQC.filter(q => q.staff_id === sid);
        return sum + c.reduce((s, q) => s + q.score_pct, 0) / c.length;
      }, 0) / staffIds.length)
    : null;

  const propIds = [...new Set(completeQC.map(q => q.property_id))];
  const propAvg = propIds.length
    ? Math.round(propIds.reduce((sum, pid) => {
        const c = completeQC.filter(q => q.property_id === pid);
        return sum + c.reduce((s, q) => s + q.score_pct, 0) / c.length;
      }, 0) / propIds.length)
    : null;

  const scoreColor = v => v == null ? '' : v >= 80 ? ' green' : v >= 60 ? '' : ' red';

  const pendingQC = allQC.filter(q => q.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {manager.name}</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className={`stat-card${overdueStaff > 0 ? ' danger' : ''}`} onClick={() => navigate('/staff')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Staff Overdue QC</div>
          <div className={`stat-value${overdueStaff > 0 ? ' red' : ' green'}`}>{overdueStaff}</div>
          <div className="stat-sub">{dueSoonStaff > 0 ? `+${dueSoonStaff} due soon` : 'All on track'}</div>
        </div>
        <div className={`stat-card${overdueProps > 0 ? ' danger' : ''}`} onClick={() => navigate('/properties')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Properties Overdue</div>
          <div className={`stat-value${overdueProps > 0 ? ' red' : ' green'}`}>{overdueProps}</div>
          <div className="stat-sub">{dueSoonProps > 0 ? `+${dueSoonProps} due soon` : 'All on track'}</div>
        </div>
        <div className="stat-card" onClick={() => navigate('/staff')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Avg Team Score</div>
          <div className={`stat-value${scoreColor(staffAvg)}`}>{staffAvg != null ? `${staffAvg}%` : '—'}</div>
          <div className="stat-sub">Per cleaner average</div>
        </div>
        <div className="stat-card" onClick={() => navigate('/properties')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Avg Property Score</div>
          <div className={`stat-value${scoreColor(propAvg)}`}>{propAvg != null ? `${propAvg}%` : '—'}</div>
          <div className="stat-sub">Per property average</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }}>
          <div className="stat-label">My Pending Tasks</div>
          <div className={`stat-value${totalPending > 0 ? ' cyan' : ''}`}>{totalPending}</div>
          <div className="stat-sub">{myQC.length} QC · {myTrain.length} training</div>
        </div>
      </div>

      {/* My Tasks */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">My Tasks</span>
          {totalPending > 0 && <span className="badge badge-blue">{totalPending} pending</span>}
        </div>
        {totalPending === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 14, padding: '8px 0' }}>No tasks assigned to you right now.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myQC.map(q => (
              <div key={q.id} onClick={() => navigate(`/qc/checks/${q.id}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 12, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>QC Check — {q.property_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{q.staff_name} · {q.date}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/qc/checks/${q.id}`); }}>Start</button>
              </div>
            ))}
            {myTrain.map(t => (
              <div key={t.id} onClick={() => navigate(`/training/sessions/${t.id}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 12, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Training — {t.trainee_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{t.checklist_name} · {t.date}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/training/sessions/${t.id}`); }}>Start</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-6">
        <button className="btn btn-primary" onClick={() => openCreate()}>+ New QC Check</button>
        <button className="btn btn-secondary" onClick={() => navigate('/training')}>+ New Training</button>
      </div>

      {/* Overdue & Due Soon — two cards */}
      {(overdueStaff > 0 || dueSoonStaff > 0 || overdueProps > 0 || dueSoonProps > 0) && (
        <div className="flex gap-4 mb-6" style={{ alignItems: 'flex-start' }}>
          {(overdueStaff > 0 || dueSoonStaff > 0) && (
            <div className="card" style={{ flex: 1, marginBottom: 0 }}>
              <div className="card-header">
                <span className="card-title">Staff QC Due</span>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('/staff')}>View all →</button>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
                <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: overdueStaff > 0 ? 'var(--red)' : 'var(--amber)' }}>{overdueStaff + dueSoonStaff}</div>
                <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
                  {overdueStaff > 0 && <span style={{ color: 'var(--red)' }}>{overdueStaff} overdue</span>}
                  {overdueStaff > 0 && dueSoonStaff > 0 && <span style={{ color: 'var(--t3)' }}> · </span>}
                  {dueSoonStaff > 0 && <span style={{ color: 'var(--amber)' }}>{dueSoonStaff} due soon</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {due?.staff.filter(s => s.status !== 'ok').map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DueBadge status={s.status} daysLeft={s.days_left} />
                      <button className="btn btn-sm btn-primary" onClick={() => openCreate({ staff_id: s.id })}>Start</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(overdueProps > 0 || dueSoonProps > 0) && (
            <div className="card" style={{ flex: 1, marginBottom: 0 }}>
              <div className="card-header">
                <span className="card-title">Properties QC Due</span>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('/properties')}>View all →</button>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
                <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, color: overdueProps > 0 ? 'var(--red)' : 'var(--amber)' }}>{overdueProps + dueSoonProps}</div>
                <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
                  {overdueProps > 0 && <span style={{ color: 'var(--red)' }}>{overdueProps} overdue</span>}
                  {overdueProps > 0 && dueSoonProps > 0 && <span style={{ color: 'var(--t3)' }}> · </span>}
                  {dueSoonProps > 0 && <span style={{ color: 'var(--amber)' }}>{dueSoonProps} due soon</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {due?.properties.filter(p => p.status !== 'ok').map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <DueBadge status={p.status} daysLeft={p.days_left} />
                      <button className="btn btn-sm btn-primary" onClick={() => openCreate({ property_id: p.id })}>Start</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming QC checks — two cards side by side */}
      {pendingQC.length > 0 && (
        <div className="flex gap-4 mb-6" style={{ alignItems: 'flex-start' }}>
          {/* By cleaner */}
          <div className="card" style={{ flex: 1, marginBottom: 0 }}>
            <div className="card-header">
              <span className="card-title">Upcoming — By Cleaner</span>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{pendingQC.length} scheduled</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingQC.map(q => (
                <div key={q.id} onClick={() => navigate(`/qc/checks/${q.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{q.staff_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{q.property_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>{q.date}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{q.assigned_to_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By property */}
          <div className="card" style={{ flex: 1, marginBottom: 0 }}>
            <div className="card-header">
              <span className="card-title">Upcoming — By Property</span>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{pendingQC.length} scheduled</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingQC.map(q => (
                <div key={q.id} onClick={() => navigate(`/qc/checks/${q.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{q.property_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{q.staff_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>{q.date}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{q.assigned_to_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent QC checks */}
      {recentQC.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent QC Checks</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Date</th><th>Property</th><th>Staff</th><th>Score</th><th>Signed off by</th>
              </tr></thead>
              <tbody>
                {recentQC.map(q => (
                  <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${q.id}`)}>
                    <td style={{ color: 'var(--t3)' }}>{q.date}</td>
                    <td style={{ fontWeight: 600 }}>{q.property_name}</td>
                    <td>{q.staff_name}</td>
                    <td><ScoreBadge score={q.score_pct} /></td>
                    <td style={{ color: 'var(--t2)' }}>{q.signed_off_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create QC Check modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
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
              <button className="btn btn-primary" onClick={createCheck} disabled={creating}>{creating ? 'Creating…' : 'Create & Open'}</button>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
