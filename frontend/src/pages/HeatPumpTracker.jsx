import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { fmtDate } from '../utils';

function getDueStatus(dueDate) {
  if (!dueDate) return { status: 'none', daysLeft: null };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { status: 'overdue', daysLeft: Math.abs(diff) };
  if (diff <= 7) return { status: 'due_soon', daysLeft: diff };
  return { status: 'ok', daysLeft: diff };
}

export default function HeatPumpTracker() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ property_id: '', due_date: '' });
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const [recRes, avRes] = await Promise.all([
        api.get('/heatpump/records'),
        api.get('/heatpump/available-properties'),
      ]);
      setRecords(recRes.data);
      setAvailable(avRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const handleAdd = async () => {
    if (!addForm.property_id) return;
    await api.post('/heatpump/records', addForm);
    setShowAdd(false);
    setAddForm({ property_id: '', due_date: '' });
    load();
  };

  const filtered = records.filter(r => {
    if (filter === 'all') return true;
    const { status } = getDueStatus(r.due_date);
    return status === filter;
  });

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading...</span></div>;

  const overdue = records.filter(r => getDueStatus(r.due_date).status === 'overdue').length;
  const dueSoon = records.filter(r => getDueStatus(r.due_date).status === 'due_soon').length;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Heat Pump Filter Tracker</h1>
          <p className="page-subtitle">{records.length} properties tracked</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Property</button>
      </div>

      {(overdue > 0 || dueSoon > 0) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {overdue > 0 && (
            <div className="card" style={{ padding: '12px 20px', borderLeft: '3px solid var(--red)', flex: '0 0 auto' }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>{overdue} overdue</span>
            </div>
          )}
          {dueSoon > 0 && (
            <div className="card" style={{ padding: '12px 20px', borderLeft: '3px solid var(--amber)', flex: '0 0 auto' }}>
              <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{dueSoon} due soon</span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="card-title">Filter Clean Schedule</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'overdue', 'due_soon', 'ok'].map(f => (
              <button key={f} className={`btn btn-sm${filter === f ? ' btn-primary' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue' : f === 'due_soon' ? 'Due Soon' : 'OK'}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Due Date</th>
                <th>Last Completed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>No records found</td></tr>
              ) : filtered.map(r => {
                const { status, daysLeft } = getDueStatus(r.due_date);
                return (
                  <tr key={r.id} onClick={() => navigate(`/heatpump/${r.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700 }}>{r.property_name}</td>
                    <td>{fmtDate(r.due_date)}</td>
                    <td>{fmtDate(r.last_completed)}</td>
                    <td>
                      {status === 'overdue' && <span className="badge badge-red">{daysLeft}d overdue</span>}
                      {status === 'due_soon' && <span className="badge badge-amber">Due in {daysLeft}d</span>}
                      {status === 'ok' && <span className="badge badge-green">{daysLeft}d left</span>}
                      {status === 'none' && <span className="badge badge-grey">No date set</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16 }}>Add Property to Tracker</h2>
            {available.length === 0 ? (
              <p style={{ color: 'var(--t3)' }}>All properties are already being tracked.</p>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Property</label>
                  <select className="form-input" value={addForm.property_id} onChange={e => setAddForm(f => ({ ...f, property_id: e.target.value }))}>
                    <option value="">Select property...</option>
                    {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label">First Due Date</label>
                  <input type="date" className="form-input" value={addForm.due_date} onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAdd} disabled={!addForm.property_id}>Add</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
