import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  const [topPerformers, setTopPerformers] = useState([]);
  const [flaggedWeek, setFlaggedWeek] = useState([]);
  const [flaggedMonth, setFlaggedMonth] = useState([]);
  const [flagTab, setFlagTab] = useState('week');
  const [heatpumpsDue, setHeatpumpsDue] = useState(0);
  const [coachingFollowUp, setCoachingFollowUp] = useState(0);
  const [coachingStaffIds, setCoachingStaffIds] = useState(new Set());
  const [firstPassData, setFirstPassData] = useState(null);
  const [recleanTimeData, setRecleanTimeData] = useState(null);
  const [flagDetail, setFlagDetail] = useState(null);
  const [flagTrend, setFlagTrend] = useState(null);

  // Create check modal
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState('staff');
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: today, room_counts: {} });
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
    api.get('/kpis/top-performers').then(r => setTopPerformers(r.data.topPerformers || [])).catch(() => {});
    api.get('/kpis/flagged-items?period=week').then(r => setFlaggedWeek(r.data.items || [])).catch(() => {});
    api.get('/kpis/flagged-items?period=month').then(r => setFlaggedMonth(r.data.items || [])).catch(() => {});
    api.get('/heatpump/records').then(r => {
      const in7 = new Date(); in7.setDate(in7.getDate() + 7);
      const cutoff = in7.toISOString().slice(0, 10);
      const count = r.data.filter(h => h.due_date && h.due_date <= cutoff).length;
      setHeatpumpsDue(count);
    }).catch(() => {});
    api.get('/coaching').then(r => {
      const count = r.data.filter(s => s.status === 'open' && s.followup_date).length;
      setCoachingFollowUp(count);
      setCoachingStaffIds(new Set(r.data.filter(s => s.status === 'open').map(s => s.staff_id)));
    }).catch(() => {});
    api.get('/kpis/first-pass-rate').then(r => setFirstPassData(r.data)).catch(() => {});
    api.get('/kpis/reclean-time').then(r => setRecleanTimeData(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, [manager.id]);
  useLiveSync(load);

  const openFlagDetail = async (item) => {
    setFlagDetail(item);
    setFlagTrend(null);
    const r = await api.get(`/kpis/flagged-items/trend?category=${encodeURIComponent(item.category)}`);
    setFlagTrend(r.data);
  };

  const openCreate = async (preselect = {}, type = 'staff') => {
    const [freshCL, freshProps] = await Promise.all([
      api.get('/qc/checklists').then(r => r.data).catch(() => checklists),
      api.get('/properties').then(r => r.data).catch(() => properties),
    ]);
    setChecklists(freshCL);
    setProperties(freshProps);
    setCreateType(type);
    const defaultCL = freshCL.find(cl => cl.default_for === type);
    const checklistId = defaultCL ? String(defaultCL.id) : '';
    const propertyId = String(preselect.property_id || '');
    const room_counts = checklistId && propertyId
      ? (() => {
          const prop = freshProps.find(p => String(p.id) === propertyId);
          const cl = freshCL.find(c => String(c.id) === checklistId);
          const rs = cl?.repeatable_sections || [];
          let saved = {};
          try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
          return Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
        })()
      : {};
    setCheckForm({
      property_id: propertyId,
      staff_id: String(preselect.staff_id || ''),
      checklist_id: checklistId,
      assigned_to_id: String(manager.id),
      date: today,
      room_counts,
    });
    setShowCreate(true);
  };

  const createCheck = async () => {
    const { property_id, staff_id, checklist_id, assigned_to_id, date } = checkForm;
    const staffRequired = createType !== 'property';
    if (!property_id || (staffRequired && !staff_id) || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    setCreating(true);
    try {
      const payload = { ...checkForm, staff_id: staff_id || null, check_type: createType };
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

  // Staff avg: simple mean across all completed staff checks (correct — not averaged per-person first)
  const staffChecks = completeQC.filter(q => (q.check_type === 'staff' || !q.check_type) && q.score_pct != null);
  const staffAvg = staffChecks.length
    ? Math.round(staffChecks.reduce((sum, q) => sum + q.score_pct, 0) / staffChecks.length)
    : null;

  // Property avg: simple mean across all completed property checks
  const propertyChecks = completeQC.filter(q => q.check_type === 'property' && q.score_pct != null);
  const propAvg = propertyChecks.length
    ? Math.round(propertyChecks.reduce((sum, q) => sum + q.score_pct, 0) / propertyChecks.length)
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
        <div className={`stat-card${heatpumpsDue > 0 ? ' danger' : ''}`} onClick={() => navigate('/heatpump')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Heat Pumps Due (7 days)</div>
          <div className={`stat-value${heatpumpsDue > 0 ? ' red' : ' green'}`}>{heatpumpsDue}</div>
          <div className="stat-sub">{heatpumpsDue > 0 ? 'Filters need attention' : 'All up to date'}</div>
        </div>
        <div className={`stat-card${coachingFollowUp > 0 ? ' danger' : ''}`} onClick={() => navigate('/coaching')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">Coaching Follow-ups Due</div>
          <div className={`stat-value${coachingFollowUp > 0 ? ' amber' : ' green'}`}>{coachingFollowUp}</div>
          <div className="stat-sub">{coachingFollowUp > 0 ? 'Open sessions with follow-up' : 'No follow-ups scheduled'}</div>
        </div>

        {/* First-Time Pass Rate stat card */}
        {firstPassData && (
          <div className="stat-card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div className="stat-label">First-Time Pass Rate</div>
                <div className={`stat-value${firstPassData.rate == null ? '' : firstPassData.rate >= 85 ? ' green' : firstPassData.rate >= 70 ? ' amber' : ' red'}`} style={{ marginTop: 4 }}>
                  {firstPassData.rate != null ? `${firstPassData.rate}%` : '—'}
                </div>
                <div className="stat-sub" style={{ marginTop: 4 }}>
                  {firstPassData.total > 0 ? `${firstPassData.passed} of ${firstPassData.total} passed ≥${firstPassData.threshold}%` : 'No data yet'}
                </div>
              </div>
            </div>
            {(() => {
              const trend = (firstPassData.trend || []).filter(m => m.total > 0);
              if (trend.length < 1) return null;
              const barW = 20, gap = 4, chartH = 60;
              const svgW = trend.length * (barW + gap);
              return (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <svg width={svgW} height={chartH + 22} style={{ display: 'block' }}>
                    <line x1={0} y1={chartH - 0.85 * chartH} x2={svgW} y2={chartH - 0.85 * chartH} stroke="rgba(34,197,94,0.3)" strokeWidth={1} strokeDasharray="3 2" />
                    {trend.map((m, i) => {
                      const x = i * (barW + gap);
                      const h = ((m.rate || 0) / 100) * chartH;
                      const y = chartH - h;
                      const col = m.rate >= 85 ? 'var(--ok)' : m.rate >= 70 ? 'var(--amber)' : 'var(--red)';
                      return (
                        <g key={m.month}>
                          <rect x={x} y={y} width={barW} height={h} rx={3} fill={col} opacity={0.85} />
                          <text x={x + barW / 2} y={chartH + 12} fill="var(--t3)" fontSize={8} textAnchor="middle">{m.label}</text>
                          <text x={x + barW / 2} y={chartH + 20} fill="var(--t3)" fontSize={7} textAnchor="middle">{m.total}✓</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })()}
          </div>
        )}

        {/* Avg Re-clean Time stat card */}
        {recleanTimeData && (
          <div className="stat-card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div className="stat-label">Avg Re-clean Time</div>
                <div className="stat-value amber" style={{ marginTop: 4 }}>
                  {recleanTimeData.avg_minutes != null ? `${recleanTimeData.avg_minutes}m` : '—'}
                </div>
                <div className="stat-sub" style={{ marginTop: 4 }}>
                  {recleanTimeData.total_recleans > 0 ? `${recleanTimeData.total_recleans} re-clean${recleanTimeData.total_recleans !== 1 ? 's' : ''} recorded` : 'No re-cleans yet'}
                </div>
              </div>
            </div>
            {(() => {
              const trend = (recleanTimeData.trend || []).filter(m => m.total_recleans > 0);
              if (trend.length < 1) return null;
              const maxMins = Math.max(...trend.map(m => m.avg_minutes || 0), 1);
              const barW = 20, gap = 4, chartH = 60;
              const svgW = trend.length * (barW + gap);
              return (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <svg width={svgW} height={chartH + 22} style={{ display: 'block' }}>
                    {trend.map((m, i) => {
                      const x = i * (barW + gap);
                      const h = ((m.avg_minutes || 0) / maxMins) * chartH;
                      const y = chartH - h;
                      return (
                        <g key={m.month}>
                          <rect x={x} y={y} width={barW} height={h} rx={3} fill="var(--amber)" opacity={0.75} />
                          <text x={x + barW / 2} y={chartH + 12} fill="var(--t3)" fontSize={8} textAnchor="middle">{m.label}</text>
                          <text x={x + barW / 2} y={chartH + 20} fill="var(--t3)" fontSize={7} textAnchor="middle">{m.total_recleans}x</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Watchlist + Top Performers + Flagged Issues */}
      <div className="card-row mb-6">
        {/* Performance Watchlist */}
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">Performance Watchlist</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          </div>
          {watchlist.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>
              All team members are performing above the threshold.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {watchlist.map(w => {
                const isComplaintRisk = w.watchlist_reason === 'complaints';
                const rowBg = isComplaintRisk ? 'rgba(245,158,11,0.07)' : 'var(--red-dim)';
                const rowBorder = isComplaintRisk ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(239,68,68,0.25)';
                return (
                  <div key={w.id} onClick={() => navigate(`/staff/${w.id}`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: rowBg, border: rowBorder, borderRadius: 10, cursor: 'pointer' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{w.name}</span>
                        {isComplaintRisk && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' }}>Complaint risk</span>
                        )}
                        {coachingStaffIds.has(w.id)
                          ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(58,181,217,0.15)', color: 'var(--cyan)', border: '1px solid rgba(58,181,217,0.3)' }}>In coaching</span>
                          : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(239,68,68,0.12)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>No coaching</span>
                        }
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                        {isComplaintRisk
                          ? `${(w.serious_complaints || 0) > 0 ? `${w.serious_complaints} serious` : ''}${(w.serious_complaints || 0) > 0 && (w.moderate_complaints || 0) > 0 ? ', ' : ''}${(w.moderate_complaints || 0) > 0 ? `${w.moderate_complaints} moderate` : ''} complaint${((w.serious_complaints||0)+(w.moderate_complaints||0)) !== 1 ? 's' : ''} in 90d`
                          : `${w.total_checks} check${w.total_checks !== 1 ? 's' : ''} completed`
                        }
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {isComplaintRisk ? (
                        <>
                          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--amber)' }}>Complaints</div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{w.avg_score != null ? `QC avg: ${w.avg_score}%` : 'No QC data'}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--red)' }}>{w.avg_score}%</div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>below {w.threshold}% threshold</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Performers */}
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title">Top Performers</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          </div>
          {topPerformers.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>
              No cleaners have reached the top performer threshold yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topPerformers.map((w, i) => (
                <div key={w.id} onClick={() => navigate(`/staff/${w.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--cyan-dim)', border: '1px solid rgba(58,181,217,0.25)', borderRadius: 10, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontSize: 11, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{w.total_checks} check{w.total_checks !== 1 ? 's' : ''} completed</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--cyan)' }}>{w.avg_score}%</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>avg score</div>
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
                <div key={i} onClick={() => openFlagDetail(item)} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 10, cursor: 'pointer' }}>
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

      {/* Flagged category detail modal */}
      {flagDetail && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.6)' }} onClick={() => setFlagDetail(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 200, background: 'var(--card)', borderRadius: 16, width: 'min(560px, 95vw)', maxHeight: '80vh', overflowY: 'auto', padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{flagDetail.category}</div>
                <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>{flagDetail.flag_count} flags · <span style={{ ...flagSeverityStyle(flagDetail.color), padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{flagDetail.label}</span></div>
              </div>
              <button onClick={() => setFlagDetail(null)} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>✕</button>
            </div>

            {!flagTrend ? (
              <div className="loading" style={{ height: 80 }}><div className="spinner" /></div>
            ) : (
              <>
                {flagTrend.trend?.some(t => t.flag_count > 0) && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>Flag trend — last 8 weeks</div>
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={flagTrend.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" tick={{ fill: 'var(--t3)', fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fill: 'var(--t3)', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => [v, 'Flags']} />
                        <Line type="monotone" dataKey="flag_count" stroke="var(--red)" strokeWidth={2} dot={{ fill: 'var(--red)', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>All-time breakdown by item</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {flagTrend.items?.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, gap: 12 }}>
                      <span style={{ fontSize: 13, flex: 1 }}>{it.text}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', flexShrink: 0 }}>{it.flag_count}× flagged</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Create QC Check modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{createType === 'property' ? 'New Property Health Check' : 'New Team QC Check'}</div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select
                className="form-select"
                value={checkForm.property_id}
                onChange={e => {
                  const propertyId = e.target.value;
                  const prop = properties.find(p => String(p.id) === propertyId);
                  const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
                  const rs = cl?.repeatable_sections || [];
                  let saved = {};
                  try { saved = JSON.parse(prop?.room_config || '{}'); } catch { saved = {}; }
                  const room_counts = Object.fromEntries(rs.map(s => [s, saved[s] ?? 1]));
                  setCheckForm(f => ({ ...f, property_id: propertyId, room_counts }));
                }}
              >
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {createType !== 'property' && (
            <div className="form-group">
              <label className="form-label">Staff Member Being Assessed</label>
              <select className="form-select" value={checkForm.staff_id} onChange={e => setCheckForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            )}
            <div className="form-group">
              <label className="form-label">Checklist</label>
              <select className="form-select" value={checkForm.checklist_id} onChange={e => setCheckForm(f => ({ ...f, checklist_id: e.target.value }))}>
                <option value="">Select checklist…</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {checkForm.checklist_id && (() => {
              const cl = checklists.find(c => String(c.id) === String(checkForm.checklist_id));
              const rs = cl?.repeatable_sections || [];
              if (rs.length === 0) return null;
              return (
                <div className="card mb-2" style={{ padding: '14px 16px', background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--t2)' }}>Property room counts</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                    {rs.map(section => (
                      <div key={section}>
                        <label className="form-label" style={{ fontSize: 12 }}>{section}s</label>
                        <input
                          type="number" min="1" max="20"
                          className="form-input"
                          value={checkForm.room_counts[section] ?? 1}
                          onChange={e => setCheckForm(f => ({ ...f, room_counts: { ...f.room_counts, [section]: parseInt(e.target.value) || 1 } }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
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
