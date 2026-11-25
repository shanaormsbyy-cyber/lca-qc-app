import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import api from '../api';
import useLoad from '../hooks/useLoad';
import { Panel, StatusPill, Avatar, Loading, Icon, EmptyState } from '../components/ui';
import { AssessmentModal, CompetencyActionModal, addCompetencyToPlan } from '../components/modals';
import { fmtDate, LEVELS } from '../lib/format';

const LEVEL_ORDER = ['introduced', 'practicing', 'competent'];

function LevelLadder({ level }) {
  const reached = LEVEL_ORDER.indexOf(level);
  return (
    <div className="level-ladder">
      {LEVEL_ORDER.map((l, i) => (
        <div key={l} className={`level-step${i <= reached ? ' reached' : ''}${i === reached ? ' current' : ''}`}>
          <div className="level-dot">{i < reached || (i === reached && l === 'competent') ? <Check size={14} /> : i + 1}</div>
          <div className="small strong">{LEVELS[l].label}</div>
        </div>
      ))}
    </div>
  );
}

export default function CompetencyDetail() {
  const { id } = useParams();
  const [c] = useLoad(() => api.get(`/competencies/${id}`).then(r => r.data), [id]);
  const [assess, setAssess] = useState(false);
  const [action, setAction] = useState(null);
  const [openPhoto, setOpenPhoto] = useState(null);
  if (!c) return <Loading />;

  return (
    <div className="stack">
      <Panel>
        <div className="row-gap small">
          <Link to={`/training-hub/trainees/${c.staff_id}`} className="muted">← {c.staff_name}</Link>
          {c.onboarding_id && <><span className="muted">·</span><Link to={`/training-hub/onboarding/${c.onboarding_id}`} className="muted">Onboarding</Link></>}
        </div>
        <div className="row-gap mt-4" style={{ gap: 16 }}>
          <div className="hub-header-icon" style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', boxShadow: 'none' }}><Icon name={c.skill_icon} size={26} /></div>
          <div className="grow">
            <h1 className="page-h1">{c.skill_name}</h1>
            <div className="row-gap mt-4">
              <span className="person small"><Avatar name={c.staff_name} size={24} />{c.staff_name}</span>
              <StatusPill status={c.status} />
              <span className="pill pill-grey">{c.required ? 'Required for sign-off' : 'Optional'}</span>
              {c.in_plan ? <span className="pill pill-cyan">In training plan</span> : null}
              {c.due_date && c.status !== 'competent' && <span className={`small ${c.status === 'overdue' ? 'down' : 'muted'}`}>Due {fmtDate(c.due_date)}</span>}
            </div>
          </div>
          <div className="row-gap">
            {!c.in_plan && c.status !== 'competent' && <button className="btn btn-secondary" onClick={() => addCompetencyToPlan(c)}>+ Add to training plan</button>}
            <button className="btn btn-primary" onClick={() => setAssess(true)}>Run assessment</button>
          </div>
        </div>
        <div className="mt-16"><LevelLadder level={c.level} /></div>
        {c.reassess_flag ? <div className="notice notice-amber mt-16"><Icon name="alert-triangle" /><div><b>Flagged for reassessment.</b> {c.reassess_reason}</div></div> : null}
        {!c.required && c.unrequired_reason ? <div className="notice notice-cyan mt-16"><Icon name="info" /><div>Not required for this trainee: {c.unrequired_reason}</div></div> : null}
        <div className="row-gap mt-16">
          {c.level === 'competent' && !c.reassess_flag && <button className="btn btn-ghost btn-sm" onClick={() => setAction('reassess')}>Flag for reassessment</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setAction('due')}>Change due date</button>
          {c.required ? <button className="btn btn-ghost btn-sm" onClick={() => setAction('unrequire')}>Remove from required</button>
            : <button className="btn btn-ghost btn-sm" onClick={() => setAction('require')}>Make required</button>}
        </div>
      </Panel>

      <div className="two-col-even">
        <div className="stack">
          <Panel title="What competent looks like" icon="badge-check" right={<Link className="panel-link" to="/training-hub/competencies/skills">Edit criteria</Link>}>
            {c.criteria.length === 0 ? <EmptyState icon="badge-check" text="No criteria set for this skill yet." /> : c.criteria.map(cr => {
              const last = c.assessments[0]?.criteria?.find(x => x.text === cr.text);
              return (
                <div key={cr.id} className="list-row">
                  <span className="step-num" style={{ color: last ? (last.met ? 'var(--green)' : 'var(--amber)') : 'var(--t3)' }}>{last ? (last.met ? <Check size={12} /> : <X size={12} />) : '•'}</span>
                  <span className="grow small">{cr.text}</span>
                  {last && <span className={`small ${last.met ? 'up' : 'muted'}`}>{last.met ? 'Met last time' : 'Not yet'}</span>}
                </div>
              );
            })}
          </Panel>
          <Panel title="How it's taught" icon="lightbulb" right={<Link className="panel-link" to="/training-hub/foundations">Edit prompts</Link>}>
            {c.foundation_prompts.length === 0 && c.default_modules.length === 0 && <EmptyState icon="lightbulb" text="No teaching content for this skill yet." />}
            {c.foundation_prompts.length > 0 && <>
              <div className="strong small mb-4">Foundations prompts</div>
              {c.foundation_prompts.map((p, i) => (
                <div key={p.id} className="check-item-row" style={{ cursor: 'default' }}>
                  <span className="step-num" style={{ color: 'var(--cyan)' }}>{i + 1}</span>
                  <div className="grow"><div className="check-item-title">{p.text}</div>{p.details && <div className="check-item-details">{p.details}</div>}</div>
                </div>
              ))}
            </>}
            {c.default_modules.length > 0 && <>
              <div className="strong small mt-16 mb-4">Training plan modules</div>
              {c.default_modules.map(m => <div key={m.id} className="small" style={{ padding: '4px 0' }}><Icon name="list-checks" size={14} /> {m.title}</div>)}
            </>}
          </Panel>
        </div>

        <Panel title={`Assessment history (${c.assessments.length})`} icon="history">
          {c.assessments.length === 0 ? <EmptyState icon="history" text="Not assessed yet." action={<button className="btn btn-primary btn-sm" onClick={() => setAssess(true)}>Run assessment</button>} /> : c.assessments.map(a => (
            <div key={a.id} className="group-box" style={{ padding: 14 }}>
              <div className="row-gap">
                <StatusPill status={a.level} label={LEVELS[a.level]?.label} />
                <span className="strong small">{fmtDate(a.date)}</span>
                <span className="muted small">by {a.manager_name || '—'}</span>
                {a.is_baseline ? <span className="pill pill-grey">Already trained</span> : null}
              </div>
              {a.notes && <div className="small mt-4" style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</div>}
              {a.criteria.length > 0 && (
                <div className="mt-4">
                  {a.criteria.map(cr => (
                    <div key={cr.text} className="small" style={{ color: cr.met ? 'var(--green)' : 'var(--t3)' }}>{cr.met ? '✓' : '✗'} {cr.text}</div>
                  ))}
                </div>
              )}
              {a.photos.length > 0 && (
                <div className="thumbs">
                  {a.photos.map(ph => (ph.mime || '').startsWith('image/')
                    ? <img key={ph.id} className="thumb" src={ph.url} alt="" style={{ cursor: 'pointer' }} onClick={() => setOpenPhoto(ph.url)} />
                    : <a key={ph.id} className="thumb" href={ph.url} target="_blank" rel="noreferrer">video</a>)}
                </div>
              )}
            </div>
          ))}
        </Panel>
      </div>

      {openPhoto && <div className="modal-overlay" onClick={() => setOpenPhoto(null)}><img src={openPhoto} alt="" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 12 }} /></div>}
      {assess && <AssessmentModal competency={c} onClose={() => setAssess(false)} />}
      {action && <CompetencyActionModal competency={c} action={action} onClose={() => setAction(null)} />}
    </div>
  );
}
