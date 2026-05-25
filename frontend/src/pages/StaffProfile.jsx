import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { ScoreBadge, StatusBadge } from '../components/Badge';
import { fmtDate } from '../utils';

export default function StaffProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [staff, setStaff] = useState(null);
  const [qcChecks, setQcChecks] = useState([]);
  const [trainSessions, setTrainSessions] = useState([]);
  const [commonIssues, setCommonIssues] = useState([]);
  const [coachingSessions, setCoachingSessions] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [activeTab, setActiveTab] = useState('qc');
  const [issuesMonth, setIssuesMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slackEmail, setSlackEmail] = useState('');
  const [slackEmailSaved, setSlackEmailSaved] = useState(false);

  const load = () => {
    Promise.all([
      api.get('/staff'),
      api.get('/qc/checks'),
      api.get('/training/sessions'),
    ]).then(([s, q, t]) => {
      const found = s.data.find(x => x.id === parseInt(id));
      setStaff(found);
      setSlackEmail(found?.slack_email || '');
      setQcChecks(q.data.filter(c => c.staff_id === parseInt(id) && c.status === 'complete' && (c.check_type === 'staff' || !c.check_type)));
      setTrainSessions(t.data.filter(x => x.trainee_id === parseInt(id)));
    }).finally(() => setLoading(false));
    api.get(`/kpis/staff/${id}/insights`).then(r => setInsights(r.data)).catch(() => {});
    api.get(`/coaching?staff_id=${id}`).then(r => setCoachingSessions(r.data)).catch(() => {});
    api.get(`/complaints?staff_id=${id}`).then(r => setComplaints(r.data)).catch(() => {});
  };

  const loadIssues = (month) => {
    api.get(`/kpis/staff/${id}/common-issues?month=${month}`).then(r => setCommonIssues(r.data.rows)).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { loadIssues(issuesMonth); }, [id, issuesMonth]);
  useLiveSync(load);

  const deleteStaff = async () => {
    if (!confirm(`Are you sure you wish to delete this team member?\n\n"${staff.name}" will be permanently removed along with all their QC checks and training records. This cannot be undone.`)) return;
    await api.delete(`/staff/${id}`);
    navigate('/staff');
  };

  const saveSlackEmail = async () => {
    await api.put(`/staff/${id}`, { slack_email: slackEmail });
    setSlackEmailSaved(true);
    setTimeout(() => setSlackEmailSaved(false), 2000);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!staff) return <div className="page"><p>Staff not found.</p></div>;

  const chartData = [...qcChecks]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(c => ({ date: c.date, score: Math.round(c.score_pct), name: c.property_name }));

  const avgScore = qcChecks.length ? qcChecks.reduce((s, c) => s + c.score_pct, 0) / qcChecks.length : null;

  return (
    <div className="page">
      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/staff')}>← Back</button>
        <button className="btn btn-danger btn-sm" onClick={deleteStaff}>🗑 Delete Team Member</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontSize: 22 }}>
          {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{staff.name}</h1>
          <p style={{ color: 'var(--t2)' }}>{staff.role} · Started {staff.start_date}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="email"
              value={slackEmail}
              onChange={e => setSlackEmail(e.target.value)}
              placeholder="Slack email (for notifications)"
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--navy2)',
                color: 'var(--t1)', width: 240,
              }}
            />
            <button
              className="btn btn-sm"
              onClick={saveSlackEmail}
              style={{ fontSize: 12 }}
            >
              {slackEmailSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="stat-grid mb-6">
        <div className="stat-card"><div className="stat-label">QC Checks</div><div className="stat-value">{qcChecks.length}</div></div>
        <div className="stat-card"><div className="stat-label">Avg QC Score</div><div className="stat-value" style={{ color: avgScore >= 85 ? 'var(--ok)' : avgScore >= 70 ? 'var(--amber)' : 'var(--red)' }}>{avgScore ? Math.round(avgScore) + '%' : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Training Sessions</div><div className="stat-value">{trainSessions.length}</div></div>
        <div className="stat-card"><div className="stat-label">Coaching Sessions</div><div className="stat-value">{coachingSessions.length}</div></div>
        {(() => {
          const recent = complaints.filter(c => c.date >= new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10));
          const serious = recent.filter(c => c.severity === 'serious').length;
          const moderate = recent.filter(c => c.severity === 'moderate').length;
          const atRisk = serious >= 1 || moderate >= 2;
          return (
            <div className={`stat-card${atRisk ? ' danger' : ''}`} onClick={() => setActiveTab('complaints')} style={{ cursor: 'pointer' }}>
              <div className="stat-label">Complaints (90d)</div>
              <div className={`stat-value${atRisk ? ' red' : recent.length > 0 ? ' amber' : ' green'}`}>{recent.length}</div>
              <div className="stat-sub">{atRisk ? 'Watchlist risk' : recent.length > 0 ? 'Monitoring' : 'None recorded'}</div>
            </div>
          );
        })()}
        <div className="stat-card"><div className="stat-label">Service Time</div><div className="stat-value" style={{ fontSize: 28, letterSpacing: -1 }}>{(() => { const days = Math.floor((new Date() - new Date(staff.start_date)) / 86400000); return days >= 365 ? `${Math.floor(days/365)}y ${Math.floor((days%365)/30)}m` : days >= 30 ? `${Math.floor(days/30)}m` : `${days}d`; })()}</div></div>
      </div>

      {/* Most Common Issues */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Most Common Issues</span>
          <input
            type="month"
            value={issuesMonth}
            max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
            onChange={e => setIssuesMonth(e.target.value)}
            style={{
              background: 'var(--navy2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--t2)', fontSize: 12,
              padding: '3px 8px', cursor: 'pointer',
            }}
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>Failed 3+ times in selected month</p>
        {commonIssues.length === 0 ? (
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>No recurring issues found. Keep it up!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {commonIssues.map((issue, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--navy2)', border: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{issue.text}</div>
                  {issue.category && (
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>{issue.category}</div>
                  )}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginLeft: 12, flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--red)',
                    background: 'rgba(239,68,68,0.12)', borderRadius: 6,
                    padding: '3px 8px',
                  }}>
                    {issue.flag_count}× flagged
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                    Last: {fmtDate(issue.last_flagged)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Insights */}
      {insights && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Performance Insights</span>
            <span style={{ fontSize: 12, color: 'var(--cyan)', background: 'var(--cyan-dim)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>AI Analysis</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14, lineHeight: 1.6 }}>{insights.summary}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.insights.map((ins, i) => {
              const styles = {
                alert:    { border: 'rgba(239,68,68,0.3)',    bg: 'rgba(239,68,68,0.07)',    bar: 'var(--red)',   icon: '⚠️' },
                warning:  { border: 'rgba(245,158,11,0.3)',   bg: 'rgba(245,158,11,0.07)',   bar: 'var(--amber)', icon: '👀' },
                positive: { border: 'rgba(34,197,94,0.3)',    bg: 'rgba(34,197,94,0.07)',    bar: 'var(--green)', icon: '✅' },
                info:     { border: 'rgba(58,181,217,0.25)',  bg: 'rgba(58,181,217,0.07)',   bar: 'var(--cyan)',  icon: 'ℹ️' },
              };
              const s = styles[ins.type] || styles.info;
              return (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '10px 14px',
                  borderRadius: 8, border: `1px solid ${s.border}`,
                  background: s.bg, position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ width: 3, borderRadius: 2, background: s.bar, flexShrink: 0, alignSelf: 'stretch', marginLeft: -14, marginTop: -10, marginBottom: -10 }} />
                  <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                  <p style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.6, margin: 0 }}>{ins.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="card mb-6">
          <div className="card-title" style={{ marginBottom: 16 }}>QC Score Trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--t3)', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--t3)', fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--t1)' }} formatter={v => [v + '%', 'Score']} />
              <ReferenceLine y={85} stroke="var(--ok)" strokeDasharray="4 4" />
              <ReferenceLine y={70} stroke="var(--amber)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="score" stroke="var(--green)" strokeWidth={2} dot={{ fill: 'var(--green)', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {['qc', 'training', 'coaching', 'complaints'].map(tab => {
          const labels = { qc: 'QC Checks', training: 'Training', coaching: 'Coaching', complaints: 'Complaints' };
          const recentComplaints = tab === 'complaints' ? complaints.filter(c => c.date >= new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10)) : [];
          const hasRisk = tab === 'complaints' && (recentComplaints.filter(c=>c.severity==='serious').length >= 1 || recentComplaints.filter(c=>c.severity==='moderate').length >= 2);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '7px 16px', borderRadius: 8, border: hasRisk ? '1px solid rgba(239,68,68,0.4)' : 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                background: activeTab === tab ? 'var(--cyan)' : 'var(--navy2)',
                color: activeTab === tab ? '#000' : hasRisk ? 'var(--red)' : 'var(--t2)',
              }}
            >
              {labels[tab]}{tab === 'complaints' && complaints.length > 0 ? ` (${complaints.length})` : ''}
            </button>
          );
        })}
      </div>

      {activeTab === 'qc' && (
        <div className="card mb-6">
          <div className="card-title" style={{ marginBottom: 16 }}>QC Check History</div>
          {qcChecks.length === 0 ? <p style={{ color: 'var(--t3)' }}>No completed QC checks yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Property</th><th>Checklist</th><th>Score</th><th>Signed off by</th></tr></thead>
                <tbody>
                  {[...qcChecks].sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                      <td>{fmtDate(c.date)}</td>
                      <td>{c.property_name}</td>
                      <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                      <td><ScoreBadge score={c.score_pct} /></td>
                      <td style={{ color: 'var(--t2)' }}>{c.signed_off_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'training' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Training History</div>
          {trainSessions.length === 0 ? <p style={{ color: 'var(--t3)' }}>No training sessions yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Checklist</th><th>Completion</th><th>Status</th><th>Signed off by</th></tr></thead>
                <tbody>
                  {trainSessions.map(t => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/training/sessions/${t.id}`)}>
                      <td>{fmtDate(t.date)}</td>
                      <td>{t.checklist_name}</td>
                      <td>{Math.round(t.completion_pct)}%</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td style={{ color: 'var(--t2)' }}>{t.signed_off_by || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'coaching' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Coaching Sessions</div>
          {coachingSessions.length === 0 ? (
            <p style={{ color: 'var(--t3)' }}>No coaching sessions recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Topic</th><th>Problem</th><th>Sessions</th><th>Status</th></tr></thead>
                <tbody>
                  {coachingSessions.map(s => {
                    const PCOLORS = { cant: { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' }, didnt: { color: 'var(--cyan)', bg: 'rgba(58,181,217,0.12)' }, wont: { color: 'var(--red)', bg: 'rgba(239,68,68,0.12)' } };
                    const pc = PCOLORS[s.problem_type] || PCOLORS.cant;
                    const openStatus = s.status === 'open';
                    return (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/coaching/${s.id}`)}>
                        <td>{fmtDate(s.date)}</td>
                        <td style={{ color: 'var(--t2)' }}>{s.topic}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: pc.color, background: pc.bg }}>{{ cant: "Can't", didnt: "Didn't", wont: "Won't" }[s.problem_type]}</span></td>
                        <td style={{ textAlign: 'center' }}>{s.sessions_required}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: openStatus ? 'var(--amber)' : 'var(--ok)', background: openStatus ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)' }}>{openStatus ? 'Open' : 'Resolved'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'complaints' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title">Complaint History</div>
            <button className="btn btn-sm btn-primary" onClick={() => navigate(`/complaints`)}>+ Log Complaint</button>
          </div>
          {complaints.length === 0 ? (
            <p style={{ color: 'var(--t3)' }}>No complaints recorded for this team member.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Source</th><th>Severity</th><th>Property</th><th>Description</th><th>Resolution</th></tr>
                </thead>
                <tbody>
                  {[...complaints].sort((a, b) => b.date.localeCompare(a.date)).map(c => {
                    const SMETA = { minor: { label: 'Minor', color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' }, moderate: { label: 'Moderate', color: 'var(--cyan)', bg: 'rgba(58,181,217,0.12)' }, serious: { label: 'Serious', color: 'var(--red)', bg: 'rgba(239,68,68,0.12)' } };
                    const SLABELS = { guest: 'Guest', property_manager: 'Property Manager', property_owner: 'Property Owner' };
                    const sm = SMETA[c.severity] || SMETA.minor;
                    return (
                      <tr key={c.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.date)}</td>
                        <td style={{ fontSize: 12, color: 'var(--t2)' }}>{SLABELS[c.source] || c.source}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: sm.color, background: sm.bg }}>{sm.label}</span></td>
                        <td style={{ color: 'var(--t2)', fontSize: 13 }}>{c.property_name || '—'}</td>
                        <td style={{ maxWidth: 240, fontSize: 13, color: 'var(--t1)' }}>{c.description}</td>
                        <td style={{ maxWidth: 200, fontSize: 13, color: c.resolution ? 'var(--ok)' : 'var(--t3)', fontStyle: c.resolution ? 'normal' : 'italic' }}>
                          {c.resolution || 'Unresolved'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
