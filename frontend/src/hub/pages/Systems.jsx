import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Eye, MoreHorizontal, Plus, Trash2, ArrowUp, ArrowDown, Search } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, Panel, EmptyState, Loading, Icon, Modal } from '../components/ui';
import { fmtDate } from '../lib/format';

const ICONS = ['clipboard-check', 'refresh-cw', 'user-plus', 'sparkles', 'flask-conical', 'spray-can', 'users', 'door-open', 'layers', 'footprints', 'book-open', 'shield-check', 'bed-double', 'bath', 'star', 'heart-handshake'];

export function SystemEditModal({ system, onClose }) {
  const [cats] = useLoad(() => api.get('/systems/categories').then(r => r.data));
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      if (system) {
        const s = (await api.get(`/systems/${system.id}`)).data;
        setForm({ name: s.name, description: s.description || '', icon: s.icon || 'book-open', category_id: s.category_id || '',
          modules: s.modules.map(m => ({ title: m.title, content: m.content || '' })) });
      } else setForm({ name: '', description: '', icon: 'book-open', category_id: '', modules: [] });
    })();
  }, [system]);
  if (!form) return null;
  const setMod = (i, patch) => setForm(f => ({ ...f, modules: f.modules.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const moveMod = (i, d) => { const a = [...form.modules]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setForm({ ...form, modules: a }); };
  const save = async () => {
    const body = { ...form, category_id: form.category_id ? Number(form.category_id) : null };
    try {
      if (system) await api.put(`/systems/${system.id}`, body); else await api.post('/systems', body);
      onClose(true);
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Modal wide title={system ? `Edit ${system.name}` : 'Add Training System'} onClose={() => onClose(false)} footer={<>
      <button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
      <button className="btn btn-primary" disabled={!form.name.trim()} onClick={save}>Save</button></>}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Category</label>
          <select className="form-select" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">—</option>{(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
      </div>
      <div className="form-group"><label className="form-label">Short description</label><input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
      <div className="form-group"><label className="form-label">Icon</label>
        <div className="row-gap">{ICONS.map(n => <button key={n} className="icon-btn" style={form.icon === n ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : undefined} onClick={() => setForm({ ...form, icon: n })}><Icon name={n} size={16} /></button>)}</div></div>
      <label className="form-label">Explanation</label>
      <p className="muted small mb-4">Short blurbs shown when someone opens this system — e.g. what it is, when to use it, how to do it.</p>
      {form.modules.map((m, i) => (
        <div key={i} className="group-box" style={{ padding: 10 }}>
          <div className="editor-row">
            <input className="form-input" value={m.title} placeholder="Heading — e.g. When to use it" onChange={e => setMod(i, { title: e.target.value })} />
            <button className="icon-btn" onClick={() => moveMod(i, -1)}><ArrowUp size={14} /></button>
            <button className="icon-btn" onClick={() => moveMod(i, 1)}><ArrowDown size={14} /></button>
            <button className="icon-btn danger" onClick={() => setForm({ ...form, modules: form.modules.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
          <textarea className="form-textarea" value={m.content} placeholder="Explanation" onChange={e => setMod(i, { content: e.target.value })} />
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, modules: [...form.modules, { title: '', content: '' }] })}><Plus size={14} /> Add blurb</button>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

function CategoriesModal({ onClose }) {
  const [cats, reload] = useLoad(() => api.get('/systems/categories').then(r => r.data));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const run = async (fn) => { try { await fn(); setError(''); reload(); } catch (e) { setError(errMsg(e)); } };
  return (
    <Modal title="Training system categories" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      {(cats || []).map(c => (
        <div key={c.id} className="editor-row">
          <input className="form-input" defaultValue={c.name} onBlur={e => e.target.value.trim() && e.target.value !== c.name && run(() => api.put(`/systems/categories/${c.id}`, { name: e.target.value, color: c.color }))} />
          <button className="icon-btn danger" onClick={() => run(() => api.delete(`/systems/categories/${c.id}`))}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="editor-row"><input className="form-input" placeholder="New category" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={!name.trim()} onClick={() => run(async () => { await api.post('/systems/categories', { name }); setName(''); })}>Add</button></div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

export default function Systems() {
  const navigate = useNavigate();
  const [systems] = useLoad(() => api.get('/systems').then(r => r.data));
  const [cats] = useLoad(() => api.get('/systems/categories').then(r => r.data));
  const [usage] = useLoad(() => api.get('/systems/usage').then(r => r.data));
  const [summary] = useLoad(() => api.get('/resources/summary').then(r => r.data));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState(null);
  const [menu, setMenu] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [error, setError] = useState('');
  if (!systems || !usage || !summary || !cats) return <Loading />;

  const top = [...systems].sort((a, b) => b.uses - a.uses || a.sort_order - b.sort_order).slice(0, 6);
  const shown = systems.filter(s => (!q || s.name.toLowerCase().includes(q.toLowerCase())) && (!cat || s.category_id === Number(cat)));
  const del = async (s) => {
    setMenu(null);
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    try { await api.delete(`/systems/${s.id}`); setError(''); } catch (e) { setError(errMsg(e)); }
  };
  const archive = async (s) => { setMenu(null); await api.put(`/systems/${s.id}`, { archived: 1 }); };
  const catTone = (c) => ({ background: `${c || '#3AB5D9'}22`, color: c || 'var(--cyan)', borderColor: `${c || '#3AB5D9'}66` });

  return (
    <div>
      <PageTitle title="Training Systems" sub="Manage standardised training methods and resources.">
        <button className="btn btn-primary" onClick={() => setEdit('new')}>+ Add Training System</button>
      </PageTitle>
      <div className="two-col">
        <div className="stack">
          <div className="cards-grid">
            {top.map(s => (
              <button key={s.id} className="mini-card" onClick={() => navigate(`/training-hub/systems/${s.id}`)}>
                <Icon name={s.icon} size={34} className="mini-card-icon" />
                <div className="grow"><div className="strong">{s.name}</div>{s.description && <div className="muted small mt-4">{s.description}</div>}</div>
                <ChevronRight size={16} className="chev" />
              </button>
            ))}
          </div>
          {error && <div className="notice notice-amber"><Icon name="alert-triangle" /><div>{error}</div></div>}
          <Panel title="Training System Library" icon="layers" right={
            <div className="toolbar" style={{ margin: 0 }}>
              <div className="hub-search" style={{ width: 220 }}><Search size={14} /><input placeholder="Search training systems…" value={q} onChange={e => setQ(e.target.value)} /></div>
              <select className="form-select" value={cat} onChange={e => (e.target.value === 'edit' ? setCatModal(true) : setCat(e.target.value))}>
                <option value="">All Categories</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="edit">Edit categories…</option>
              </select>
            </div>}>
            {shown.length === 0 ? <EmptyState text="No training systems match." /> : (
              <div className="table-scroll" style={{ minHeight: menu ? 200 : undefined }}>
                <table className="hub-table">
                  <thead><tr><th>Training system</th><th>Category</th><th>Last updated</th><th>Usage</th><th>Actions</th></tr></thead>
                  <tbody>
                    {shown.map(s => (
                      <tr key={s.id}>
                        <td><span className="person"><Icon name={s.icon} size={20} style={{ color: 'var(--cyan)' }} /><span><span className="strong" style={{ display: 'block' }}>{s.name}</span><span className="muted small">{s.description}</span></span></span></td>
                        <td>{s.category_name ? <span className="pill" style={catTone(s.category_color)}>{s.category_name}</span> : '—'}</td>
                        <td className="small">{fmtDate(s.updated_at)}</td>
                        <td className="small">{s.uses} uses</td>
                        <td style={{ position: 'relative' }}>
                          <button className="icon-btn" onClick={() => navigate(`/training-hub/systems/${s.id}`)}><Eye size={15} /></button>{' '}
                          <button className="icon-btn" onClick={() => setMenu(menu === s.id ? null : s.id)}><MoreHorizontal size={15} /></button>
                          {menu === s.id && (
                            <div className="search-drop" style={{ right: 0, left: 'auto', width: 160, top: 40 }}>
                              <button className="search-item" onClick={() => { setEdit(s); setMenu(null); }}>Edit</button>
                              <button className="search-item" onClick={() => archive(s)}>Archive</button>
                              <button className="search-item" onClick={() => del(s)}>Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Training Resources" icon="book-open">
            <p className="muted small mb-4">Guides, videos and tools to support trainer delivery.</p>
            <div className="three-col" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
              {[['video', 'circle-play', 'Videos'], ['guide', 'file-text', 'Guides'], ['image', 'image', 'Images'], ['template', 'download', 'Templates']].map(([t, i, l]) => (
                <div key={t} className="count-box" onClick={() => navigate(`/training-hub/resources?type=${t}`)}><Icon name={i} size={20} /><b>{summary[t]}</b><span>{l}</span></div>
              ))}
            </div>
            <div className="strong small mt-16 mb-4">Quick Links</div>
            {summary.categories.map(c => (
              <button key={c.id} className="mini-card w-full" style={{ marginBottom: 8, padding: 10 }} onClick={() => navigate(`/training-hub/resources?category_id=${c.id}`)}>
                <Icon name="book-open" size={16} className="mini-card-icon" /><span className="grow small strong">{c.name}</span><span className="muted small">{c.count}</span><ChevronRight size={14} className="chev" />
              </button>
            ))}
          </Panel>
          <Panel title="System Performance" icon="bar-chart-3">
            <p className="muted small mb-4">Training system usage (30 days)</p>
            <div className="row-gap" style={{ justifyContent: 'space-between' }}>
              <div><div className="stat-tile-value">{usage.last30}</div><div className="muted small">Total Uses</div></div>
              <div style={{ textAlign: 'right' }}>
                {usage.changePct == null ? <div className="muted">—</div> : <div className={usage.changePct >= 0 ? 'up strong' : 'down strong'} style={{ fontSize: 20 }}>{usage.changePct >= 0 ? '↑ +' : '↓ '}{usage.changePct}%</div>}
                <div className="muted small">vs. previous 30 days</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
      {edit && <SystemEditModal system={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {catModal && <CategoriesModal onClose={() => setCatModal(false)} />}
    </div>
  );
}
