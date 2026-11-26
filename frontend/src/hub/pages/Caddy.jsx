import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import api, { errMsg } from '../api';
import { PageTitle, Panel, Loading, Icon, FileDrop } from '../components/ui';

// The caddy list is split into three groups, saved in this order.
const GROUPS = [
  { key: 'chemicals', label: 'Chemicals', placeholder: 'e.g. Halo Glass Cleaner' },
  { key: 'tools', label: 'Tools', placeholder: 'e.g. Microfibre cloths' },
  { key: 'equipment', label: 'Equipment', placeholder: 'e.g. Vacuum' },
];
const emptyGroups = () => Object.fromEntries(GROUPS.map(g => [g.key, []]));

export default function Caddy() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState(emptyGroups());
  const [msg, setMsg] = useState('');
  const load = () => api.get('/caddy').then(r => {
    setData(r.data);
    const g = emptyGroups();
    r.data.items.forEach(i => (g[i.category] || g.chemicals).push(i.text));
    setGroups(g);
  });
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;

  const setList = (key, list) => setGroups(g => ({ ...g, [key]: list }));
  const move = (key, i, d) => { const a = [...groups[key]]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setList(key, a); };
  const save = async () => {
    const items = GROUPS.flatMap(g => groups[g.key].map(text => ({ text, category: g.key })));
    try { await api.put('/caddy', { items }); setMsg('Saved.'); load(); } catch (e) { setMsg(errMsg(e)); }
  };
  const upload = async (files) => {
    const fd = new FormData(); fd.append('photo', files[0]);
    try { await api.post('/caddy/photo', fd); load(); } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <div>
      <PageTitle title="Cleaning Caddy Contents" sub="Standard setup for all new cleaners.">
        <button className="btn btn-ghost" onClick={() => navigate('/training-hub/overview')}>← Overview</button>
      </PageTitle>
      <div className="two-col-even">
        <Panel title="Contents checklist" icon="shopping-basket">
          {GROUPS.map((g, gi) => {
            const list = groups[g.key];
            return (
              <div key={g.key} style={{ marginTop: gi === 0 ? 0 : 22 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--glass-border)' }}>
                  <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cyan)' }}>{g.label}</span>
                  <span className="muted small">{list.length}</span>
                </div>
                {list.length === 0 && <div className="muted small" style={{ marginBottom: 6 }}>No {g.label.toLowerCase()} yet.</div>}
                {list.map((t, i) => (
                  <div key={i} className="editor-row">
                    <Icon name="square-check" size={18} style={{ color: 'var(--green)', marginTop: 10 }} />
                    <input className="form-input" value={t} placeholder={g.placeholder} onChange={e => setList(g.key, list.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button className="icon-btn" onClick={() => move(g.key, i, -1)}><ArrowUp size={14} /></button>
                    <button className="icon-btn" onClick={() => move(g.key, i, 1)}><ArrowDown size={14} /></button>
                    <button className="icon-btn danger" onClick={() => setList(g.key, list.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setList(g.key, [...list, ''])}><Plus size={14} /> Add {g.label.toLowerCase().replace(/s$/, '')}</button>
              </div>
            );
          })}
          <div className="row-gap mt-16">
            <span className="grow" />
            {msg && <span className="muted small">{msg}</span>}
            <button className="btn btn-primary btn-sm" onClick={save}>Save list</button>
          </div>
        </Panel>
        <Panel title="Caddy photo" icon="image">
          {data.photo_url ? <img src={data.photo_url} alt="Caddy" style={{ width: '100%', maxHeight: 340, objectFit: 'cover', borderRadius: 12, marginBottom: 12 }} /> : <p className="muted small mb-4">No photo yet.</p>}
          <FileDrop multiple={false} accept="image/*" onFiles={upload} label={data.photo_url ? 'Replace photo' : 'Upload a photo of a correctly packed caddy'} />
        </Panel>
      </div>
    </div>
  );
}
