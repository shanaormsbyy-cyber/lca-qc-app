import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { useAuth } from '../context/AuthContext';
import { ScoreBadge, DueBadge } from '../components/Badge';
import { fmtDate } from '../utils';

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
  const [watchlist, setWatchlist] = useState([]);
  const [flaggedWeek, setFlaggedWeek] = useState([]);
  const [flaggedMonth, setFlaggedMonth] = useState([]);
  const [flagTab, setFlagTab] = useState('week');

  // Create check modal
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('staff');
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: today });
  const [creating, setCreating] = useState(false);

  const load = () => {
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
    api.get('/kpis/watchlist').then(r => setWatchlist(r.data.watchlist || [])).catch(() => {});
    api.get('/kpis/flagged-items?period=week').then(r => setFlaggedWeek(r.data.items || [])).catch(() => {});
    api.get('/kpis/flagged-items?period=month').then(r => setFlaggedMonth(r.data.items || [])).catch(() => {});
  };

  useEffect(() => { load(); }, [manager.id]);
  useLiveSync(load);

  const openCreate = async (preselect = {}, type = 'staff') => {
    // Always reload checklists fresh so newly created ones appear
    const freshCL = await api.get('/qc/checklists').then(r => r.data).catch(() => checklists);
    setChecklists(freshCL);
    setCreateType(type);
    const defaultCL = freshCL.find(cl => cl.default_for === type);
    setCheckForm({
      property_id: String(preselect.property_id || ''),
      staff_id: String(preselect.staff_id || ''),
      checklist_id: defaultCL ? String(defaultCL.id) : '',
      assigned_to_id: String(manager.id),
      date: today,
    });
    setShowCreate(true);
  };

  const createCheck = async () => {
    const { property_id, staff_id, checklist_id, assigned_to_id, date } = checkForm;
    const staffRequired = createType !== 'property';
    if (!property_id || (staffRequired && !staff_id) || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    setCreating(true);
    try {
      const payload = { ...checkForm, staff_id: staff_id || null };
      const r = await api.post('/qc/checks', payload);
      setShowCreate(false);
      navigate(`/qc/checks/${r.data.id}`);
    } catch (e) {
      alert('Failed to create check: ' + (e.response?.data?.error || e.message));
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

  // Staff avg: only checks tagged as staff-type (evaluating the cleaner's performance)
  const staffChecks = completeQC.filter(q => q.check_type === 'staff' || !q.check_type);
  const staffIds = [...new Set(staffChecks.map(q => q.staff_id))];
  const staffAvg = staffIds.length
    ? Math.round(staffIds.reduce((sum, sid) => {
        const c = staffChecks.filter(q => q.staff_id === sid);
        return sum + c.reduce((s, q) => s + q.score_pct, 0) / c.length;
      }, 0) / staffIds.length)
    : null;

  // Property avg: only checks tagged as property-type (evaluating the property's health)
  const propertyChecks = completeQC.filter(q => q.check_type === 'property');
  const propIds = [...new Set(propertyChecks.map(q => q.property_id))];
  const propAvg = propIds.length
    ? Math.round(propIds.reduce((sum, pid) => {
        const c = propertyChecks.filter(q => q.property_id === pid);
        return sum + c.reduce((s, q) => s + q.score_pct, 0) / c.length;
      }, 0) / propIds.length)
    : null;

  const scoreColor = v => v == null ? '' : v >= 80 ? ' green' : v >= 60 ? '' : ' red';
  const pendingQC = allQC.filter(q => q.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));

  const flagSeverityStyle = color => {
    if (color === 'red')   return { background: 'var(--red-dim)',   color: 'var(--red)',   border: '1px solid rgba(239,68,68,0.3)' };
    if (color === 'amber') return { background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' };
    if (color === 'blue')  return { background: 'var(--cyan-dim)',  color: 'var(--cyan)',  border: '1px solid rgba(58,181,217,0.3)' };
    return { background: 'var(--glass)', color: 'var(--t2)', border: '1px solid var(--glass-border)' };
  };

  const currentFlagged = flagTab === 'week' ? flaggedWeek : flaggedMonth;

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

      {/* Watchlist + Flagged Issues — side by side */}
      <div className="card-row mb-6">
        {/* Performance Watchlist */}
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">⚠️ Performance Watchlist</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          </div>
          {watchlist.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>
              ✓ All team members are performing above the threshold.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {watchlist.map(w => (
                <div key={w.id} onClick={() => navigate(`/staff/${w.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{w.total_checks} check{w.total_checks !== 1 ? 's' : ''} completed</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--red)' }}>{w.avg_score}%</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>below {w.threshold}% threshold</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commonly Flagged Issues */}
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">🚩 Commonly Flagged Issues</span>
          </div>
          <div className="tab-row" style={{ marginBottom: 16 }}>
            <button className={`tab-btn${flagTab === 'week' ? ' active' : ''}`} onClick={() => setFlagTab('week')}>This Week</button>
            <button className={`tab-btn${flagTab === 'month' ? ' active' : ''}`} onClick={() => setFlagTab('month')}>This Month</button>
          </div>
          {currentFlagged.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>
              No issues flagged enough times to appear yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentFlagged.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{item.category}</div>
                    {item.items?.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, lineHeight: 1.5 }}>
                        {item.items.join(' · ')}
                        {item.item_count > item.items.length ? ` +${item.item_count - item.items.length} more` : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, ...flagSeverityStyle(item.color) }}>{item.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{item.flag_count} flag{item.flag_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                  <div style={{ fontWeight: 700 }}>{q.check_type === 'property' ? 'Property Health Check' : 'Team QC Check'} — {q.property_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{q.staff_name} · {fmtDate(q.date)}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/qc/checks/${q.id}`); }}>Start</button>
              </div>
            ))}
            {myTrain.map(t => (
              <div key={t.id} onClick={() => navigate(`/training/sessions/${t.id}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 12, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Training — {t.trainee_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{t.checklist_name} · {fmtDate(t.date)}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/training/sessions/${t.id}`); }}>Start</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-6" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => openCreate('staff')}>👤 Start Team QC Check</button>
        <button className="btn btn-secondary" onClick={() => openCreate({}, 'property')}>🏠 Start Property Health Check</button>
        <button className="btn btn-ghost" onClick={() => navigate('/training')}>+ New Training</button>
        <button className="btn btn-ghost" onClick={() => navigate('/training/induction')}>📋 New Hire Induction</button>
      </div>

      {/* Overdue & Due Soon */}
      {(overdueStaff > 0 || dueSoonStaff > 0 || overdueProps > 0 || dueSoonProps > 0) && (
        <div className="card-row mb-6">
          {(overdueStaff > 0 || dueSoonStaff > 0) && (
            <div className="card" style={{ flex: 1, marginBottom: 0 }}>
              <div className="card-header">
                <span className="card-title">Team QC Due</span>
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
                <span className="card-title">Property Health Checks Due</span>
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
                      <button className="btn btn-sm btn-primary" onClick={() => openCreate({ property_id: p.id }, 'property')}>Start</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming QC checks */}
      {pendingQC.length > 0 && (
        <div className="card-row mb-6">
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
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>{fmtDate(q.date)}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{q.assigned_to_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                    <div style={{ fontSize: 13, color: 'var(--t2)' }}>{fmtDate(q.date)}</div>
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
                    <td style={{ color: 'var(--t3)' }}>{fmtDate(q.date)}</td>
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
            <div className="modal-title">{createType === 'property' ? 'New Property Health Check' : 'New Team QC Check'}</div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select className="form-select" value={checkForm.property_id} onChange={e => setCheckForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{createType === 'property' ? 'Who cleaned this property? (optional)' : 'Staff Member Being Assessed'}</label>
              <select className="form-select" value={checkForm.staff_id} onChange={e => setCheckForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">{createType === 'property' ? 'Select cleaner…' : 'Select staff member…'}</option>
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
