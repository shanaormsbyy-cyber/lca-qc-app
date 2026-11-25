import { useEffect, useState } from 'react';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';

// ─── QC Checklist Builder ──────────────────────────────────────────────────────
function QCChecklistBuilder({ checklist, onSave, onCancel }) {
  const [name, setName] = useState(checklist?.name || '');
  const [desc, setDesc] = useState(checklist?.description || '');
  const [items, setItems] = useState(checklist?.items || []);
  const [repeatableSections, setRepeatableSections] = useState(checklist?.repeatable_sections || []);

  const addItem = () => setItems(i => [...i, { text: '', category: '', score_type: 'pass_fail', weight: 1 }]);
  const update = (idx, field, val) => setItems(i => i.map((it, j) => j === idx ? { ...it, [field]: val } : it));
  const remove = idx => setItems(i => i.filter((_, j) => j !== idx));

  const toggleRepeatable = (cat) => {
    setRepeatableSections(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // Unique non-empty categories from current items
  const uniqueCategories = [...new Set(items.map(it => it.category).filter(Boolean))];

  const handleSave = () => {
    if (!name.trim()) return alert('Checklist name required');
    if (items.filter(it => !it.text.trim()).length > 0) return alert('All items must have text');
    // Remove repeatable entries for categories that no longer exist
    const cleanRS = repeatableSections.filter(c => uniqueCategories.includes(c));
    onSave({ name, description: desc, items, repeatable_sections: cleanRS });
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
              <label className="form-label">Section / Room</label>
              <input className="form-input" placeholder="e.g. Bedroom" value={item.category} onChange={e => update(i, 'category', e.target.value)} />
            </div>
            {item.score_type === '1_to_5' && (
              <div style={{ flex: 1, minWidth: 120 }}>
                <label className="form-label">Weight</label>
                <select className="form-select" value={item.weight} onChange={e => update(i, 'weight', parseFloat(e.target.value))}>
                  <option value="1">1 — Standard</option>
                  <option value="2">2 — Important</option>
                  <option value="3">3 — Critical</option>
                </select>
              </div>
            )}
            <div style={{ flexShrink: 0 }}>
              <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>✕ Remove</button>
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mb-6" onClick={addItem}>+ Add Item</button>

      {/* Repeatable sections */}
      {uniqueCategories.length > 0 && (
        <div className="card mb-6" style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Repeatable Sections</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14 }}>
            Tick any sections that can appear multiple times per property (e.g. Bedroom, Bathroom). When creating a QC check you'll enter how many of each the property has.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {uniqueCategories.map(cat => (
              <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: `1px solid ${repeatableSections.includes(cat) ? 'var(--cyan)' : 'var(--border)'}`, background: repeatableSections.includes(cat) ? 'var(--cyan-dim)' : 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                <input type="checkbox" checked={repeatableSections.includes(cat)} onChange={() => toggleRepeatable(cat)} style={{ accentColor: 'var(--cyan)' }} />
                {cat}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button className="btn btn-primary" onClick={handleSave}>Save Checklist</button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Checklists({ embedded = false }) {
  const [tab, setTab] = useState('qc');
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/qc/checklists?includeArchived=1')
    .then(q => setChecklists(q.data))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  // QC checklist actions
  const saveQC = async data => {
    try {
      if (editing && editing !== 'new') await api.put(`/qc/checklists/${editing.id}`, data);
      else await api.post('/qc/checklists', data);
      await load();
      setEditing(null);
    } catch (e) {
      alert('Failed to save: ' + (e.response?.data?.error || e.message));
    }
  };
  const delQC = async id => {
    if (!confirm('Delete this checklist?')) return;
    try {
      await api.delete(`/qc/checklists/${id}`);
      setChecklists(c => c.filter(x => x.id !== id));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete checklist');
    }
  };
  const setDefault = async (id, defaultFor) => {
    await api.put(`/qc/checklists/${id}/set-default`, { default_for: defaultFor });
    await load();
  };

  const toggleArchive = async (id, archived) => {
    await api.put(`/qc/checklists/${id}/archive`, { archived: !archived });
    await load();
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  // QC editing full-page view
  if (editing) {
    return (
      <div className={embedded ? '' : 'page'}>
        <div className="section-header">
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{editing === 'new' ? 'New QC Checklist' : `Edit: ${editing.name}`}</h1>
        </div>
        <QCChecklistBuilder
          checklist={editing === 'new' ? null : editing}
          onSave={saveQC}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'page'}>
      <div className="section-header">
        {embedded ? <span className="card-title">QC Checklists</span> : <h1 style={{ fontSize: 24, fontWeight: 800 }}>Checklists</h1>}
        {tab === 'qc'       && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ New QC Checklist</button>}
      </div>


      {tab === 'qc' && (
        <>
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

          {checklists.filter(cl => !cl.archived).length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div>No QC checklists yet. Create one above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checklists.filter(cl => !cl.archived).map(cl => (
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
                      <button className="btn btn-sm btn-ghost" onClick={() => toggleArchive(cl.id, cl.archived)}>Archive</button>
                      <button className="btn btn-sm btn-danger"    onClick={() => delQC(cl.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {checklists.some(cl => cl.archived) && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Archived</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checklists.filter(cl => cl.archived).map(cl => (
                  <div key={cl.id} className="card" style={{ opacity: 0.6 }}>
                    <div className="card-header">
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--t2)' }}>{cl.name}</span>
                        {cl.description && <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 2 }}>{cl.description}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleArchive(cl.id, cl.archived)}>Unarchive</button>
                        <button className="btn btn-sm btn-danger" onClick={() => delQC(cl.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
