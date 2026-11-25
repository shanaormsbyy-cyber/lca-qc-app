import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import useLoad from '../hooks/useLoad';
import { Panel, EmptyState, Loading, Icon } from '../components/ui';
import { SystemEditModal } from './Systems';
import { fmtDate } from '../lib/format';

export default function SystemDetail() {
  const { id } = useParams();
  const [s] = useLoad(() => api.get(`/systems/${id}`).then(r => r.data), [id]);
  const [edit, setEdit] = useState(false);
  if (!s) return <Loading />;
  return (
    <div className="stack">
      <Panel>
        <Link to="/training-hub/systems" className="muted small">← Training Systems</Link>
        <div className="row-gap mt-4" style={{ gap: 16 }}>
          <div className="hub-header-icon" style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', boxShadow: 'none' }}><Icon name={s.icon} size={26} /></div>
          <div className="grow">
            <h1 className="page-h1">{s.name}</h1>
            <div className="row-gap mt-4">
              {s.category_name && <span className="pill pill-cyan">{s.category_name}</span>}
              <span className="muted small">{s.uses} uses · updated {fmtDate(s.updated_at)}</span>
            </div>
            {s.description && <p className="page-sub">{s.description}</p>}
          </div>
          <button className="btn btn-secondary" onClick={() => setEdit(true)}>Edit</button>
        </div>
      </Panel>
      <div className="two-col">
        <Panel title="Explanation" icon="book-open">
          {s.modules.length === 0 ? <EmptyState icon="book-open" text="No explanation yet — click Edit to add blurbs about this system." /> : s.modules.map(m => (
            <div key={m.id} className="check-item-row" style={{ cursor: 'default', display: 'block' }}>
              {m.title && <div className="check-item-title">{m.title}</div>}
              {m.content && <div className="check-item-details" style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{m.content}</div>}
            </div>
          ))}
        </Panel>
        <Panel title="Linked Resources" icon="book-open" right={<Link className="panel-link" to={`/training-hub/resources?system_id=${s.id}`}>Manage</Link>}>
          {s.resources.length === 0 ? <EmptyState icon="book-open" text="No resources linked. Upload one in Resources and pick this system." /> : s.resources.map(r => (
            <a key={r.id} className="list-row" href={r.url} target="_blank" rel="noreferrer"><Icon name={r.type === 'video' ? 'circle-play' : r.type === 'image' ? 'image' : 'file-text'} size={18} style={{ color: 'var(--cyan)' }} /><span className="grow small strong">{r.title}</span></a>
          ))}
        </Panel>
      </div>
      {edit && <SystemEditModal system={s} onClose={() => setEdit(false)} />}
    </div>
  );
}
