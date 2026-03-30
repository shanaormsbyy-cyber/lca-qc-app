import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { ScoreBadge, StatusBadge } from '../components/Badge';
import { fmtDate } from '../utils';

export default function PropertyProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [checks, setChecks] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.get(`/properties/${id}`),
      api.get('/qc/checks'),
    ]).then(([p, q]) => {
      setProperty(p.data);
      setChecks(q.data.filter(c => c.property_id === parseInt(id) && c.status === 'complete' && c.check_type === 'property'));
    }).finally(() => setLoading(false));
    api.get(`/kpis/properties/${id}/insights`).then(r => setInsights(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, [id]);
  useLiveSync(load);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!property) return <div className="page"><p>Property not found.</p></div>;

  const chartData = [...checks]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(c => ({ date: c.date, score: Math.round(c.score_pct) }));

  const avgScore = checks.length ? checks.reduce((s, c) => s + c.score_pct, 0) / checks.length : null;
  const lastCheck = checks.length ? [...checks].sort((a, b) => b.date.localeCompare(a.date))[0] : null;

  const initials = property.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="page">
      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/properties')}>← Back</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontSize: 22 }}>
          {initials}
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{property.name}</h1>
          <p style={{ color: 'var(--t2)' }}>Property Health Profile</p>
        </div>
      </div>

      <div className="stat-grid mb-6">
        <div className="stat-card">
          <div className="stat-label">Health Checks</div>
          <div className="stat-value">{checks.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Score</div>
          <div className="stat-value" style={{ color: avgScore == null ? 'var(--t3)' : avgScore >= 85 ? 'var(--ok)' : avgScore >= 70 ? 'var(--amber)' : 'var(--red)' }}>
            {avgScore != null ? Math.round(avgScore) + '%' : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Check</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{lastCheck ? fmtDate(lastCheck.date) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Score</div>
          <div className="stat-value" style={{ color: lastCheck == null ? 'var(--t3)' : lastCheck.score_pct >= 85 ? 'var(--ok)' : lastCheck.score_pct >= 70 ? 'var(--amber)' : 'var(--red)' }}>
            {lastCheck ? Math.round(lastCheck.score_pct) + '%' : '—'}
          </div>
        </div>
      </div>

      {/* AI Insights */}
      {insights && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Property Insights</span>
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
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderRadius: 8, border: `1px solid ${s.border}`, background: s.bg, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: 3, borderRadius: 2, background: s.bar, flexShrink: 0, alignSelf: 'stretch', marginLeft: -14, marginTop: -10, marginBottom: -10 }} />
                  <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
                  <p style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.6, margin: 0 }}>{ins.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score Trend */}
      {chartData.length > 1 && (
        <div className="card mb-6">
          <div className="card-title" style={{ marginBottom: 16 }}>Health Score Trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--t3)', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--t3)', fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--t1)' }} formatter={v => [v + '%', 'Score']} />
              <ReferenceLine y={85} stroke="var(--ok)" strokeDasharray="4 4" />
              <ReferenceLine y={70} stroke="var(--amber)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="score" stroke="var(--cyan)" strokeWidth={2} dot={{ fill: 'var(--cyan)', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Check History */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>Health Check History</div>
        {checks.length === 0 ? <p style={{ color: 'var(--t3)' }}>No completed health checks yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Checklist</th><th>Assigned To</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>
                {[...checks].sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                    <td>{fmtDate(c.date)}</td>
                    <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                    <td style={{ color: 'var(--t2)' }}>{c.assigned_to_name}</td>
                    <td><ScoreBadge score={c.score_pct} /></td>
                    <td><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
