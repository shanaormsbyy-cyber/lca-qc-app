import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { fmtDate } from '../utils';

function StatCard({ label, value, color, sub }) {
  return (
    <div className="card" style={{ padding: '20px 24px', textAlign: 'center', minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 900, color: color || 'var(--cyan)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function TrendChart({ trend }) {
  if (!trend || trend.length === 0) return null;
  const maxVal = 100;
  const chartH = 160;
  const barW = 32;
  const gap = 6;
  const totalW = trend.length * (barW + gap);

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <svg width={Math.max(totalW, 300)} height={chartH + 40} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => {
          const yy = chartH - (v / maxVal) * chartH + 10;
          return (
            <g key={v}>
              <line x1={0} y1={yy} x2={totalW} y2={yy} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={0} y={yy - 4} fill="var(--t3)" fontSize={9}>{v}%</text>
            </g>
          );
        })}
        {trend.map((t, i) => {
          const x = i * (barW + gap) + 20;
          const h = t.avg != null ? (t.avg / maxVal) * chartH : 0;
          const y = chartH - h + 10;
          const color = t.avg == null ? 'rgba(255,255,255,0.05)' : t.avg >= 85 ? 'var(--green)' : t.avg >= 70 ? 'var(--amber)' : 'var(--red)';
          const monthLabel = t.month.slice(5); // MM
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const mName = monthNames[parseInt(monthLabel) - 1] || monthLabel;
          return (
            <g key={i}>
              <rect x={x} y={t.avg != null ? y : chartH + 10 - 2} width={barW} height={t.avg != null ? h : 2} rx={4} fill={color} opacity={t.avg != null ? 0.85 : 0.3} />
              {t.avg != null && (
                <text x={x + barW / 2} y={y - 6} fill="var(--t1)" fontSize={10} fontWeight={700} textAnchor="middle">{t.avg}%</text>
              )}
              <text x={x + barW / 2} y={chartH + 26} fill="var(--t3)" fontSize={9} textAnchor="middle">{mName}</text>
              {t.count > 0 && (
                <text x={x + barW / 2} y={chartH + 36} fill="var(--t3)" fontSize={8} textAnchor="middle">{t.count} check{t.count > 1 ? 's' : ''}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function StaffPortalDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [checks, setChecks] = useState([]);
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('staff_user');
    if (!stored) { navigate('/portal/login'); return; }
    setUser(JSON.parse(stored));

    const token = localStorage.getItem('staff_token');
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      api.get('/staff-portal/my-stats', { headers }),
      api.get('/staff-portal/my-checks', { headers }),
      api.get('/staff-portal/my-flags', { headers }),
    ]).then(([statsRes, checksRes, flagsRes]) => {
      setStats(statsRes.data);
      setChecks(checksRes.data);
      setFlags(flagsRes.data);
    }).catch(() => {
      localStorage.removeItem('staff_token');
      localStorage.removeItem('staff_user');
      navigate('/portal/login');
    }).finally(() => setLoading(false));
  }, []);

  const handlePasswordChange = async () => {
    setPwMsg('');
    if (!pwForm.currentPassword || !pwForm.newPassword) return setPwMsg('Fill in all fields');
    if (pwForm.newPassword !== pwForm.confirm) return setPwMsg('New passwords do not match');
    if (pwForm.newPassword.length < 4) return setPwMsg('Password must be at least 4 characters');
    setPwSaving(true);
    try {
      const token = localStorage.getItem('staff_token');
      await api.post('/staff-portal/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setPwMsg('Password updated successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setTimeout(() => setShowPassword(false), 1500);
    } catch (err) {
      setPwMsg(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    navigate('/portal/login');
  };

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading...</span></div>;

  const scoreColor = (s) => s >= 85 ? 'var(--green)' : s >= 70 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 0 40px' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--glass)', borderBottom: '1px solid var(--glass-border)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)' }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--cyan)' }}>Team Member Portal</span>
          <span style={{ color: 'var(--t3)', fontSize: 13, marginLeft: 12 }}>{user?.name}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowPassword(true)}>Settings</button>
          <button className="btn btn-sm" onClick={logout}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {/* Welcome */}
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p style={{ color: 'var(--t3)', marginBottom: 24 }}>Your quality control performance overview</p>

        {/* Stat cards */}
        {stats && stats.total > 0 ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
              <StatCard label="Total Checks" value={stats.total} color="var(--cyan)" />
              <StatCard label="Average Score" value={`${stats.average}%`} color={scoreColor(stats.average)} />
              <StatCard label="Best Score" value={`${stats.best}%`} color={scoreColor(stats.best)} />
              <StatCard label="Latest Score" value={`${stats.latest}%`} color={scoreColor(stats.latest)} />
            </div>

            {/* Trend chart */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <span className="card-title">Score Trend (Last 12 Months)</span>
              </div>
              <TrendChart trend={stats.trend} />
            </div>
          </>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 24 }}>
            <p style={{ color: 'var(--t3)', fontSize: 15 }}>No QC checks completed yet. Your results will appear here once your manager completes a quality control check.</p>
          </div>
        )}

        {/* Flagged issues by room */}
        {Object.keys(flags).length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Commonly Flagged Issues</span>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>Last 30 days, 3+ times</span>
            </div>
            {Object.entries(flags).map(([room, items]) => (
              <div key={room} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cyan)', marginBottom: 8 }}>{room}</div>
                {items.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < items.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                    <span style={{ fontSize: 13, color: 'var(--t1)' }}>{f.text}</span>
                    <span className="badge badge-red" style={{ flexShrink: 0 }}>{f.count}x</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Checks list */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Your QC Reports</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{checks.length} completed checks</span>
          </div>
          {checks.length === 0 ? (
            <p style={{ color: 'var(--t3)', padding: '20px 0' }}>No completed checks yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Property</th>
                    <th>Score</th>
                    <th>Checklist</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map(c => (
                    <tr key={c.id}>
                      <td>{fmtDate(c.date)}</td>
                      <td style={{ fontWeight: 700 }}>{c.property_name}</td>
                      <td>
                        <span className={`badge ${c.score_pct >= 85 ? 'badge-green' : c.score_pct >= 70 ? 'badge-amber' : 'badge-red'}`}>
                          {Math.round(c.score_pct)}%
                        </span>
                      </td>
                      <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => navigate(`/portal/check/${c.id}`)}>View Report</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Password change modal */}
      {showPassword && (
        <div className="modal-overlay" onClick={() => { setShowPassword(false); setPwMsg(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16 }}>Change Password</h2>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            {pwMsg && <p style={{ color: pwMsg.includes('success') ? 'var(--green)' : 'var(--red)', marginBottom: 12, fontSize: 13 }}>{pwMsg}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setShowPassword(false); setPwMsg(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePasswordChange} disabled={pwSaving}>{pwSaving ? 'Saving...' : 'Update Password'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
