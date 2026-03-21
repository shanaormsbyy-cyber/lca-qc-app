import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Settings() {
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [propForm, setPropForm] = useState({ name: '' });
  const [editingProp, setEditingProp] = useState(null);
  const [showPropModal, setShowPropModal] = useState(false);
  const [newMgr, setNewMgr] = useState({ username: '', password: '', name: '' });
  const [mgrMsg, setMgrMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => Promise.all([api.get('/properties'), api.get('/managers')])
    .then(([p, m]) => { setProperties(p.data); setManagers(m.data); })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const openAddProp = () => { setEditingProp(null); setPropForm({ name: '' }); setShowPropModal(true); };
  const openEditProp = p => { setEditingProp(p); setPropForm({ name: p.name }); setShowPropModal(true); };

  const saveProp = async () => {
    if (!propForm.name) return;
    if (editingProp) await api.put(`/properties/${editingProp.id}`, propForm);
    else await api.post('/properties', propForm);
    await load(); setShowPropModal(false);
  };

  const delProp = async id => {
    if (!confirm('Delete this property?')) return;
    await api.delete(`/properties/${id}`);
    setProperties(p => p.filter(x => x.id !== id));
  };

  const addManager = async () => {
    if (!newMgr.username || !newMgr.password || !newMgr.name) return;
    try {
      await api.post('/managers', newMgr);
      setNewMgr({ username: '', password: '', name: '' });
      setMgrMsg('Manager created successfully');
      load();
    } catch (e) {
      setMgrMsg(e.response?.data?.error || 'Error creating manager');
    }
  };

  const delManager = async (id, name) => {
    if (!confirm(`Delete manager "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/managers/${id}`);
      setManagers(m => m.filter(x => x.id !== id));
      setMgrMsg('');
    } catch (e) {
      setMgrMsg(e.response?.data?.error || 'Error deleting manager');
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28 }}>Settings</h1>

      {/* Properties */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Properties</span>
          <button className="btn btn-primary btn-sm" onClick={openAddProp}>+ Add Property</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Property Name</th><th></th></tr></thead>
            <tbody>
              {properties.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEditProp(p)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => delProp(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Managers */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Manager Accounts</span>
        </div>
        <div className="table-wrap mb-6">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th></th></tr></thead>
            <tbody>
              {managers.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ color: 'var(--t2)' }}>{m.username}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => delManager(m.id, m.name)}
                      disabled={managers.length <= 1}
                      title={managers.length <= 1 ? 'Cannot delete the last manager' : ''}
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Add New Manager</div>
        <div className="form-row mb-4">
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="form-input" value={newMgr.name} onChange={e => setNewMgr(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jane Smith" />
          </div>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={newMgr.username} onChange={e => setNewMgr(f => ({ ...f, username: e.target.value }))} placeholder="e.g. jane" />
          </div>
        </div>
        <div className="form-group" style={{ maxWidth: 300 }}>
          <label className="form-label">Password</label>
          <input className="form-input" type="password" value={newMgr.password} onChange={e => setNewMgr(f => ({ ...f, password: e.target.value }))} />
        </div>
        {mgrMsg && <p style={{ color: mgrMsg.includes('success') ? 'var(--ok)' : 'var(--red)', marginBottom: 12, fontSize: 13 }}>{mgrMsg}</p>}
        <button className="btn btn-primary" onClick={addManager}>Create Manager</button>
      </div>

      {showPropModal && (
        <div className="modal-overlay" onClick={() => setShowPropModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingProp ? 'Edit Property' : 'Add Property'}</div>
            <div className="form-group">
              <label className="form-label">Property Name</label>
              <input className="form-input" value={propForm.name} onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={saveProp}>Save</button>
              <button className="btn btn-ghost" onClick={() => setShowPropModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
