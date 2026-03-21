import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ScoreBadge, DueBadge } from '../components/Badge';

export default function Dashboard() {
  const { manager } = useAuth();
  const navigate = useNavigate();
  const [due, setDue] = useState(null);
  const [myQC, setMyQC] = useState([]);
  const [myTrain, setMyTrain] = useState([]);
  const [recentQC, setRecentQC] = useState([]);
  const [allQC, setAllQC] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/scheduling/due'),
      api.get('/qc/checks'),
      api.get('/training/sessions'),
    ]).then(([dueR, qcR, trainR]) => {
      setDue(dueR.data);
      const qc = qcR.data;
      const train = trainR.data;
      setAllQC(qc);
      setMyQC(qc.filter(q => q.assigned_to_id === manager.id && q.status === 'pending'));
      setMyTrain(train.filter(t => t.assigned_to_id === manager.id && t.status === 'pending'));
      setRecentQC(qc.filter(q => q.status === 'complete').slice(0, 5));
    }).finally(() => setLoading(false));
  }, [manager.id]);

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading…</span></div>;

  const overdueStaff  = due?.staff.filter(s => s.status === 'overdue').length || 0;
  const dueSoonStaff  = due?.staff.filter(s => s.status === 'due_soon').length || 0;
  const overdueProps  = due?.properties.filter(p => p.status === 'overdue').length || 0;
  const dueSoonProps  = due?.properties.filter(p => p.status === 'due_soon').length || 0;
  const totalPending  = myQC.length + myTrain.length;

  const completeQC = allQC.filter(q => q.status === 'complete');

  // Average by staff (avg of per-staff averages)
  const staffIds = [...new Set(completeQC.map(q => q.staff_id))];
  const staffAvg = staffIds.length
    ? Math.round(staffIds.reduce((sum, sid) => {
        const c = completeQC.filter(q => q.staff_id === sid);
        return sum + c.reduce((s, q) => s + q.score_pct, 0) / c.length;
      }, 0) / staffIds.length)
    : null;

  // Average by property (avg of per-property averages)
  const propIds = [...new Set(completeQC.map(q => q.property_id))];
  const propAvg = propIds.length
    ? Math.round(propIds.reduce((sum, pid) => {
        const c = completeQC.filter(q => q.property_id === pid);
        return sum + c.reduce((s, q) => s + q.score_pct, 0) / c.length;
      }, 0) / propIds.length)
    : null;

  const scoreColor = v => v == null ? '' : v >= 80 ? ' green' : v >= 60 ? '' : ' red';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {manager.name}</p>
      </div>

      {/* 5 stat cards */}
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

        <div className="stat-card" onClick={() => navigate('/training')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">My Pending Tasks</div>
          <div className={`stat-value${totalPending > 0 ? ' cyan' : ''}`}>{totalPending}</div>
          <div className="stat-sub">{myQC.length} QC · {myTrain.length} training</div>
        </div>
      </div>

      {/* My assigned tasks */}
      {totalPending > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">My Assigned Tasks</span>
            <span className="badge badge-blue">{totalPending} pending</span>
          </div>
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
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3 mb-6">
        <button className="btn btn-primary" onClick={() => navigate('/staff')}>+ New QC Check</button>
        <button className="btn btn-secondary" onClick={() => navigate('/training')}>+ New Training</button>
      </div>

      {/* Overdue alerts */}
      {(overdueStaff > 0 || dueSoonStaff > 0 || overdueProps > 0 || dueSoonProps > 0) && (
        <div className="card mb-6">
          <div className="card-header">
            <span className="card-title">Overdue & Due Soon</span>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('/staff')}>Staff →</button>
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('/properties')}>Properties →</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {due?.staff.filter(s => s.status !== 'ok').slice(0, 3).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <DueBadge status={s.status} daysLeft={s.days_left} />
              </div>
            ))}
            {due?.properties.filter(p => p.status !== 'ok').slice(0, 3).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
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
    </div>
  );
}
