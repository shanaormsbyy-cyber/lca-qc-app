import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import LocationInput from '../components/LocationInput';
import useLiveSync from '../hooks/useLiveSync';
import { ScoreBadge, StatusBadge, DueBadge } from '../components/Badge';
import { fmtDate } from '../utils';
import { fetchDeductions, adjust, pointsFor, breakdownText } from '../lib/complaintScore';
import ExtraStaffPicker from '../components/ExtraStaffPicker';

// A check counts for everyone on it (staff_ids), not just the first team member.
const onCheck = (c, id) => (c.staff_ids || [c.staff_id]).includes(id);

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
  const [staffForm, setStaffForm] = useState({ name: '', role: 'Cleaner', start_date: '', location: '' });
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [inactiveModal, setInactiveModal] = useState(null);
  const [inactiveDate, setInactiveDate] = useState('');
  const [archivedStaff, setArchivedStaff] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [deductions, setDeductions] = useState({});
  const [creds, setCreds] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: '', password: '', touched: false });
  const [staffError, setStaffError] = useState('');

  const load = () => Promise.all([
    api.get('/staff'),
    api.get('/qc/checks'),
    api.get('/scheduling/due'),
    api.get('/qc/checklists'),
    api.get('/managers'),
    api.get('/properties'),
  ]).then(([s, q, d, cl, m, p]) => {
    setStaff(s.data);
    api.get('/staff?archived=true').then(r => setArchivedStaff(r.data));
    setChecks(q.data);
    setDue(d.data);
    setChecklists(cl.data);
    setManagers(m.data);
    setProperties(p.data);
    fetchDeductions().then(setDeductions);
    api.get('/staff-portal/credentials').then(r => setCreds(r.data)).catch(() => {});
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const dueInfo = id => due?.staff.find(s => s.id === id);
  // QC average from checks, then minus complaint points from the last 90 days.
  const checksAvg = id => {
    const c = checks.filter(c => onCheck(c, id) && c.status === 'complete');
    return c.length ? c.reduce((s, c) => s + c.score_pct, 0) / c.length : null;
  };
  const avgScore = id => adjust(checksAvg(id), pointsFor(deductions, id));

  // Portal login lives in the same form as the staff member.
  const credFor = id => creds.find(c => c.staff_id === id);
  const suggestUsername = name => (name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  const openStaffModal = s => {
    setEditing(s);
    setStaffError('');
    if (s) {
      setStaffForm({ name: s.name, role: s.role, start_date: s.start_date, location: s.location || '' });
      setLoginForm({ username: credFor(s.id)?.username || '', password: '', touched: true });
    } else {
      setStaffForm({ name: '', role: 'Cleaner', start_date: new Date().toISOString().slice(0, 10), location: (() => { try { return localStorage.getItem('location_filter') || 'Hamilton'; } catch { return 'Hamilton'; } })() });
      setLoginForm({ username: '', password: '', touched: false });
    }
    setShowStaffModal(true);
  };
  const setStaffName = name => {
    setStaffForm(f => ({ ...f, name }));
    setLoginForm(l => (l.touched ? l : { ...l, username: suggestUsername(name) }));
  };

  const saveStaff = async () => {
    if (!staffForm.name || !staffForm.role || !staffForm.start_date) return;
    setStaffError('');
    const username = loginForm.username.trim();
    const password = loginForm.password;
    const existing = editing ? credFor(editing.id) : null;
    if (!existing && password && !username) return setStaffError('Enter a username for their login.');
    let staffId = editing?.id;
    if (editing) await api.put(`/staff/${editing.id}`, staffForm);
    else {
      staffId = (await api.post('/staff', staffForm)).data.id;
      setEditing({ id: staffId, ...staffForm }); // a retry after a login error won't add them twice
    }
    try {
      if (existing) {
        const body = {};
        if (username && username !== existing.username) body.username = username;
        if (password) body.password = password;
        if (Object.keys(body).length) await api.put(`/staff-portal/credentials/${existing.id}`, body);
      } else if (username && password) {
        await api.post('/staff-portal/credentials', { staff_id: staffId, username, password });
      }
    } catch (err) {
      await load();
      return setStaffError(`Saved, but the login wasn't: ${err.response?.data?.error || 'something went wrong'}.`);
    }
    await load(); setShowStaffModal(false);
  };

  const removeLogin = async () => {
    const existing = editing && credFor(editing.id);
    if (!existing || !confirm(`Remove ${editing.name}'s portal login?`)) return;
    await api.delete(`/staff-portal/credentials/${existing.id}`);
    setLoginForm({ username: '', password: '', touched: true });
    await load();
  };

  const setInactive = async () => {
    if (!inactiveModal) return;
    await api.put(`/staff/${inactiveModal.id}`, { inactive_until: inactiveDate || null });
    setInactiveModal(null); setInactiveDate(''); load();
  };

  const clearInactive = async (id, e) => {
    e.stopPropagation();
    await api.put(`/staff/${id}`, { inactive_until: null });
    load();
  };

  const archiveStaff = async (id, name, e) => {
    e.stopPropagation();
    if (!confirm(`Archive ${name}? They'll be hidden from active lists but all their data is kept.`)) return;
    try {
      await api.post(`/staff/${id}/archive`);
      load();
    } catch (err) {
      alert(`Archive failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const restoreStaff = async (id, e) => {
    e.stopPropagation();
    await api.post(`/staff/${id}/restore`);
    load();
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
            <button className="btn btn-ghost" onClick={() => openStaffModal(null)}>
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
                const total = checks.filter(c => onCheck(c, s.id) && c.status === 'complete').length;
                const isInactive = s.inactive_until && s.inactive_until >= new Date().toISOString().slice(0, 10);
                return (
                  <tr key={s.id} style={{ cursor: 'pointer', opacity: isInactive ? 0.5 : 1 }} onClick={() => navigate(`/staff/${s.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: isInactive ? 'var(--t3)' : 'var(--cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontSize: 13, flexShrink: 0 }}>
                          {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <span style={{ fontWeight: 700 }}>{s.name}</span>
                          {credFor(s.id) && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Login: {credFor(s.id).username}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--t2)' }}>{s.role}{s.location && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s.location}</div>}</td>
                    <td>{isInactive ? <span className="badge badge-grey">Inactive until {s.inactive_until}</span> : d ? <DueBadge status={d.status} daysLeft={d.days_left} /> : <span style={{ color: 'var(--t3)' }}>—</span>}</td>
                    <td style={{ color: 'var(--t2)' }}>{d?.last_check_date || 'Never'}</td>
                    <td>
                      <ScoreBadge score={avg} precise title={breakdownText(checksAvg(s.id), pointsFor(deductions, s.id)) || undefined} />
                      {pointsFor(deductions, s.id) > 0 && avg != null && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>−{pointsFor(deductions, s.id)} complaints</div>}
                    </td>
                    <td style={{ color: 'var(--t2)' }}>{total}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {isInactive
                          ? <button className="btn btn-sm btn-ghost" onClick={e => clearInactive(s.id, e)}>Reactivate</button>
                          : <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); setInactiveModal(s); setInactiveDate(''); }}>Inactive</button>
                        }
                        <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); openStaffModal(s); }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={e => archiveStaff(s.id, s.name, e)}>Archive</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Archived staff */}
        {archivedStaff.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <button
              onClick={() => setShowArchived(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 12 }}>
              {showArchived ? '▾' : '▸'} Archived Staff ({archivedStaff.length})
            </button>
            {showArchived && (
              <div className="table-wrap" style={{ opacity: 0.75 }}>
                <table>
                  <thead><tr>
                    <th>Name</th><th>Role</th><th>Archived</th><th></th>
                  </tr></thead>
                  <tbody>
                    {archivedStaff.map(s => (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/staff/${s.id}`)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--t3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#000', fontSize: 13, flexShrink: 0 }}>
                              {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <span style={{ fontWeight: 700 }}>{s.name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--t2)' }}>{s.role}</td>
                        <td style={{ color: 'var(--t3)', fontSize: 12 }}>{s.archived_at ? new Date(s.archived_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm btn-ghost" onClick={e => restoreStaff(s.id, e)}>Restore</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
              <select className="form-select" value={checkForm.staff_id} onChange={e => setCheckForm(f => ({ ...f, staff_id: e.target.value, staff_ids: (f.staff_ids || []).filter(x => x !== e.target.value) }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ExtraStaffPicker staff={staff} primaryId={checkForm.staff_id} value={checkForm.staff_ids || []} onChange={ids => setCheckForm(f => ({ ...f, staff_ids: ids }))} />
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

      {/* Set Inactive Modal */}
      {inactiveModal && (
        <div className="modal-overlay" onClick={() => setInactiveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Set Inactive</div>
            <p style={{ color: 'var(--t2)', marginBottom: 16, fontSize: 14 }}>
              Mark <strong>{inactiveModal.name}</strong> as inactive until a specific date. They won't appear as overdue for QC checks during this period.
            </p>
            <div className="form-group">
              <label className="form-label">Inactive Until</label>
              <input className="form-input" type="date" value={inactiveDate} onChange={e => setInactiveDate(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={setInactive} disabled={!inactiveDate}>Set Inactive</button>
              <button className="btn btn-ghost" onClick={() => setInactiveModal(null)}>Cancel</button>
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
              <input className="form-input" value={staffForm.name} onChange={e => setStaffName(e.target.value)} />
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
            <LocationInput value={staffForm.location} onChange={v => setStaffForm(f => ({ ...f, location: v }))} />

            <div style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.08))', margin: '18px 0 14px', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Staff portal login</div>
                {editing && credFor(editing.id) && (
                  <button type="button" onClick={removeLogin} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove login</button>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                Optional. They sign in at {window.location.origin}/portal/login to see their QC results.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" autoComplete="off" value={loginForm.username}
                  onChange={e => setLoginForm(l => ({ ...l, username: e.target.value, touched: true }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{editing && credFor(editing.id) ? 'New password' : 'Password'}</label>
                <input className="form-input" type="password" autoComplete="new-password" value={loginForm.password}
                  placeholder={editing && credFor(editing.id) ? 'Leave blank to keep' : 'Leave blank for no login'}
                  onChange={e => setLoginForm(l => ({ ...l, password: e.target.value }))} />
              </div>
            </div>
            {staffError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 4 }}>{staffError}</p>}
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
