import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { ScoreBadge, ScoreBar } from '../components/Badge';
import { fmtDate } from '../utils';
import DateRangeFilter from '../components/DateRangeFilter';

export default function KPIs() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('managers');
  const [range, setRange] = useState('all');
  const [managers, setManagers] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('qc_checks_all');
  const [sortDir, setSortDir] = useState('desc');

  const load = r => {
    setLoading(true);
    Promise.all([
      api.get(`/kpis/managers?range=${r}`),
      api.get(`/kpis/trainees?range=${r}`),
      api.get(`/kpis/properties?range=${r}`),
    ]).then(([m, t, p]) => {
      setManagers(m.data); setTrainees(t.data); setProperties(p.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(range); }, [range]);
  useLiveSync(() => load(range));

  const sort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedManagers = [...managers].sort((a, b) => {
    const av = a[sortKey] ?? -1, bv = b[sortKey] ?? -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const sortIcon = key => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Manager KPIs</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>Performance analytics across all managers</p>
        </div>
        <DateRangeFilter value={range} onChange={r => { setRange(r); }} />
      </div>

      <div className="tab-row">
        {[['managers','🏆 Manager Leaderboard'],['trainees','👥 Trainee Performance'],['properties','🏠 Property Breakdown']].map(([v,l]) => (
          <button key={v} className={`tab-btn${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {loading && <div className="loading"><div className="spinner" /></div>}

      {!loading && tab === 'managers' && (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Manager</th>
                <th className="sortable" onClick={() => sort('qc_checks_all')}>QC Checks (All){sortIcon('qc_checks_all')}</th>
                <th className="sortable" onClick={() => sort('qc_checks_range')}>QC ({range}){sortIcon('qc_checks_range')}</th>
                <th className="sortable" onClick={() => sort('avg_qc_score')}>Avg Score{sortIcon('avg_qc_score')}</th>
                <th className="sortable" onClick={() => sort('training_all')}>Training (All){sortIcon('training_all')}</th>
                <th className="sortable" onClick={() => sort('training_range')}>Training ({range}){sortIcon('training_range')}</th>
                <th className="sortable" onClick={() => sort('trainees_signed_off')}>Signed Off{sortIcon('trainees_signed_off')}</th>
                <th className="sortable" onClick={() => sort('pending_tasks')}>Pending{sortIcon('pending_tasks')}</th>
                <th>Last Active</th>
                <th></th>
              </tr></thead>
              <tbody>
                {sortedManagers.map(m => (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/kpis/${m.id}`)}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>{m.qc_checks_all}</td>
                    <td>{m.qc_checks_range}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ScoreBadge score={m.avg_qc_score} />
                        <div style={{ width: 60 }}><ScoreBar score={m.avg_qc_score} /></div>
                      </div>
                    </td>
                    <td>{m.training_all}</td>
                    <td>{m.training_range}</td>
                    <td>{m.trainees_signed_off}</td>
                    <td>
                      <span className={m.pending_tasks > 0 ? 'badge badge-amber' : 'badge badge-grey'}>{m.pending_tasks}</span>
                    </td>
                    <td style={{ color: 'var(--t2)', fontSize: 12 }}>{fmtDate(m.last_activity) || '—'}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); navigate(`/kpis/${m.id}`); }}>→</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === 'trainees' && (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Staff Member</th><th>Role</th><th>Trained By</th><th>Checklist</th><th>Training Completed</th><th>Avg QC Score Since</th><th>Total QC Checks</th>
            </tr></thead>
            <tbody>
              {trainees.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: 'var(--t2)' }}>{t.role}</td>
                  <td>{t.trainer_name || <span style={{ color: 'var(--t3)' }}>Not trained</span>}</td>
                  <td style={{ color: 'var(--t2)', fontSize: 12 }}>{t.checklist_name || '—'}</td>
                  <td style={{ color: 'var(--t2)' }}>{fmtDate(t.training_completed) || '—'}</td>
                  <td><ScoreBadge score={t.avg_qc_score} /></td>
                  <td>{t.total_qc_checks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'properties' && (
        <>
          {properties.some(p => p.avg_score != null) && (
            <div className="card mb-6">
              <div className="card-title" style={{ marginBottom: 16 }}>Average QC Score by Property</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={properties.filter(p => p.avg_score != null)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--t3)', fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 11 }} width={150} />
                  <Tooltip contentStyle={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 8 }} formatter={v => [v + '%', 'Avg Score']} />
                  <Bar dataKey="avg_score" fill="var(--green)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Property</th><th>Address</th><th>Total Checks</th><th>Avg Score</th><th>Last Check</th><th>Most Frequent Checker</th>
              </tr></thead>
              <tbody>
                {properties.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: 'var(--t2)', fontSize: 12 }}>{p.address}</td>
                    <td>{p.total_checks}</td>
                    <td><ScoreBadge score={p.avg_score} /></td>
                    <td style={{ color: 'var(--t2)' }}>{fmtDate(p.last_check_date) || '—'}</td>
                    <td style={{ color: 'var(--t2)' }}>{p.top_manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
