import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight, ArrowRight } from 'lucide-react';
import api from '../api';
import useLoad from '../hooks/useLoad';
import { StatTile, Panel, Ring, ProgressBar, ProgressCell, StatusPill, Avatar, JourneyStrip, EmptyState, Icon, Loading } from '../components/ui';
import { NewHireSetupModal } from '../components/modals';
import { LEVELS } from '../lib/format';

function TraineeSnapshot({ trainees }) {
  const [sid, setSid] = useState('');
  const chosen = sid || (trainees[0] && trainees[0].staff_id);
  const [detail] = useLoad(() => (chosen ? api.get(`/trainees/${chosen}`).then(r => r.data) : Promise.resolve(null)), [chosen]);
  if (!trainees.length) return <Panel title="Trainee Training Plan" icon="calendar-days"><EmptyState icon="users" text="No trainees yet." /></Panel>;
  const required = detail ? detail.competencies.filter(c => c.required) : [];
  const signed = required.filter(c => c.status === 'competent').length;
  return (
    <Panel title="Trainee Snapshot" icon="calendar-days" right={detail?.onboarding && <StatusPill status={detail.onboarding.status} />}>
      <select className="form-select mb-4" value={chosen || ''} onChange={e => setSid(Number(e.target.value))}>
        {trainees.map(t => <option key={t.staff_id} value={t.staff_id}>{t.name}</option>)}
      </select>
      {detail && (
        <>
          {detail.onboarding ? (
            <>
              <div className="row-gap mb-4"><span className="small muted">Training progress</span><span className="grow" /><span className="small strong">{detail.onboarding.progress}%</span></div>
              <ProgressBar pct={detail.onboarding.progress} />
              <div className="mt-16"><JourneyStrip current={detail.onboarding.record_status === 'completed' ? 6 : detail.onboarding.stage} compact /></div>
            </>
          ) : <div className="muted small mb-4">Not in onboarding — on a training plan.</div>}
          <div className="row-gap mt-16 mb-4"><span className="strong small">Room Competencies</span><span className="grow" /><span className="muted small">{signed}/{required.length} Signed Off</span></div>
          {required.length ? (
            <div className="skill-grid">
              {required.map(c => (
                <div key={c.id} className="skill-box">
                  <Icon name={c.skill_icon} size={22} />
                  <span>{c.skill_name}</span>
                  <StatusPill status={c.reassess_flag ? 'reassess' : c.level} label={c.reassess_flag ? 'Reassess' : LEVELS[c.level]?.label} />
                </div>
              ))}
            </div>
          ) : <div className="muted small">No required skills yet.</div>}
          <Link className="btn btn-secondary btn-sm mt-16" to={`/training-hub/trainees/${chosen}`}>Open profile</Link>
        </>
      )}
    </Panel>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const [data, reload] = useLoad(() => api.get('/overview').then(r => r.data));
  const [trainees] = useLoad(() => api.get('/trainees').then(r => r.data));
  const [showNewHire, setShowNewHire] = useState(false);

  if (!data) return <Loading />;
  const s = data.stats;

  const tickTask = async (t) => {
    if (t.kind === 'session') { await api.put(`/plans/${t.plan_id}/sessions/${t.id}`, { delivered: true }); reload(); }
    else navigate(t.link);
  };

  const quick = [
    ['user-plus', 'Add New Trainee', () => navigate('/training-hub/trainees?add=1'), true],
    ['calendar-plus', 'Create Training Plan', () => navigate('/training-hub/plans/new')],
    ['award', 'Run Competency', () => navigate('/training-hub/competencies?assess=1')],
    ['users', 'Start Shadow Period', () => navigate('/training-hub/shadow?start=1')],
    ['clipboard-check', 'New Hire Setup', () => setShowNewHire(true)],
    ['book-open', 'Training Systems', () => navigate('/training-hub/systems')],
    ['play-circle', 'Training Resources', () => navigate('/training-hub/resources')],
  ];

  return (
    <div className="stack">
      <div className="tiles" style={{ marginBottom: 0 }}>
        <StatTile icon="users" value={s.newHires} label="New Hires (Induction)" tone="cyan" />
        <StatTile icon="refresh-cw" value={s.inTraining} label="In Training" tone="cyan" />
        <StatTile icon="award" value={s.signedOff} label="Signed Off" sub="Last 90 days" tone="cyan" />
        <StatTile icon="pie-chart" value={`${s.trainingCompletionPct}%`} label="Training Completion" tone="green" />
        <StatTile icon="clipboard-list" value={s.reassessmentsDue} label="Reassessments Due" tone="amber" />
      </div>

      <div className="two-col-even">
        <Panel title="Training Progress Overview" icon="bar-chart-3" right={<button className="panel-link" onClick={() => navigate('/training-hub/competencies')}>View Report <ArrowRight size={14} /></button>}>
          <div className="row-gap" style={{ gap: 24, alignItems: 'center' }}>
            <Ring pct={s.competencyRingPct} label="Competency Completion" />
            <div className="grow" style={{ minWidth: 200 }}>
              {s.skillProgress.map(sk => (
                <div key={sk.skill_id} className="row-gap" style={{ marginBottom: 10, flexWrap: 'nowrap' }}>
                  <Icon name={sk.icon} size={16} className="muted" />
                  <span className="small" style={{ width: 120 }}>{sk.name}</span>
                  <ProgressCell pct={sk.pct} tone={sk.total && sk.competent === sk.total ? 'green' : 'cyan'} label={`${sk.competent} of ${sk.total}`} />
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={`My Active Trainees (${data.myTrainees.length})`} icon="users" right={<button className="panel-link" onClick={() => navigate('/training-hub/trainees')}>View All <ArrowRight size={14} /></button>}>
          {data.myTrainees.length === 0 ? <EmptyState icon="user-plus" text="No trainees assigned to you yet." /> : data.myTrainees.map(t => (
            <div key={t.staff_id} className="list-row clickable" onClick={() => navigate(`/training-hub/trainees/${t.staff_id}`)}>
              <Avatar name={t.name} />
              <span className="strong grow ellipsis">{t.name}</span>
              <StatusPill status={t.stage === 4 ? 'review_due' : 'in_training'} label={t.stage_name === '—' ? 'On a plan' : t.stage_name} />
              <div style={{ width: 150 }}>{t.progress != null ? <ProgressCell pct={t.progress} /> : <span className="muted small">{t.active_plans} plan{t.active_plans === 1 ? '' : 's'}</span>}</div>
              <ChevronRight size={16} className="chev" />
            </div>
          ))}
        </Panel>
      </div>

      <div className="quick-grid">
        {quick.map(([icon, label, fn, primary]) => (
          <button key={label} className={`quick-btn${primary ? ' primary' : ''}`} onClick={fn}><Icon name={icon} size={24} />{label}</button>
        ))}
      </div>

      <div className="two-col-even">
        <Panel title="Training Journey" icon="route">
          <p className="muted small mb-4">The standard pathway for all new cleaners.</p>
          <JourneyStrip current={1} />
        </Panel>
        <Panel title="My Tasks (Trainer)" icon="list-checks">
          {data.tasks.length === 0 ? <EmptyState icon="check-circle" text="Nothing due this week." /> : data.tasks.slice(0, 8).map(t => (
            <div key={`${t.kind}-${t.id}`} className="list-row">
              <input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--green)' }} onChange={() => tickTask(t)} title={t.kind === 'session' ? 'Mark delivered' : 'Open'} />
              <span className="grow ellipsis small" style={{ cursor: 'pointer' }} onClick={() => navigate(t.link)}>{t.title}</span>
              <StatusPill status={t.badge} />
            </div>
          ))}
        </Panel>
      </div>

      <div className="two-col-even">
        <TraineeSnapshot trainees={trainees || []} />
        <Panel title="Cleaning Caddy Contents" icon="shopping-basket">
          <p className="muted small mb-4">Standard setup for all new cleaners.</p>
          <div className="row-gap" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            {data.caddy.photo_url && <img src={data.caddy.photo_url} alt="Caddy" style={{ width: 160, height: 130, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--glass-border)' }} />}
            <div className="grow">
              {data.caddy.items.slice(0, 7).map(i => (
                <div key={i.id} className="row-gap small" style={{ padding: '3px 0', flexWrap: 'nowrap' }}><Icon name="check-square" size={16} style={{ color: 'var(--green)' }} />{i.text}</div>
              ))}
              {data.caddy.items.length === 0 && <div className="muted small">No items yet.</div>}
            </div>
          </div>
          <button className="panel-link mt-16" onClick={() => navigate('/training-hub/caddy')}>View full contents checklist <ArrowRight size={14} /></button>
        </Panel>
      </div>

      {showNewHire && <NewHireSetupModal onClose={() => setShowNewHire(false)} />}
    </div>
  );
}
