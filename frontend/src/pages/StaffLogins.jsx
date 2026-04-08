import React, { useEffect, useState } from 'react';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';

export default function StaffLogins() {
  const [credentials, setCredentials] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ staff_id: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', password: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [credRes, staffRes] = await Promise.all([
        api.get('/staff-portal/credentials'),
        api.get('/staff'),
      ]);
      setCredentials(credRes.data);
      setStaff(staffRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const staffWithoutLogin = staff.filter(s => !credentials.find(c => c.staff_id === s.id));

  const handleAdd = async () => {
    if (!addForm.staff_id || !addForm.username || !addForm.password) return;
    setError('');
    try {
      await api.post('/staff-portal/credentials', addForm);
      setShowAdd(false);
      setAddForm({ staff_id: '', username: '', password: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create login');
    }
  };

  const handleUpdate = async (id) => {
    setSaving(true);
    try {
      const body = {};
      if (editForm.username) body.username = editForm.username;
      if (editForm.password) body.password = editForm.password;
      await api.put(`/staff-portal/credentials/${id}`, body);
      setEditId(null);
      setEditForm({ username: '', password: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this staff login?')) return;
    await api.delete(`/staff-portal/credentials/${id}`);
    load();
  };

  // Auto-generate username from staff name
  const autoUsername = (staffId) => {
    const s = staff.find(s2 => s2.id === parseInt(staffId));
    if (!s) return '';
    return s.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
  };

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading...</span></div>;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Portal Logins</h1>
          <p className="page-subtitle">Manage team member access to the read-only QC portal</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Create Login</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Portal URL</span>
        </div>
        <p style={{ color: 'var(--t2)', fontSize: 13 }}>
          Staff can access their portal at: <strong style={{ color: 'var(--cyan)' }}>{window.location.origin}/portal/login</strong>
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Logins</span>
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>{credentials.length} accounts</span>
        </div>

        {credentials.length === 0 ? (
          <p style={{ color: 'var(--t3)', padding: '20px 0' }}>No staff logins created yet. Click "Create Login" to get started.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Username</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {credentials.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{c.staff_name}</td>
                    <td>
                      {editId === c.id ? (
                        <input className="form-input" style={{ padding: '4px 8px', fontSize: 13, maxWidth: 160 }} value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} placeholder={c.username} />
                      ) : (
                        <code style={{ background: 'var(--glass)', padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{c.username}</code>
                      )}
                    </td>
                    <td style={{ color: 'var(--t3)', fontSize: 12 }}>{c.created_at?.slice(0, 10)}</td>
                    <td>
                      {editId === c.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input className="form-input" type="password" style={{ padding: '4px 8px', fontSize: 13, maxWidth: 140 }} value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="New password (optional)" />
                          <button className="btn btn-sm btn-primary" onClick={() => handleUpdate(c.id)} disabled={saving}>Save</button>
                          <button className="btn btn-sm" onClick={() => { setEditId(null); setEditForm({ username: '', password: '' }); }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => { setEditId(c.id); setEditForm({ username: c.username, password: '' }); }}>Edit</button>
                          <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(c.id)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setError(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16 }}>Create Staff Login</h2>
            {staffWithoutLogin.length === 0 ? (
              <p style={{ color: 'var(--t3)' }}>{staff.length === 0 ? 'No staff members yet. Add staff members first before creating logins.' : 'All staff members already have a login.'}</p>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Staff Member</label>
                  <select className="form-input form-select" value={addForm.staff_id} onChange={e => {
                    const sid = e.target.value;
                    setAddForm(f => ({ ...f, staff_id: sid, username: autoUsername(sid) }));
                  }}>
                    <option value="">Select staff member...</option>
                    {staffWithoutLogin.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Username</label>
                  <input className="form-input" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. firstname" />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label">Password</label>
                  <input className="form-input" type="text" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="Set a password" />
                </div>
                {error && <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => { setShowAdd(false); setError(''); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAdd} disabled={!addForm.staff_id || !addForm.username || !addForm.password}>Create</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
