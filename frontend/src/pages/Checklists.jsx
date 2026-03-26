import { useEffect, useState } from 'react';
import api from '../api';

function ChecklistBuilder({ checklist, onSave, onCancel }) {
  const [name, setName] = useState(checklist?.name || '');
  const [desc, setDesc] = useState(checklist?.description || '');
  const [items, setItems] = useState(checklist?.items || []);

  const addItem = () => setItems(i => [...i, { text: '', category: '', score_type: 'pass_fail', weight: 1 }]);
  const update = (idx, field, val) => setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));
  const remove = idx => setItems(i => i.filter((_, j) => j !== idx));

  const handleSave = () => {
    if (!name.trim()) return alert('Checklist name required');
    if (items.filter(it => !it.text.trim()).length > 0) return alert('All items must have text');
    onSave({ name, description: desc, items });
  };

  return (
    <div>
      <div className="form-row mb-4">
        <div className="form-group">
          <label className="form-label">Checklist Name</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 14, color: 'var(--t2)' }}>Items ({items.length})</div>
      {items.map((item, i) => (
        <div key={i} className="card mb-4" style={{ padding: '14px 16px' }}>
          <div className="flex gap-2 mb-3" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 3 }}>
              <label className="form-label">Item Text</label>
              <input className="form-input" placeholder="What to check…" value={item.text} onChange={e => update(i, 'text', e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="form-label">Score Type</label>
              <select className="form-select" value={item.score_type} onChange={e => update(i, 'score_type', e.target.value)}>
                <option value="pass_fail">Pass / Fail</option>
                <option value="1_to_5">Score 1–5</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <label className="form-label">Category</label>
              <input className="form-input" placeholder="e.g. Bathrooms" value={item.category} onChange={e => update(i, 'category', e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label className="form-label">Weight</label>
              <select className="form-select" value={item.weight} onChange={e => update(i, 'weight', parseFloat(e.target.value))}>
                <option value="1">1 — Standard</option>
                <option value="2">2 — Important</option>
                <option value="3">3 — Critical</option>
              </select>
            </div>
            <div style={{ flexShrink: 0 }}>
              <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>✕ Remove</button>
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mb-6" onClick={addItem}>+ Add Item</button>
      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={handleSave}>Save Checklist</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function Checklists() {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null=list, 'new', or checklist obj

  const load = () => api.get('/qc/checklists').then(r => setChecklists(r.data)).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const save = async data => {
    try {
      if (editing && editing !== 'new') await api.put(`/qc/checklists/${editing.id}`, data);
      else await api.post('/qc/checklists', data);
      await load();
      setEditing(null);
    } catch (e) {
      alert('Failed to save: ' + (e.response?.data?.error || e.message));
    }
  };

  const del = async id => {
    if (!confirm('Delete this checklist?')) return;
    await api.delete(`/qc/checklists/${id}`);
    setChecklists(c => c.filter(x => x.id !== id));
  };

  const setDefault = async (id, defaultFor) => {
    await api.put(`/qc/checklists/${id}/set-default`, { default_for: defaultFor });
    await load();
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  if (editing) {
    return (
      <div className="page">
        <div className="section-header">
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{editing === 'new' ? 'New Checklist' : `Edit: ${editing.name}`}</h1>
        </div>
        <ChecklistBuilder
          checklist={editing === 'new' ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="section-header">
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Checklists</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ New Checklist</button>
      </div>

      {/* Default assignments summary */}
      {checklists.length > 0 && (
        <div className="card mb-6" style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 10 }}>DEFAULT CHECKLISTS</div>
          <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
            {['staff', 'property'].map(type => {
              const def = checklists.find(cl => cl.default_for === type);
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--t3)', textTransform: 'capitalize' }}>{type} checks:</span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: def ? 'var(--cyan)' : 'var(--t3)',
                    background: def ? 'var(--cyan-dim)' : 'transparent',
                    padding: def ? '2px 8px' : 0, borderRadius: 6,
                  }}>
                    {def ? def.name : 'None set'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {checklists.length === 0 ? (
        <div className="empty-state"><div className="icon">📋</div>No checklists yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checklists.map(cl => (
            <div key={cl.id} className="card">
              <div className="card-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{cl.name}</span>
                    {cl.default_for === 'staff'    && <span className="badge badge-blue">Default: Staff Check</span>}
                    {cl.default_for === 'property' && <span className="badge badge-accent">Default: Property Check</span>}
                  </div>
                  {cl.description && <div style={{ color: 'var(--t2)', fontSize: 13, marginTop: 2 }}>{cl.description}</div>}
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{cl.items?.length || 0} items</div>
                </div>
                <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {cl.default_for !== 'staff'     && <button className="btn btn-sm btn-ghost" onClick={() => setDefault(cl.id, 'staff')}>Set Staff Default</button>}
                  {cl.default_for !== 'property'  && <button className="btn btn-sm btn-ghost" onClick={() => setDefault(cl.id, 'property')}>Set Property Default</button>}
                  {cl.default_for                 && <button className="btn btn-sm btn-ghost" onClick={() => setDefault(cl.id, null)}>Clear Default</button>}
                  <button className="btn btn-sm btn-secondary" onClick={() => setEditing(cl)}>Edit</button>
                  <button className="btn btn-sm btn-danger"    onClick={() => del(cl.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
