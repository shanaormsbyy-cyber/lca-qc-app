import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { Panel, ProgressBar, StatusPill, TypeTag, EmptyState, Loading, Icon, Modal } from '../components/ui';
import { fmtDate, fmtShort, fmtTime, PLAN_TYPES } from '../lib/format';

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p] = useLoad(() => api.get(`/plans/${id}`).then(r => r.data), [id]);
  const [tmpl, setTmpl] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [msg, setMsg] = useState('');
  if (!p) return <Loading />;

  const act = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await api.post(`/plans/${id}/${path}`); } catch (e) { setMsg(errMsg(e)); }
  };
  const remove = async () => {
    if (!window.confirm('Delete this plan? This cannot be undone.')) return;
    await api.delete(`/plans/${id}`); navigate('/training-hub/plans');
  };
  const saveTemplate = async () => {
    await api.post(`/plans/${id}/save-as-template`, { title: tmplName || p.title });
    setTmpl(false); setMsg('Saved as a template — use it from “Create from Template”.');
  };

  return (
    <div className="stack">
      <Panel>
        <div className="row-gap" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <Link to="/training-hub/plans" className="muted small">← Training Plans</Link>
            <h1 className="page-h1 mt-4">{p.title}</h1>
            {p.description && <p className="page-sub">{p.description}</p>}
            <div className="row-gap mt-4">
              <TypeTag type={p.type} types={PLAN_TYPES} /><StatusPill status={p.status} />
              {p.staff_name && <Link to={`/training-hub/trainees/${p.staff_id}`} className="pill pill-grey">{p.staff_name}</Link>}
              <span className="muted small">Trainer: {p.trainer_name || '—'} · {p.start_date ? fmtDate(p.start_date) : '—'} → {p.end_date ? fmtDate(p.end_date) : '—'}</span>
            </div>
          </div>
          <div className="row-gap">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/training-hub/plans/${id}/edit`)}>Edit</button>
            {p.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => act('publish')}>Publish</button>}
            {p.status === 'active' && <button className="btn btn-primary btn-sm" onClick={() => act('complete', 'Mark this plan as completed?')}>Complete</button>}
            {p.status !== 'archived' && <button className="btn btn-ghost btn-sm" onClick={() => act('archive', 'Archive this plan?')}>Archive</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setTmplName(p.title); setTmpl(true); }}>Save as template</button>
            <button className="btn btn-danger btn-sm" onClick={remove}>Delete</button>
          </div>
        </div>
        <div className="row-gap mt-16"><span className="small muted">Progress</span><span className="grow" /><span className="strong small">{p.modules_done} of {p.modules_total} modules · {p.progress}%</span></div>
        <div className="mt-4"><ProgressBar pct={p.progress} /></div>
        {p.competency_changed && p.status !== 'completed' && (
          <div className="notice notice-amber mt-16"><Icon name="alert-triangle" />
            <div className="grow">Competencies changed since this plan was built — review the plan.</div>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/training-hub/plans/${id}/edit`)}>Review plan</button>
          </div>
        )}
        {msg && <div className="notice notice-cyan mt-16"><Icon name="info" /><div>{msg}</div></div>}
      </Panel>

      <div className="two-col">
        <Panel title="Modules" icon="list-checks">
          {p.modules.length === 0 ? <EmptyState text="No modules yet." action={<button className="btn btn-primary btn-sm" onClick={() => navigate(`/training-hub/plans/${id}/edit`)}>Add modules</button>} /> : p.modules.map(m => (
            <label key={m.id} className={`check-row${m.completed ? ' done' : ''}`} style={{ borderBottom: '1px solid var(--glass-border)', padding: '10px 0' }}>
              <input type="checkbox" checked={!!m.completed} onChange={() => api.put(`/plans/${id}/modules/${m.id}`, { completed: !m.completed })} />
              <span className="grow">{m.title}{m.notes ? <span className="muted small" style={{ display: 'block', textDecoration: 'none' }}>{m.notes}</span> : null}</span>
              {m.completed_at && <span className="muted small">{fmtDate(m.completed_at)}</span>}
            </label>
          ))}
        </Panel>
        <Panel title="Sessions" icon="calendar-days">
          {p.sessions.length === 0 ? <EmptyState icon="calendar-days" text="No sessions scheduled." /> : p.sessions.map(s => (
            <div key={s.id} className="session-row" style={{ borderLeftColor: s.delivered ? 'var(--green)' : 'var(--cyan)' }}>
              <div className="day-chip">{fmtShort(s.date).split(' ')[0]}<b>{fmtShort(s.date).split(' ').slice(1).join(' ')}</b></div>
              <div className="grow"><div className="small strong">{fmtTime(s.time) || 'Any time'} · {s.trainer_name || p.trainer_name || '—'}</div>{s.notes && <div className="muted small">{s.notes}</div>}</div>
              <label className="check-row" style={{ padding: 0 }}><input type="checkbox" checked={!!s.delivered} onChange={() => api.put(`/plans/${id}/sessions/${s.id}`, { delivered: !s.delivered })} /><span className="small">Delivered</span></label>
            </div>
          ))}
        </Panel>
      </div>

      {tmpl && (
        <Modal title="Save as template" onClose={() => setTmpl(false)} footer={<><button className="btn btn-ghost" onClick={() => setTmpl(false)}>Cancel</button><button className="btn btn-primary" onClick={saveTemplate}>Save template</button></>}>
          <div className="form-group"><label className="form-label">Template name</label><input className="form-input" value={tmplName} onChange={e => setTmplName(e.target.value)} /></div>
          <p className="muted small">Copies the modules only — no trainee, dates or ticks.</p>
        </Modal>
      )}
    </div>
  );
}
