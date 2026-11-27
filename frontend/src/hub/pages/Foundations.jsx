import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, Pencil } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, Panel, Loading, Icon, EmptyState } from '../components/ui';

export default function Foundations() {
  const [rooms, reload] = useLoad(() => api.get('/foundations').then(r => r.data));
  const [selected, setSelected] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [roomError, setRoomError] = useState('');

  const room = rooms && (rooms.find(r => r.id === selected) || rooms[0]);
  // Load the chosen room's prompts into the editor (but don't clobber unsaved edits on live refresh).
  useEffect(() => {
    if (room && !dirty) setPrompts(room.prompts.map(p => ({ text: p.text, details: p.details || '' })));
    if (!room) setPrompts([]);
  }, [room && room.id, rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rooms) return <Loading />;

  const confirmDiscard = () => !dirty || window.confirm('You have unsaved prompt changes for this room. Discard them?');
  const pick = (id) => {
    if (id === (room && room.id) || !confirmDiscard()) return;
    setDirty(false); setMsg(''); setSelected(id);
    const r = rooms.find(x => x.id === id);
    setPrompts(r.prompts.map(p => ({ text: p.text, details: p.details || '' })));
  };
  const edit = (next) => { setPrompts(next); setDirty(true); setMsg(''); };
  const setP = (i, patch) => edit(prompts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i, d) => { const a = [...prompts]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; edit(a); };
  const save = async () => {
    try { await api.put(`/foundations/${room.id}`, { prompts }); setDirty(false); setMsg('Saved.'); reload(); }
    catch (e) { setMsg(errMsg(e)); }
  };

  // ── Room list actions ──
  const addRoom = async (e) => {
    e && e.preventDefault();
    const name = newRoom.trim();
    if (!name) return;
    if (!confirmDiscard()) return;
    setRoomError('');
    try {
      const r = await api.post('/foundations/rooms', { name });
      setNewRoom(''); setDirty(false); setSelected(r.data.id); await reload();
    } catch (err) { setRoomError(errMsg(err)); }
  };
  const moveRoom = async (i, d) => {
    const ids = rooms.map(r => r.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.put('/foundations/rooms/order', { ids }); reload(); } catch (err) { setRoomError(errMsg(err)); }
  };
  const renameRoom = async () => {
    const name = window.prompt('Rename room', room.name);
    if (name == null || !name.trim() || name.trim() === room.name) return;
    try { await api.put(`/foundations/rooms/${room.id}`, { name: name.trim() }); reload(); } catch (err) { setMsg(errMsg(err)); }
  };
  const deleteRoom = async () => {
    if (!window.confirm(`Delete "${room.name}" and its ${room.prompts.length} prompt${room.prompts.length === 1 ? '' : 's'}? Trainees' "gone through" ticks for this room are removed too.`)) return;
    try { await api.delete(`/foundations/rooms/${room.id}`); setDirty(false); setSelected(null); reload(); } catch (err) { setMsg(errMsg(err)); }
  };

  return (
    <div>
      <PageTitle title="Foundations Training" sub="Teaching prompts for each room — what trainers walk new cleaners through before room competencies." />
      <div className="two-col" style={{ gridTemplateColumns: '300px minmax(0, 1fr)' }}>
        <Panel title="Rooms" icon="door-open">
          {rooms.length === 0 && <p className="muted small mb-4">No rooms yet — add your first one below (e.g. Kitchen, Bathroom, Bedroom).</p>}
          {rooms.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <button className={`mini-card grow${room && r.id === room.id ? ' selected-card' : ''}`} style={{ padding: 12, minWidth: 0 }} onClick={() => pick(r.id)}>
                <Icon name={r.icon} size={20} className="mini-card-icon" />
                <span className="grow strong small" style={{ textAlign: 'left' }}>{r.name}</span>
                <span className="muted small">{r.prompts.length}</span>
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="icon-btn" style={{ width: 24, height: 20 }} title="Move up" disabled={i === 0} onClick={() => moveRoom(i, -1)}><ArrowUp size={12} /></button>
                <button className="icon-btn" style={{ width: 24, height: 20 }} title="Move down" disabled={i === rooms.length - 1} onClick={() => moveRoom(i, 1)}><ArrowDown size={12} /></button>
              </div>
            </div>
          ))}
          <form onSubmit={addRoom} className="mt-16" style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ minWidth: 0 }} placeholder="New room, e.g. Kitchen" value={newRoom} onChange={e => setNewRoom(e.target.value)} />
            <button className="btn btn-secondary btn-sm" type="submit" disabled={!newRoom.trim()}><Plus size={14} /> Add</button>
          </form>
          {roomError && <div className="form-error mt-4">{roomError}</div>}
          <p className="muted small mt-16">These rooms are just for Foundations — separate from your competency skills.</p>
        </Panel>

        {room ? (
          <Panel title={`${room.name} — teaching prompts`} icon={room.icon} right={
            <div className="row-gap">
              {msg && <span className="muted small">{msg}</span>}
              <button className="btn btn-ghost btn-sm" onClick={renameRoom}><Pencil size={13} /> Rename</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={deleteRoom}><Trash2 size={13} /> Delete room</button>
              <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save prompts</button>
            </div>}>
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
        ) : (
          <Panel><EmptyState icon="door-open" text="Add a room on the left to start writing its teaching prompts." /></Panel>
        )}
      </div>
    </div>
  );
}
