import React, { useEffect, useState } from 'react';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';

export default function Settings() {
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [propForm, setPropForm] = useState({ name: '' });
  const [editingProp, setEditingProp] = useState(null);
  const [showPropModal, setShowPropModal] = useState(false);
  const [newMgr, setNewMgr] = useState({ username: '', password: '', name: '' });
  const [mgrMsg, setMgrMsg] = useState('');
  const [editingMgr, setEditingMgr] = useState(null); // { id, name }
  const [loading, setLoading] = useState(true);

  // QC / Alert settings
  const [qcSettings, setQcSettings] = useState({
    qc_freq_staff_days: '30',
    qc_freq_property_days: '14',
    watchlist_threshold: '90',
    top_performers_threshold: '90',
    top_performers_min_checks: '3',
    heatpump_freq_days: '90',
    flag_min_count: '3',
    flag_moderate_min: '3',
    flag_moderate_max: '4',
    flag_major_min: '5',
    flag_major_max: '7',
    flag_urgent_min: '8',
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const load = () => Promise.all([
    api.get('/properties'),
    api.get('/managers'),
    api.get('/scheduling/settings'),
  ]).then(([p, m, s]) => {
    setProperties(p.data);
    setManagers(m.data);
    setQcSettings(prev => ({ ...prev, ...s.data }));
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useLiveSync(load);

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

  const saveManagerName = async () => {
    if (!editingMgr?.name?.trim()) return;
    try {
      await api.put(`/managers/${editingMgr.id}`, { name: editingMgr.name });
      setEditingMgr(null);
      load();
    } catch (e) {
      setMgrMsg(e.response?.data?.error || 'Error updating name');
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

  const saveQcSettings = async () => {
    await api.put('/scheduling/settings', qcSettings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  const setSetting = (key, val) => setQcSettings(s => ({ ...s, [key]: val }));

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28 }}>Settings</h1>

      {/* QC Frequency & Alert Settings */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">QC Frequency & Alert Settings</span>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Check Frequency</div>
        <div className="form-row mb-6">
          <div className="form-group">
            <label className="form-label">Staff QC Frequency (days)</label>
            <input className="form-input" type="number" min="1" value={qcSettings.qc_freq_staff_days}
              onChange={e => setSetting('qc_freq_staff_days', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>How often each staff member needs a QC check</div>
          </div>
          <div className="form-group">
            <label className="form-label">Property QC Frequency (days)</label>
            <input className="form-input" type="number" min="1" value={qcSettings.qc_freq_property_days}
              onChange={e => setSetting('qc_freq_property_days', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>How often each property needs a QC check</div>
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Performance Watchlist</div>
        <div className="form-row mb-6">
          <div className="form-group">
            <label className="form-label">Watchlist Threshold (%)</label>
            <input className="form-input" type="number" min="1" max="100" value={qcSettings.watchlist_threshold}
              onChange={e => setSetting('watchlist_threshold', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>Cleaners with avg QC score below this % appear on the watchlist</div>
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Top Performers</div>
        <div className="form-row mb-6">
          <div className="form-group">
            <label className="form-label">Top Performer Threshold (%)</label>
            <input className="form-input" type="number" min="1" max="100" value={qcSettings.top_performers_threshold}
              onChange={e => setSetting('top_performers_threshold', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>Cleaners with avg QC score at or above this % appear as top performers</div>
          </div>
          <div className="form-group">
            <label className="form-label">Minimum Checks Required</label>
            <input className="form-input" type="number" min="1" value={qcSettings.top_performers_min_checks}
              onChange={e => setSetting('top_performers_min_checks', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>Minimum number of completed checks before a cleaner can qualify</div>
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Heat Pump Filter Cleans</div>
        <div className="form-row mb-6">
          <div className="form-group">
            <label className="form-label">Filter Clean Frequency (days)</label>
            <input className="form-input" type="number" min="1" value={qcSettings.heatpump_freq_days}
              onChange={e => setSetting('heatpump_freq_days', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>Days between filter cleans — next due date is set automatically when marking complete</div>
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Commonly Flagged Issues</div>
        <div className="form-row mb-4">
          <div className="form-group">
            <label className="form-label">Minimum times flagged to appear</label>
            <input className="form-input" type="number" min="1" value={qcSettings.flag_min_count}
              onChange={e => setSetting('flag_min_count', e.target.value)} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10, fontWeight: 600 }}>Severity Labels (by number of times flagged)</div>
        <div className="form-row mb-4">
          <div className="form-group">
            <label className="form-label">Moderate — min times</label>
            <input className="form-input" type="number" min="1" value={qcSettings.flag_moderate_min}
              onChange={e => setSetting('flag_moderate_min', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Moderate — max times</label>
            <input className="form-input" type="number" min="1" value={qcSettings.flag_moderate_max}
              onChange={e => setSetting('flag_moderate_max', e.target.value)} />
          </div>
        </div>
        <div className="form-row mb-4">
          <div className="form-group">
            <label className="form-label">Major — min times</label>
            <input className="form-input" type="number" min="1" value={qcSettings.flag_major_min}
              onChange={e => setSetting('flag_major_min', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Major — max times</label>
            <input className="form-input" type="number" min="1" value={qcSettings.flag_major_max}
              onChange={e => setSetting('flag_major_max', e.target.value)} />
          </div>
        </div>
        <div className="form-row mb-6">
          <div className="form-group">
            <label className="form-label">Urgent — min times (no upper limit)</label>
            <input className="form-input" type="number" min="1" value={qcSettings.flag_urgent_min}
              onChange={e => setSetting('flag_urgent_min', e.target.value)} />
          </div>
        </div>

        {settingsSaved && <p style={{ color: 'var(--green)', marginBottom: 12, fontSize: 13 }}>✓ Settings saved</p>}
        <button className="btn btn-primary" onClick={saveQcSettings}>Save Settings</button>
      </div>

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
                  <td style={{ fontWeight: 600 }}>
                    {editingMgr?.id === m.id ? (
                      <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} value={editingMgr.name} onChange={e => setEditingMgr(x => ({ ...x, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') saveManagerName(); if (e.key === 'Escape') setEditingMgr(null); }} autoFocus />
                    ) : m.name}
                  </td>
                  <td style={{ color: 'var(--t2)' }}>{m.username}</td>
                  <td>
                    <div className="flex gap-2">
                      {editingMgr?.id === m.id ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={saveManagerName}>Save</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditingMgr(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => setEditingMgr({ id: m.id, name: m.name })}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => delManager(m.id, m.name)} disabled={managers.length <= 1} title={managers.length <= 1 ? 'Cannot delete the last manager' : ''}>Delete</button>
                        </>
                      )}
                    </div>
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
