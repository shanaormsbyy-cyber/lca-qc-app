import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { Panel, ProgressBar, StatusPill, Avatar, JourneyStrip, Loading, Icon, EmptyState } from '../components/ui';
import { StageControl, AssessmentModal, addCompetencyToPlan } from '../components/modals';
import { fmtDate, LEVELS, STAGES } from '../lib/format';

const GROUP_ICONS = {
  'Induction & Setup': 'handshake', 'Documents & Compliance': 'file-text', 'Uniform & PPE': 'shirt', 'Uniform & Equipment': 'shirt',
  'Cleaning Caddy': 'shopping-basket', 'Systems Access': 'laptop', 'Fundamentals': 'graduation-cap', 'First-Week Review': 'calendar-check',
};
const iconFor = (name) => GROUP_ICONS[name] || (name.startsWith('Chemicals') ? 'flask-conical' : 'list-checks');

function CheckRow({ done, title, details, date, onToggle }) {
  return (
    <label className={`check-item-row${done ? ' done' : ''}`}>
      <input type="checkbox" checked={!!done} onChange={onToggle} />
      <div className="grow">
        <div className="check-item-title">{title}</div>
        {details && <div className="check-item-details">{details}</div>}
      </div>
      {date && <span className="muted small">{fmtDate(date)}</span>}
    </label>
  );
}

// ── Stage 1: Setup & Induction checklist, one tab per section ────────────────
function SetupStage({ ob }) {
  const [tab, setTab] = useState(null);
  useEffect(() => {
    if (tab === null) {
      const first = ob.checklist.find(g => g.done < g.total) || ob.checklist[0];
      setTab(first ? first.group_name : '');
    }
  }, [ob, tab]);
  if (ob.checklist.length === 0) return <Panel><EmptyState text="No checklist items for this trainee." /></Panel>;
  const total = ob.checklist.reduce((a, g) => a + g.total, 0);
  const done = ob.checklist.reduce((a, g) => a + g.done, 0);
  const idx = Math.max(0, ob.checklist.findIndex(g => g.group_name === tab));
  const g = ob.checklist[idx];
  const complete = g.total > 0 && g.done === g.total;
  const tick = (item) => api.put(`/onboarding/${ob.id}/checklist/${item.id}`, { done: !item.done });
  const tickAll = (value) => Promise.all(g.items.filter(i => !!i.done !== value).map(i => api.put(`/onboarding/${ob.id}/checklist/${i.id}`, { done: value })));
  return (
    <>
      <div className="row-gap" style={{ justifyContent: 'space-between' }}>
        <h2 className="panel-title" style={{ fontSize: 20 }}><Icon name="clipboard-check" size={20} /> Setup &amp; Induction Checklist</h2>
        <div className="row-gap">
          <Link className="panel-link" to="/training-hub/onboarding?template=1" title="Changes apply to new hires from now on">Edit checklist template</Link>
          <span className="strong">{done} of {total} done</span>
        </div>
      </div>
      <nav className="section-tabs">
        {ob.checklist.map(s => {
          const full = s.total > 0 && s.done === s.total;
          return (
            <button key={s.group_name} className={`section-tab${s.group_name === g.group_name ? ' active' : ''}${full ? ' complete' : ''}`} onClick={() => setTab(s.group_name)}>
              {full ? <Check size={15} /> : <Icon name={iconFor(s.group_name)} size={15} />}
              <span>{s.group_name}</span><span className="section-tab-count">{s.done}/{s.total}</span>
            </button>
          );
        })}
      </nav>
      <Panel className={complete ? 'panel-done' : ''}>
        <div className="panel-head">
          <div className="panel-title" style={{ fontSize: 18 }}><Icon name={iconFor(g.group_name)} size={22} style={{ color: complete ? 'var(--green)' : 'var(--cyan)' }} />{g.group_name}</div>
          <div className="row-gap">
            <span className={`pill ${complete ? 'pill-green' : 'pill-grey'}`}>{g.done}/{g.total}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => tickAll(!complete)}>{complete ? 'Untick all' : 'Tick all'}</button>
          </div>
        </div>
        <ProgressBar pct={g.total ? (g.done / g.total) * 100 : 0} tone={complete ? 'green' : 'cyan'} />
        <div className="mt-16">
          {g.items.length === 0 ? <EmptyState text="Nothing in this section." /> : g.items.map(it => (
            <CheckRow key={it.id} done={it.done} title={it.text} details={it.details} date={it.done_at} onToggle={() => tick(it)} />
          ))}
        </div>
        <div className="row-gap mt-16" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" disabled={idx === 0} onClick={() => setTab(ob.checklist[idx - 1].group_name)}><ChevronLeft size={14} /> Previous section</button>
          {idx < ob.checklist.length - 1
            ? <button className="btn btn-primary btn-sm" onClick={() => setTab(ob.checklist[idx + 1].group_name)}>Next: {ob.checklist[idx + 1].group_name} <ChevronRight size={14} /></button>
            : <span className="muted small">Last section</span>}
        </div>
      </Panel>
    </>
  );
}

// ── Stage 2: Foundations — room-by-room teaching prompts ─────────────────────
function FoundationsStage({ ob }) {
  const navigate = useNavigate();
  const [f] = useLoad(() => api.get(`/foundations/trainee/${ob.staff_id}`).then(r => r.data), [ob.staff_id]);
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState('');
  if (!f) return <Panel><Loading /></Panel>;
  if (f.rooms.length === 0) {
    return <Panel title="Foundations Training" icon="lightbulb"><EmptyState text="No foundations prompts yet." action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/training-hub/foundations')}>Build foundations prompts</button>} /></Panel>;
  }
  const room = f.rooms.find(r => r.id === roomId) || f.rooms.find(r => !r.taught) || f.rooms[0];
  const idx = f.rooms.indexOf(room);
  const setTaught = (value) => api.put(`/foundations/trainee/${ob.staff_id}/${room.id}`, { taught: value }).catch(e => setError(errMsg(e)));
  const addToPlan = async () => {
    setError('');
    try { await api.post(`/foundations/trainee/${ob.staff_id}/${room.id}/add-to-plan`); } catch (e) { setError(errMsg(e)); }
  };
  return (
    <>
      <div className="row-gap" style={{ justifyContent: 'space-between' }}>
        <h2 className="panel-title" style={{ fontSize: 20 }}><Icon name="lightbulb" size={20} /> Foundations Training</h2>
        <span className="strong">{f.taught} of {f.total} rooms gone through</span>
      </div>
      <nav className="section-tabs">
        {f.rooms.map(r => (
          <button key={r.id} className={`section-tab${r.id === room.id ? ' active' : ''}${r.taught ? ' complete' : ''}`} onClick={() => { setError(''); setRoomId(r.id); }}>
            {r.taught ? <Check size={15} /> : <Icon name={r.icon} size={15} />}<span>{r.name}</span>
            {r.in_plan && !r.taught && <span className="section-tab-count">in plan</span>}
          </button>
        ))}
      </nav>
      <Panel className={room.taught ? 'panel-done' : ''}>
        <div className="panel-head">
          <div className="panel-title" style={{ fontSize: 18 }}><Icon name={room.icon} size={22} style={{ color: room.taught ? 'var(--green)' : 'var(--cyan)' }} />{room.name}</div>
          <div className="row-gap">
            {room.taught ? <StatusPill status="completed" label={`Gone through ${fmtDate(room.taught_at)}`} />
              : room.in_plan ? <span className="pill pill-cyan">In training plan</span>
              : <button className="btn btn-secondary btn-sm" onClick={addToPlan}>+ Add to training plan</button>}
            <button className={`btn btn-sm ${room.taught ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setTaught(!room.taught)}>{room.taught ? 'Undo' : 'Mark as gone through'}</button>
          </div>
        </div>
        <p className="muted small mb-4">Walk {ob.staff_name} through each point:</p>
        {room.prompts.map((p, i) => (
          <div key={p.id} className="check-item-row" style={{ cursor: 'default' }}>
            <span className="step-num" style={{ color: 'var(--cyan)' }}>{i + 1}</span>
            <div className="grow"><div className="check-item-title">{p.text}</div>{p.details && <div className="check-item-details">{p.details}</div>}</div>
          </div>
        ))}
        {error && <div className="form-error">{error}{!f.plan_id && <> — <button className="panel-link" style={{ display: 'inline' }} onClick={() => navigate(`/training-hub/plans/new?staff_id=${ob.staff_id}`)}>build a plan</button></>}</div>}
        <div className="row-gap mt-16" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" disabled={idx === 0} onClick={() => setRoomId(f.rooms[idx - 1].id)}><ChevronLeft size={14} /> Previous room</button>
          {idx < f.rooms.length - 1
            ? <button className="btn btn-primary btn-sm" onClick={() => setRoomId(f.rooms[idx + 1].id)}>Next: {f.rooms[idx + 1].name} <ChevronRight size={14} /></button>
            : <button className="panel-link" onClick={() => navigate('/training-hub/foundations')}>Edit prompts</button>}
        </div>
      </Panel>
    </>
  );
}

// ── Stage 3: Room competencies ───────────────────────────────────────────────
function CompetenciesStage({ ob }) {
  const navigate = useNavigate();
  const [comps] = useLoad(() => api.get('/competencies', { params: { staff_id: ob.staff_id } }).then(r => r.data), [ob.staff_id]);
  const [assess, setAssess] = useState(null);
  if (!comps) return <Panel><Loading /></Panel>;
  const required = comps.filter(c => c.required);
  const other = comps.filter(c => !c.required);
  const competent = required.filter(c => c.status === 'competent').length;
  const row = (c) => (
    <div key={c.id} className="list-row">
      <Icon name={c.skill_icon} size={20} style={{ color: c.status === 'competent' ? 'var(--green)' : 'var(--cyan)' }} />
      <div className="grow" style={{ cursor: 'pointer' }} onClick={() => navigate(`/training-hub/competency/${c.id}`)} title="Open competency">
        <div className="strong" style={{ color: 'var(--cyan)' }}>{c.skill_name}</div>{c.due_date && c.status !== 'competent' && <div className="muted small">Due {fmtDate(c.due_date)}</div>}
      </div>
      <StatusPill status={c.level} label={LEVELS[c.level]?.label} />
      {c.status !== 'competent' && c.status !== 'in_progress' && <StatusPill status={c.status} />}
      {c.status !== 'competent' && (c.in_plan
        ? <span className="pill pill-cyan">In plan</span>
        : <button className="btn btn-ghost btn-sm" onClick={() => addCompetencyToPlan(c)}>+ Add to training plan</button>)}
      <button className="btn btn-secondary btn-sm" onClick={() => setAssess(c)}>Assess</button>
    </div>
  );
  return (
    <Panel title="Room Competencies" icon="award" right={<button className="btn btn-ghost btn-sm" onClick={() => navigate(`/training-hub/trainees/${ob.staff_id}`)}>Add or change skills</button>}>
      <div className="row-gap mb-4"><span className="small muted">Required skills signed off</span><span className="grow" /><span className="strong">{competent} of {required.length}</span></div>
      <ProgressBar pct={required.length ? (competent / required.length) * 100 : 0} tone={required.length && competent === required.length ? 'green' : 'cyan'} />
      <div className="mt-16">{required.length === 0 ? <EmptyState text="No required skills." /> : required.map(row)}</div>
      {other.length > 0 && <><div className="strong small mt-16 mb-4">Other skills</div>{other.map(row)}</>}
      {assess && <AssessmentModal competency={{ ...assess, staff_name: ob.staff_name }} onClose={() => setAssess(null)} />}
    </Panel>
  );
}

// ── Stage 4: Shadow period ───────────────────────────────────────────────────
function ShadowStage({ ob }) {
  const navigate = useNavigate();
  const [p] = useLoad(() => (ob.shadow_period_id ? api.get(`/shadow/${ob.shadow_period_id}`).then(r => r.data) : Promise.resolve(null)), [ob.shadow_period_id]);
  const [error, setError] = useState('');
  const start = async () => { try { await api.post('/shadow', { staff_id: ob.staff_id }); } catch (e) { setError(errMsg(e)); } };
  if (!ob.shadow_period_id) {
    return (
      <Panel title="Shadow Period" icon="users">
        <EmptyState icon="users" text="No shadow period started yet. Starting one creates the supervised shifts with you as mentor." action={<button className="btn btn-primary btn-sm" onClick={start}>Start shadow period</button>} />
        {error && <div className="form-error">{error}</div>}
      </Panel>
    );
  }
  if (!p) return <Panel><Loading /></Panel>;
  return (
    <Panel title="Shadow Period" icon="users" right={<div className="row-gap"><StatusPill status={p.status} /><button className="btn btn-primary btn-sm" onClick={() => navigate(`/training-hub/shadow?period=${p.id}`)}>Review shifts</button></div>}>
      <div className="row-gap mb-4"><span className="small muted">Mentor: {p.mentor_name || '—'}</span><span className="grow" /><span className="strong">{p.shifts_reviewed} of {p.shift_count} reviewed</span></div>
      <ProgressBar pct={(p.shifts_reviewed / p.shift_count) * 100} tone={p.shifts_reviewed >= p.shift_count ? 'green' : 'cyan'} />
      <div className="mt-16">
        {p.shifts.map(s => (
          <div key={s.id} className="list-row clickable" onClick={() => navigate(`/training-hub/shadow?period=${p.id}&shift=${s.id}`)}>
            <span className="step-num" style={{ color: s.reviewed ? 'var(--green)' : 'var(--cyan)' }}>{s.reviewed ? <Check size={12} /> : s.shift_number}</span>
            <div className="grow"><div className="strong small">Shadow shift {s.shift_number}</div><div className="muted small">{s.date ? fmtDate(s.date) : 'Not scheduled'}{s.property_name ? ` · ${s.property_name}` : ''}</div></div>
            <StatusPill status={s.reviewed ? 'completed' : (s.date ? 'review_due' : 'not_started')} label={s.reviewed ? 'Reviewed' : s.date ? 'Review due' : 'Not scheduled'} />
            <ChevronRight size={16} className="chev" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Stage 5: Final assessment & sign off ────────────────────────────────────
function FinalStage({ ob, onMoved }) {
  const [comps] = useLoad(() => api.get('/competencies', { params: { staff_id: ob.staff_id } }).then(r => r.data), [ob.staff_id]);
  const [fnd] = useLoad(() => api.get(`/foundations/trainee/${ob.staff_id}`).then(r => r.data), [ob.staff_id]);
  const [sp] = useLoad(() => (ob.shadow_period_id ? api.get(`/shadow/${ob.shadow_period_id}`).then(r => r.data) : Promise.resolve(null)), [ob.shadow_period_id]);
  const total = ob.checklist.reduce((a, g) => a + g.total, 0);
  const done = ob.checklist.reduce((a, g) => a + g.done, 0);
  const required = (comps || []).filter(c => c.required);
  const competent = required.filter(c => c.status === 'competent').length;
  const checks = [
    ['Setup & induction checklist', `${done} of ${total} done`, total > 0 && done === total],
    ['Foundations training', fnd ? `${fnd.taught} of ${fnd.total} rooms gone through` : '…', !!fnd && fnd.total > 0 && fnd.taught === fnd.total],
    ['Required room competencies', `${competent} of ${required.length} competent`, required.length > 0 && competent === required.length],
    ['Shadow period', sp ? (sp.status === 'signed_off' ? 'Signed off' : `${sp.shifts_reviewed} of ${sp.shift_count} reviewed`) : 'Not started', !!sp && sp.status === 'signed_off'],
  ];
  return (
    <Panel title="Final Assessment & Sign Off" icon="award">
      <p className="muted small mb-4">Everything below should be complete before signing {ob.staff_name} off as fully trained.</p>
      {checks.map(([label, detail, ok]) => (
        <div key={label} className="list-row">
          <span className="step-num" style={{ color: ok ? 'var(--green)' : 'var(--amber)' }}>{ok ? <Check size={12} /> : <X size={12} />}</span>
          <span className="grow strong small">{label}</span>
          <span className={ok ? 'up small' : 'muted small'}>{detail}</span>
        </div>
      ))}
      <div className="mt-16">
        {ob.stage === 5 || ob.record_status === 'completed' ? <StageControl onboarding={ob} onMoved={onMoved} />
          : <div className="muted small">Move the trainee to Final Assessment &amp; Sign Off to sign them off.</div>}
      </div>
    </Panel>
  );
}

export default function OnboardingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ob] = useLoad(() => api.get(`/onboarding/${id}`).then(r => r.data), [id]);
  const [view, setView] = useState(null);
  const [params] = useSearchParams();
  useEffect(() => {
    if (ob && view === null) {
      const asked = Number(params.get('stage'));
      setView(asked >= 1 && asked <= 5 ? asked : (ob.record_status === 'completed' ? 5 : ob.stage));
    }
  }, [ob, view, params]);
  if (!ob || view === null) return <Loading />;

  const views = { 1: SetupStage, 2: FoundationsStage, 3: CompetenciesStage, 4: ShadowStage, 5: FinalStage };
  const View = views[view];

  return (
    <div className="stack">
      <Panel>
        <Link to="/training-hub/onboarding" className="muted small">← Onboarding</Link>
        <div className="row-gap mt-4" style={{ gap: 16 }}>
          <Avatar name={ob.staff_name} size={56} />
          <div className="grow">
            <h1 className="page-h1">{ob.staff_name}</h1>
            <div className="row-gap mt-4">
              <StatusPill status={ob.status} />
              <span className="muted small">Started {fmtDate(ob.start_date)} · Trainer: {ob.trainer_name || '—'} · Currently at: <b>{STAGES[ob.stage - 1]}</b></span>
            </div>
          </div>
          <div className="row-gap">
            {ob.plan_id && <button className="btn btn-secondary" onClick={() => navigate(`/training-hub/plans/${ob.plan_id}`)}>Training plan</button>}
            <button className="btn btn-ghost" onClick={() => navigate(`/training-hub/trainees/${ob.staff_id}`)}>Trainee profile</button>
          </div>
        </div>
        <div className="row-gap mt-16"><span className="small muted">Onboarding progress</span><span className="grow" /><span className="strong">{ob.progress}%</span></div>
        <div className="mt-4"><ProgressBar pct={ob.progress} /></div>
        <div className="mt-16"><JourneyStrip current={ob.record_status === 'completed' ? 6 : ob.stage} onSelect={setView} selected={view} /></div>
        <div className="muted small" style={{ textAlign: 'center' }}>Click a stage to open it</div>
        <div className="mt-16"><StageControl onboarding={ob} onMoved={setView} /></div>
      </Panel>
      <View ob={ob} onMoved={setView} />
    </div>
  );
}
