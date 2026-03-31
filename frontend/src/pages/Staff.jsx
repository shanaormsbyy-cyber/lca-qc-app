import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { ScoreBadge, StatusBadge, DueBadge } from '../components/Badge';
import { fmtDate } from '../utils';

export default function Staff() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('team');
  const [staff, setStaff] = useState([]);
  const [checks, setChecks] = useState([]);
  const [due, setDue] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [managers, setManagers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQCModal, setShowQCModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [staffForm, setStaffForm] = useState({ name: '', role: 'Cleaner', start_date: '' });
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => Promise.all([
    api.get('/staff'),
    api.get('/qc/checks'),
    api.get('/scheduling/due'),
    api.get('/qc/checklists'),
    api.get('/managers'),
    api.get('/properties'),
  ]).then(([s, q, d, cl, m, p]) => {
    setStaff(s.data);
    setChecks(q.data);
    setDue(d.data);
    setChecklists(cl.data);
    setManagers(m.data);
    setProperties(p.data);
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const dueInfo = id => due?.staff.find(s => s.id === id);
  const avgScore = id => {
    const c = checks.filter(c => c.staff_id === id && c.status === 'complete');
    return c.length ? c.reduce((s, c) => s + c.score_pct, 0) / c.length : null;
  };

  const saveStaff = async () => {
    if (!staffForm.name || !staffForm.role || !staffForm.start_date) return;
    if (editing) await api.put(`/staff/${editing.id}`, staffForm);
    else await api.post('/staff', staffForm);
    await load(); setShowStaffModal(false);
  };

  const delStaff = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this staff member?')) return;
    await api.delete(`/staff/${id}`);
    setStaff(s => s.filter(x => x.id !== id));
  };

  const createCheck = async () => {
    const { property_id, staff_id, checklist_id, assigned_to_id, date } = checkForm;
    if (!property_id || !staff_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    const r = await api.post('/qc/checks', checkForm);
    setShowQCModal(false);
    navigate(`/qc/checks/${r.data.id}`);
  };

  const deleteCheck = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this QC check?')) return;
    await api.delete(`/qc/checks/${id}`);
    setChecks(c => c.filter(x => x.id !== id));
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const filteredChecks = filter === 'all' ? checks
    : checks.filter(c => c.status === filter);

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px' }}>Staff</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>{staff.length} team members</p>
        </div>
        <div className="flex gap-3">
          {tab === 'team' && (
            <button className="btn btn-ghost" onClick={() => { setEditing(null); setStaffForm({ name: '', role: 'Cleaner', start_date: new Date().toISOString().slice(0, 10) }); setShowStaffModal(true); }}>
              + Add Staff
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowQCModal(true)}>+ New QC Check</button>
        </div>
      </div>

      <div className="tab-row">
        <button className={`tab-btn${tab === 'team' ? ' active' : ''}`} onClick={() => setTab('team')}>Team</button>
        <button className={`tab-btn${tab === 'qc' ? ' active' : ''}`} onClick={() => setTab('qc')}>QC Checks</button>
      </div>

      {tab === 'team' && (
        <>
        <div style={{ marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ maxWidth: 300 }}
            placeholder="Search staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Role</th><th>Due Status</th><th>Last Check</th><th>Avg Score</th><th>Total Checks</th><th></th>
            </tr></thead>
            <tbody>
              {staff.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase())).map(s => {
                const d = dueInfo(s.id);
                const avg = avgScore(s.id);
                const total = checks.filter(c => c.staff_id === s.id && c.status === 'complete').length;
                return (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/staff/${s.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontSize: 13, flexShrink: 0 }}>
                          {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span style={{ fontWeight: 700 }}>{s.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--t2)' }}>{s.role}</td>
                    <td>{d ? <DueBadge status={d.status} daysLeft={d.days_left} /> : <span style={{ color: 'var(--t3)' }}>—</span>}</td>
                    <td style={{ color: 'var(--t2)' }}>{d?.last_check_date || 'Never'}</td>
                    <td><ScoreBadge score={avg} /></td>
                    <td style={{ color: 'var(--t2)' }}>{total}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); setEditing(s); setStaffForm({ name: s.name, role: s.role, start_date: s.start_date }); setShowStaffModal(true); }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={e => delStaff(s.id, e)}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'qc' && (
        <>
          <div className="tab-row mb-6">
            {[['all','All'],['pending','Pending'],['complete','Complete']].map(([v,l]) => (
              <button key={v} className={`tab-btn${filter===v?' active':''}`} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          {filteredChecks.length === 0
            ? <div className="empty-state"><div className="icon">✅</div>No QC checks found.</div>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Date</th><th>Staff</th><th>Property</th><th>Checklist</th><th>Score</th><th>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {filteredChecks.map(c => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                        <td style={{ color: 'var(--t3)' }}>{fmtDate(c.date)}</td>
                        <td style={{ fontWeight: 700 }}>{c.staff_name}</td>
                        <td style={{ color: 'var(--t2)' }}>{c.property_name}</td>
                        <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                        <td>{c.status === 'complete' ? <ScoreBadge score={c.score_pct} /> : <span style={{ color: 'var(--t3)' }}>—</span>}</td>
                        <td><StatusBadge status={c.status} /></td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-danger" onClick={e => deleteCheck(c.id, e)}>Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </>
      )}

      {/* New QC Check Modal */}
      {showQCModal && (
        <div className="modal-overlay" onClick={() => setShowQCModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New QC Check</div>
            <div className="form-group">
              <label className="form-label">Staff Member</label>
              <select className="form-select" value={checkForm.staff_id} onChange={e => setCheckForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select className="form-select" value={checkForm.property_id} onChange={e => setCheckForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Checklist</label>
              <select className="form-select" value={checkForm.checklist_id} onChange={e => setCheckForm(f => ({ ...f, checklist_id: e.target.value }))}>
                <option value="">Select checklist…</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
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
              <button className="btn btn-primary" onClick={createCheck}>Create & Open</button>
              <button className="btn btn-ghost" onClick={() => setShowQCModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Staff Modal */}
      {showStaffModal && (
        <div className="modal-overlay" onClick={() => setShowStaffModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit Staff Member' : 'Add Staff Member'}</div>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-select" value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}>
                <option>Cleaner</option>
                <option>Senior Cleaner</option>
                <option>Supervisor</option>
                <option>Team Lead</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input className="form-input" type="date" value={staffForm.start_date} onChange={e => setStaffForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={saveStaff}>Save</button>
              <button className="btn btn-ghost" onClick={() => setShowStaffModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
