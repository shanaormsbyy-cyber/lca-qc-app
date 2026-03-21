import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, ScoreBadge, DueBadge } from '../components/Badge';

export default function Dashboard() {
  const { manager } = useAuth();
  const navigate = useNavigate();
  const [due, setDue] = useState(null);
  const [myQC, setMyQC] = useState([]);
  const [myTrain, setMyTrain] = useState([]);
  const [recentQC, setRecentQC] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/scheduling/due'),
      api.get('/qc/checks'),
      api.get('/training/sessions'),
    ]).then(([dueR, qcR, trainR]) => {
      setDue(dueR.data);
      const allQC = qcR.data;
      const allTrain = trainR.data;
      setMyQC(allQC.filter(q => q.assigned_to_id === manager.id && q.status === 'pending'));
      setMyTrain(allTrain.filter(t => t.assigned_to_id === manager.id && t.status === 'pending'));
      setRecentQC(allQC.filter(q => q.status === 'complete').slice(0, 5));
    }).finally(() => setLoading(false));
  }, [manager.id]);

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading…</span></div>;

  const overdueStaff = due?.staff.filter(s => s.status === 'overdue').length || 0;
  const dueSoonStaff = due?.staff.filter(s => s.status === 'due_soon').length || 0;
  const overdueProps = due?.properties.filter(p => p.status === 'overdue').length || 0;
  const dueSoonProps = due?.properties.filter(p => p.status === 'due_soon').length || 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {manager.name}</p>
      </div>

      {/* My Tasks */}
      {(myQC.length > 0 || myTrain.length > 0) && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">📌 My Assigned Tasks</span>
            <span className="badge badge-blue">{myQC.length + myTrain.length} pending</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myQC.map(q => (
              <div key={q.id} className="flex items-center justify-between" style={{ padding: '10px 14px', background: 'var(--navy3)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>✅ QC Check — {q.property_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{q.staff_name} · {q.date}</div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => navigate(`/qc/checks/${q.id}`)}>Start</button>
              </div>
            ))}
            {myTrain.map(t => (
              <div key={t.id} className="flex items-center justify-between" style={{ padding: '10px 14px', background: 'var(--navy3)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>📋 Training — {t.trainee_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{t.checklist_name} · {t.date}</div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => navigate(`/training/sessions/${t.id}`)}>Start</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overview stats */}
      <div className="stat-grid">
        <div className={`stat-card${overdueStaff > 0 ? ' highlight' : ''}`} style={overdueStaff > 0 ? { borderColor: 'var(--red)' } : {}}>
          <div className="stat-label">Staff Overdue QC</div>
          <div className="stat-value" style={{ color: overdueStaff > 0 ? 'var(--red)' : 'var(--ok)' }}>{overdueStaff}</div>
          <div className="stat-sub">{dueSoonStaff} due within 7 days</div>
        </div>
        <div className={`stat-card${overdueProps > 0 ? '' : ''}`} style={overdueProps > 0 ? { borderColor: 'var(--red)' } : {}}>
          <div className="stat-label">Properties Overdue</div>
          <div className="stat-value" style={{ color: overdueProps > 0 ? 'var(--red)' : 'var(--ok)' }}>{overdueProps}</div>
          <div className="stat-sub">{dueSoonProps} due within 7 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">My Pending Tasks</div>
          <div className="stat-value">{myQC.length + myTrain.length}</div>
          <div className="stat-sub">{myQC.length} QC · {myTrain.length} training</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recent Avg Score</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {recentQC.length ? Math.round(recentQC.reduce((s, q) => s + q.score_pct, 0) / recentQC.length) + '%' : '—'}
          </div>
          <div className="stat-sub">Last {recentQC.length} completed checks</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-6">
        <button className="btn btn-primary" onClick={() => navigate('/qc')}>+ New QC Check</button>
        <button className="btn btn-secondary" onClick={() => navigate('/training')}>+ New Training Session</button>
        <button className="btn btn-ghost" onClick={() => navigate('/scheduling')}>📅 View Due Checks</button>
      </div>

      {/* Due items preview */}
      {(overdueStaff > 0 || dueSoonStaff > 0 || overdueProps > 0 || dueSoonProps > 0) && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">⚠ Overdue & Due Soon</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/scheduling')}>View all →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {due?.staff.filter(s => s.status !== 'ok').slice(0, 4).map(s => (
              <div key={s.id} className="flex items-center justify-between" style={{ padding: '8px 12px', background: 'var(--navy3)', borderRadius: 8 }}>
                <span style={{ fontWeight: 500 }}>👤 {s.name}</span>
                <DueBadge status={s.status} daysLeft={s.days_left} />
              </div>
            ))}
            {due?.properties.filter(p => p.status !== 'ok').slice(0, 4).map(p => (
              <div key={p.id} className="flex items-center justify-between" style={{ padding: '8px 12px', background: 'var(--navy3)', borderRadius: 8 }}>
                <span style={{ fontWeight: 500 }}>🏠 {p.name}</span>
                <DueBadge status={p.status} daysLeft={p.days_left} />
              </div>
            ))}
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
                    <td>{q.date}</td>
                    <td>{q.property_name}</td>
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
    </div>
  );
}
