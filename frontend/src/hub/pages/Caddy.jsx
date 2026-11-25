import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import api, { errMsg } from '../api';
import { PageTitle, Panel, Loading, Icon, FileDrop } from '../components/ui';

export default function Caddy() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState('');
  const load = () => api.get('/caddy').then(r => { setData(r.data); setItems(r.data.items.map(i => i.text)); });
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;

  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setItems(a); };
  const save = async () => { try { await api.put('/caddy', { items }); setMsg('Saved.'); load(); } catch (e) { setMsg(errMsg(e)); } };
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
          {items.map((t, i) => (
            <div key={i} className="editor-row">
              <Icon name="square-check" size={18} style={{ color: 'var(--green)', marginTop: 10 }} />
              <input className="form-input" value={t} onChange={e => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />
              <button className="icon-btn" onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
              <button className="icon-btn" onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
              <button className="icon-btn danger" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="row-gap mt-16">
            <button className="btn btn-ghost btn-sm" onClick={() => setItems([...items, ''])}><Plus size={14} /> Add item</button>
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
