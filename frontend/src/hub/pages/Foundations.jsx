import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, Panel, Loading, Icon, EmptyState } from '../components/ui';

export default function Foundations() {
  const [rooms] = useLoad(() => api.get('/foundations').then(r => r.data));
  const [selected, setSelected] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');

  const room = rooms && (rooms.find(r => r.id === selected) || rooms.find(r => r.prompts.length) || rooms[0]);
  // Load the chosen room's prompts into the editor (but don't clobber unsaved edits on live refresh).
  useEffect(() => {
    if (room && !dirty) setPrompts(room.prompts.map(p => ({ text: p.text, details: p.details || '' })));
  }, [room && room.id, rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rooms) return <Loading />;

  const pick = (id) => {
    if (dirty && !window.confirm('You have unsaved changes for this room. Discard them?')) return;
    setDirty(false); setMsg(''); setSelected(id);
    const r = rooms.find(x => x.id === id);
    setPrompts(r.prompts.map(p => ({ text: p.text, details: p.details || '' })));
  };
  const edit = (next) => { setPrompts(next); setDirty(true); setMsg(''); };
  const setP = (i, patch) => edit(prompts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i, d) => { const a = [...prompts]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; edit(a); };
  const save = async () => {
    try { await api.put(`/foundations/${room.id}`, { prompts }); setDirty(false); setMsg('Saved.'); }
    catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <div>
      <PageTitle title="Foundations Training" sub="Teaching prompts for each room — what trainers walk new cleaners through before room competencies." />
      <div className="two-col" style={{ gridTemplateColumns: '300px minmax(0, 1fr)' }}>
        <Panel title="Rooms" icon="door-open">
          {rooms.map(r => (
            <button key={r.id} className={`mini-card w-full${room && r.id === room.id ? ' selected-card' : ''}`} style={{ marginBottom: 8, padding: 12 }} onClick={() => pick(r.id)}>
              <Icon name={r.icon} size={20} className="mini-card-icon" />
              <span className="grow strong small">{r.name}</span>
              <span className="muted small">{r.prompts.length}</span>
            </button>
          ))}
          <p className="muted small mt-16">Rooms come from your skills list (Competencies → Manage Skills).</p>
        </Panel>

        {room && (
          <Panel title={`${room.name} — teaching prompts`} icon={room.icon} right={
            <div className="row-gap">{msg && <span className="muted small">{msg}</span>}<button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save prompts</button></div>}>
            <p className="muted small mb-4">Each prompt is a point the trainer covers with the trainee. Add details to explain how or why.</p>
            {prompts.length === 0 && <EmptyState icon="lightbulb" text="No prompts yet for this room." />}
            {prompts.map((p, i) => (
              <div key={i} className="group-box" style={{ padding: 12 }}>
                <div className="editor-row">
                  <span className="step-num" style={{ color: 'var(--cyan)', marginTop: 10 }}>{i + 1}</span>
                  <div className="grow">
                    <input className="form-input strong" value={p.text} placeholder="What to teach — e.g. Spray and let it dwell" onChange={e => setP(i, { text: e.target.value })} />
                    <textarea className="form-textarea mt-4" style={{ minHeight: 56 }} value={p.details} placeholder="Details (optional) — how to show it, what to watch for" onChange={e => setP(i, { details: e.target.value })} />
                  </div>
                  <button className="icon-btn" onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                  <button className="icon-btn" onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                  <button className="icon-btn danger" onClick={() => edit(prompts.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            <div className="row-gap mt-16" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => edit([...prompts, { text: '', details: '' }])}><Plus size={14} /> Add prompt</button>
              <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save prompts</button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
