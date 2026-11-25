import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trash2, ExternalLink, Search } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, Panel, EmptyState, Loading, Icon, Modal, FileDrop } from '../components/ui';
import { fmtDate, fileSize } from '../lib/format';

const TYPES = { video: ['circle-play', 'Video'], guide: ['file-text', 'Guide'], image: ['image', 'Image'], template: ['download', 'Template'] };

function UploadModal({ cats, systems, onClose }) {
  const [mode, setMode] = useState('file');
  const [form, setForm] = useState({ title: '', type: 'guide', category_id: '', system_id: '', url: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('title', form.title || (file ? file.name : ''));
    fd.append('type', form.type);
    if (form.category_id) fd.append('category_id', form.category_id);
    if (form.system_id) fd.append('system_id', form.system_id);
    if (mode === 'link') fd.append('url', form.url); else if (file) fd.append('file', file);
    try { await api.post('/resources', fd); onClose(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const pickFile = (f) => {
    setFile(f);
    const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : form.type;
    setForm(x => ({ ...x, type, title: x.title || f.name.replace(/\.[^.]+$/, '') }));
  };
  return (
    <Modal title="Upload Resource" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || (mode === 'file' ? !file : !form.url.trim())} onClick={save}>{busy ? 'Uploading…' : 'Save'}</button></>}>
      <div className="seg mb-4">
        <button className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>Upload file</button>
        <button className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}>Add link</button>
      </div>
      {mode === 'file' ? (
        <div className="form-group"><FileDrop multiple={false} accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onFiles={fs => pickFile(fs[0])} />
          {file && <div className="small mt-4">{file.name} · {fileSize(file.size)}</div>}</div>
      ) : (
        <div className="form-group"><label className="form-label">Link (e.g. YouTube, Google Drive)</label><input className="form-input" value={form.url} placeholder="https://" onChange={e => setForm({ ...form, url: e.target.value })} /></div>
      )}
      <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Type</label>
          <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {Object.entries(TYPES).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div className="form-group"><label className="form-label">Category</label>
          <select className="form-select" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
      </div>
      <div className="form-group"><label className="form-label">Training system (optional)</label>
        <select className="form-select" value={form.system_id} onChange={e => setForm({ ...form, system_id: e.target.value })}>
          <option value="">—</option>{systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

export default function Resources() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || '';
  const category = params.get('category_id') || '';
  const system = params.get('system_id') || '';
  const [q, setQ] = useState('');
  const [rows] = useLoad(() => api.get('/resources', { params: { type: type || undefined, category_id: category || undefined, system_id: system || undefined } }).then(r => r.data), [type, category, system]);
  const [cats] = useLoad(() => api.get('/resources/categories').then(r => r.data));
  const [systems] = useLoad(() => api.get('/systems').then(r => r.data));
  const [upload, setUpload] = useState(false);
  const [error, setError] = useState('');
  if (!rows || !cats || !systems) return <Loading />;

  const setParam = (k, v) => { const p = Object.fromEntries(params.entries()); if (v) p[k] = v; else delete p[k]; setParams(p); };
  const shown = rows.filter(r => !q || r.title.toLowerCase().includes(q.toLowerCase()));
  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    try { await api.delete(`/resources/${r.id}`); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div>
      <PageTitle title="Resources" sub="Training videos, guides, examples, templates and SDS — shared across all training.">
        <button className="btn btn-primary" onClick={() => setUpload(true)}>+ Upload Resource</button>
      </PageTitle>
      <Panel>
        <div className="toolbar">
          <div className="filter-tabs">
            <button className={!type ? 'active' : ''} onClick={() => setParam('type', '')}>All</button>
            {Object.entries(TYPES).map(([k, [, l]]) => <button key={k} className={type === k ? 'active' : ''} onClick={() => setParam('type', k)}>{l}s</button>)}
          </div>
          <div className="row-gap">
            <div className="hub-search" style={{ width: 200 }}><Search size={14} /><input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <select className="form-select" value={category} onChange={e => setParam('category_id', e.target.value)}>
              <option value="">All categories</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="form-select" value={system} onChange={e => setParam('system_id', e.target.value)}>
              <option value="">All systems</option>{systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="form-error mb-4">{error}</div>}
        {shown.length === 0 ? <EmptyState icon="book-open" text="No resources here yet." action={<button className="btn btn-primary btn-sm" onClick={() => setUpload(true)}>Upload Resource</button>} /> : (
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {shown.map(r => (
              <div key={r.id} className="res-card">
                {r.type === 'image' && r.url && !r.is_link ? <img src={r.url} alt="" className="res-icon" style={{ objectFit: 'cover' }} /> : <div className="res-icon"><Icon name={TYPES[r.type][0]} size={20} /></div>}
                <div className="grow" style={{ minWidth: 0 }}>
                  <a className="strong small ellipsis" style={{ display: 'block' }} href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                  <div className="muted small ellipsis">{[r.category_name, r.system_name].filter(Boolean).join(' · ') || TYPES[r.type][1]}</div>
                  <div className="muted small">{r.is_link ? 'Link' : fileSize(r.size)} · {fmtDate(r.created_at)}</div>
                </div>
                <a className="icon-btn" href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>
                <button className="icon-btn danger" onClick={() => remove(r)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {upload && <UploadModal cats={cats} systems={systems} onClose={() => setUpload(false)} />}
    </div>
  );
}
