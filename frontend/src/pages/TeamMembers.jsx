import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { ScoreBadge } from '../components/Badge';

export default function TeamMembers() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [qcChecks, setQcChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', start_date: '' });

  useEffect(() => {
    Promise.all([api.get('/staff'), api.get('/qc/checks')])
      .then(([s, q]) => { setStaff(s.data); setQcChecks(q.data.filter(c => c.status === 'complete')); })
      .finally(() => setLoading(false));
  }, []);

  const avgScore = staffId => {
    const checks = qcChecks.filter(c => c.staff_id === staffId);
    if (!checks.length) return null;
    return checks.reduce((s, c) => s + c.score_pct, 0) / checks.length;
  };

  const openAdd = () => { setEditing(null); setForm({ name: '', role: 'Cleaner', start_date: new Date().toISOString().slice(0, 10) }); setShowModal(true); };
  const openEdit = (s, e) => { e.stopPropagation(); setEditing(s); setForm({ name: s.name, role: s.role, start_date: s.start_date }); setShowModal(true); };

  const save = async () => {
    if (!form.name || !form.role || !form.start_date) return;
    if (editing) await api.put(`/staff/${editing.id}`, form);
    else await api.post('/staff', form);
    const r = await api.get('/staff');
    setStaff(r.data);
    setShowModal(false);
  };

  const del = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this staff member?')) return;
    await api.delete(`/staff/${id}`);
    setStaff(s => s.filter(x => x.id !== id));
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Team Members</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>{staff.length} staff members</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Staff</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Role</th><th>Start Date</th><th>QC Checks</th><th>Avg Score</th><th></th>
          </tr></thead>
          <tbody>
            {staff.map(s => {
              const checks = qcChecks.filter(c => c.staff_id === s.id);
              const avg = avgScore(s.id);
              return (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/team/${s.id}`)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>
                        {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                    </div>
                  </td>
                  <td>{s.role}</td>
                  <td style={{ color: 'var(--t2)' }}>{s.start_date}</td>
                  <td>{checks.length}</td>
                  <td><ScoreBadge score={avg} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={e => openEdit(s, e)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={e => del(s.id, e)}>Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit Staff Member' : 'Add Staff Member'}</div>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option>Cleaner</option>
                <option>Senior Cleaner</option>
                <option>Supervisor</option>
                <option>Team Lead</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={save}>Save</button>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
