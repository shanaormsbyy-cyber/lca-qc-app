import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, Panel, Icon, Loading, EmptyState } from '../components/ui';

const ICONS = ['bath', 'bed-double', 'cooking-pot', 'sofa', 'washing-machine', 'sparkles', 'flask-conical', 'spray-can', 'badge-check',
  'door-open', 'shirt', 'trash-2', 'wind', 'droplets', 'brush', 'shield-check', 'clock', 'star'];

function ListEditor({ items, onChange, placeholder, withNotes }) {
  const set = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="editor-row">
          <div className="grow">
            <input className="form-input" value={it.title} placeholder={placeholder} onChange={e => set(i, { title: e.target.value })} />
            {withNotes && <input className="form-input mt-4" value={it.notes || ''} placeholder="Notes (optional)" onChange={e => set(i, { notes: e.target.value })} />}
          </div>
          <button className="icon-btn danger" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...items, { title: '', notes: '' }])}><Plus size={14} /> Add</button>
    </div>
  );
}

function SkillEditor({ skill, onDone }) {
  const [form, setForm] = useState({
    name: skill.name, icon: skill.icon || 'badge-check', category: skill.category || '', required: !!skill.required,
    criteria: skill.criteria.map(c => ({ title: c.text })),
    default_modules: skill.default_modules.map(m => ({ title: m.title, notes: m.notes || '' })),
  });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await api.put(`/skills/${skill.id}`, {
        name: form.name, icon: form.icon, category: form.category, required: form.required ? 1 : 0, archived: skill.archived,
        criteria: form.criteria.map(c => c.title), default_modules: form.default_modules,
      });
      onDone();
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <div className="mt-16">
      <div className="form-row">
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
      </div>
      <div className="form-group">
        <label className="form-label">Icon</label>
        <div className="row-gap">
          {ICONS.map(n => (
            <button key={n} className={`icon-btn${form.icon === n ? ' active-icon' : ''}`} style={form.icon === n ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : undefined} onClick={() => setForm({ ...form, icon: n })}><Icon name={n} size={16} /></button>
          ))}
        </div>
      </div>
      <label className="check-row mb-4"><input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} /><span><b>Required for sign-off</b> — every new hire gets this skill</span></label>
      <div className="two-col-even">
        <div className="form-group"><label className="form-label">Assessment criteria</label>
          <ListEditor items={form.criteria} onChange={v => setForm({ ...form, criteria: v })} placeholder="e.g. No streaks on glass" /></div>
        <div className="form-group"><label className="form-label">Default plan modules</label>
          <ListEditor withNotes items={form.default_modules} onChange={v => setForm({ ...form, default_modules: v })} placeholder="e.g. Bathroom — guided practice" /></div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="row-gap"><button className="btn btn-primary btn-sm" onClick={save}>Save skill</button><button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button></div>
    </div>
  );
}

export default function ManageSkills() {
  const navigate = useNavigate();
  const [skills, reload] = useLoad(() => api.get('/skills?include_archived=1').then(r => r.data));
  const [open, setOpen] = useState(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  if (!skills) return <Loading />;

  const active = skills.filter(s => !s.archived);
  const archived = skills.filter(s => s.archived);
  const move = async (i, dir) => {
    const ids = active.map(s => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.put('/skills/order', { ids: [...ids, ...archived.map(s => s.id)] });
  };
  const toggleRequired = (s) => api.put(`/skills/${s.id}`, { required: s.required ? 0 : 1 });
  const setArchived = (s, v) => api.put(`/skills/${s.id}`, { archived: v });
  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    try { await api.delete(`/skills/${s.id}`); setError(''); } catch (e) { setError(errMsg(e)); }
  };
  const add = async () => {
    if (!newName.trim()) return;
    const r = await api.post('/skills', { name: newName.trim() });
    setNewName(''); await reload(); setOpen(r.data.id);
  };

  const card = (s, i) => (
    <div key={s.id} className="group-box">
      <div className="group-head" onClick={() => setOpen(open === s.id ? null : s.id)}>
        {open === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Icon name={s.icon} size={20} style={{ color: 'var(--cyan)' }} />
        <div className="grow"><div className="strong">{s.name}</div><div className="muted small">{s.category || 'No category'} · {s.criteria.length} criteria · {s.default_modules.length} default modules</div></div>
        <div className="row-gap" onClick={e => e.stopPropagation()}>
          {!s.archived && (
            <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={!!s.required} onChange={() => toggleRequired(s)} /><span className="small">Required</span></label>
          )}
          {!s.archived && <>
            <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={14} /></button>
            <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === active.length - 1}><ArrowDown size={14} /></button>
          </>}
          <button className="btn btn-ghost btn-sm" onClick={() => setArchived(s, s.archived ? 0 : 1)}>{s.archived ? 'Restore' : 'Archive'}</button>
          <button className="icon-btn danger" onClick={() => remove(s)}><Trash2 size={14} /></button>
        </div>
      </div>
      {open === s.id && <div className="group-body"><SkillEditor skill={s} onDone={() => setOpen(null)} /></div>}
    </div>
  );

  return (
    <div>
      <PageTitle title="Manage Skills" sub="The required-skills template every new hire starts with, plus each skill's assessment criteria and default plan modules.">
        <button className="btn btn-ghost" onClick={() => navigate('/training-hub/competencies')}>← Back to Competencies</button>
      </PageTitle>
      <div className="notice notice-cyan mb-4"><Icon name="info" /><div>Changes apply to new trainees only. Trainers can still add or remove skills for an individual trainee from their profile.</div></div>
      {error && <div className="notice notice-amber mb-4"><Icon name="alert-triangle" /><div>{error}</div></div>}
      <Panel title={`Skills (${active.length})`} icon="award" right={
        <div className="row-gap"><input className="form-input" style={{ width: 220 }} placeholder="New skill name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!newName.trim()}>+ Add skill</button></div>}>
        {active.length === 0 ? <EmptyState text="No skills yet." /> : active.map(card)}
      </Panel>
      {archived.length > 0 && <Panel className="mt-16" title={`Archived (${archived.length})`} icon="archive">{archived.map(card)}</Panel>}
    </div>
  );
}
