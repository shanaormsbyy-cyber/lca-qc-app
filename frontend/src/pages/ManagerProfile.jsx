import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import { ScoreBadge } from '../components/Badge';
import { fmtDate } from '../utils';
import DateRangeFilter from '../components/DateRangeFilter';

export default function ManagerProfile() {
  const { managerId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [range, setRange] = useState('12m');
  const [loading, setLoading] = useState(true);

  const load = r => {
    setLoading(true);
    api.get(`/kpis/managers/${managerId}?range=${r}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(range); }, [managerId, range]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!data) return <div className="page"><p>Manager not found.</p></div>;

  // Fill in missing months for charts
  const fillMonths = (arr, months = 12) => {
    const result = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const found = arr.find(x => x.month === key);
      result.push({ month: key.slice(5) + '/' + key.slice(2, 4), count: found?.count || 0 });
    }
    return result;
  };

  const qcChart = fillMonths(data.qcMonthly);

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/kpis')}>← Back to KPIs</button>

      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{data.mgr.name}</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>Manager Performance Profile</p>
        </div>
        <DateRangeFilter value={range} onChange={r => setRange(r)} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>QC Checks Completed (12 months)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={qcChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--t3)', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--t3)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--navy2)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Bar dataKey="count" fill="var(--green)" radius={3} name="QC Checks" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* QC Checks list */}
      <div className="card mb-6">
        <div className="card-title" style={{ marginBottom: 16 }}>QC Checks Conducted ({data.qcChecks.length})</div>
        {data.qcChecks.length === 0 ? <p style={{ color: 'var(--t3)' }}>No QC checks in this period.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Property</th><th>Staff</th><th>Score</th></tr></thead>
              <tbody>
                {data.qcChecks.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                    <td>{fmtDate(c.date)}</td>
                    <td style={{ fontWeight: 600 }}>{c.property_name}</td>
                    <td>{c.staff_name}</td>
                    <td><ScoreBadge score={c.score_pct} /></td>
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
