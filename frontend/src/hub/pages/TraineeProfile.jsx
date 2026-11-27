import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MoreHorizontal, ChevronRight, Trash2 } from 'lucide-react';
import deleteTeamMember from '../lib/deleteMember';
import api from '../api';
import useLoad from '../hooks/useLoad';
import { Panel, ProgressBar, ProgressCell, StatusPill, Avatar, JourneyStrip, EmptyState, Loading, TypeTag } from '../components/ui';
import { AssessmentModal, AssignAssessmentModal, CompetencyActionModal, StageControl, AlreadyTrainedModal, StartShadowModal, addCompetencyToPlan } from '../components/modals';
import { fmtDate, LEVELS, PLAN_TYPES } from '../lib/format';

// Summary only — the checklist itself lives on the full onboarding page.
function Checklist({ onboardingId }) {
  const navigate = useNavigate();
  const [ob] = useLoad(() => api.get(`/onboarding/${onboardingId}`).then(r => r.data), [onboardingId]);
  if (!ob) return null;
  const total = ob.checklist.reduce((a, g) => a + g.total, 0);
  const done = ob.checklist.reduce((a, g) => a + g.done, 0);
  return (
    <Panel title="Onboarding Checklist" icon="clipboard-check">
      <div className="row-gap mb-4"><span className="strong">{done} of {total} done</span><span className="grow" /><span className="muted small">{total ? Math.round((done / total) * 100) : 0}%</span></div>
      <ProgressBar pct={total ? (done / total) * 100 : 0} tone={total && done === total ? 'green' : 'cyan'} />
      <div className="mt-16">
        {ob.checklist.map(g => (
          <div key={g.group_name} className="row-gap small" style={{ padding: '3px 0' }}>
            <span className="grow">{g.group_name}</span>
            <span className={g.total && g.done === g.total ? 'up strong' : 'muted'}>{g.done}/{g.total}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary w-full mt-16" onClick={() => navigate(`/training-hub/onboarding/${onboardingId}`)}>Open onboarding</button>
      {ob.events.length > 0 && (
        <div className="mt-16">
          <div className="strong small mb-4">Stage history</div>
          {ob.events.map(e => (
            <div key={e.id} className="small muted">{fmtDate(e.created_at)} · stage {e.from_stage} → {e.to_stage} by {e.manager_name}{e.override_reason ? ` · override: ${e.override_reason}` : ''}</div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function TraineeProfile() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const [d] = useLoad(() => api.get(`/trainees/${staffId}`).then(r => r.data), [staffId]);
  const [assess, setAssess] = useState(null);
  const [assign, setAssign] = useState(false);
  const [action, setAction] = useState(null);
  const [menu, setMenu] = useState(null);
  const [trained, setTrained] = useState(false);
  const [shadow, setShadow] = useState(false);

  if (!d) return <Loading />;
  const ob = d.onboarding;
  const comps = d.competencies.map(c => ({ ...c, staff_name: d.staff.name }));

  return (
    <div className="stack">
      <Panel>
        <div className="row-gap" style={{ gap: 16 }}>
          <Avatar name={d.staff.name} size={56} />
          <div className="grow">
            <h1 className="page-h1">{d.staff.name}</h1>
            <div className="row-gap mt-4">
              <span className="muted small">{d.staff.role}</span>
              {ob && <StatusPill status={ob.status} />}
              {ob && <span className="muted small">Trainer: {ob.trainer_name || '—'} · Started {fmtDate(ob.start_date)}</span>}
            </div>
          </div>
          {!ob && <button className="btn btn-secondary" onClick={() => setTrained(true)}>Mark as already trained</button>}
          <button className="btn btn-secondary" onClick={() => navigate(`/training-hub/plans/new?staff_id=${d.staff.id}`)}>+ Training plan</button>
          <button className="btn btn-ghost" style={{ color: 'var(--red)' }} title="Delete this team member"
            onClick={async () => { if (await deleteTeamMember(d.staff.id, d.staff.name)) navigate('/training-hub/trainees'); }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
        {ob && (
          <div className="mt-16">
            <div className="row-gap mb-4"><span className="small muted">Onboarding progress</span><span className="grow" /><span className="strong">{ob.progress}%</span></div>
            <ProgressBar pct={ob.progress} />
            <div className="mt-16"><JourneyStrip current={ob.record_status === 'completed' ? 6 : ob.stage} onSelect={n => navigate(`/training-hub/onboarding/${ob.id}?stage=${n}`)} /></div>
            <div className="mt-16"><StageControl onboarding={ob} onMoved={() => navigate(`/training-hub/onboarding/${ob.id}`)} /></div>
          </div>
        )}
      </Panel>

      <div className="two-col">
        <div className="stack">
          <Panel title="Competencies" icon="award" right={<button className="btn btn-primary btn-sm" onClick={() => setAssign(true)}>+ Add skill</button>}>
            {comps.length === 0 ? <EmptyState icon="award" text="No skills assigned yet." /> : (
              <div className="table-scroll">
                <table className="hub-table">
                  <thead><tr><th>Skill</th><th>Level</th><th>Status</th><th>Due</th><th /></tr></thead>
                  <tbody>
                    {comps.map(c => (
                      <tr key={c.id}>
                        <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/training-hub/competency/${c.id}`)} title="Open competency"><div className="strong" style={{ color: 'var(--cyan)' }}>{c.skill_name}</div><div className="muted small">{c.required ? 'Required' : c.unrequired_reason ? `Not required: ${c.unrequired_reason}` : 'Optional'}</div></td>
                        <td><StatusPill status={c.level} label={LEVELS[c.level]?.label} /></td>
                        <td><StatusPill status={c.status} /></td>
                        <td className="small">{c.due_date ? fmtDate(c.due_date) : '—'}</td>
                        <td style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setAssess(c)}>Assess</button>{' '}
                          <button className="icon-btn" onClick={() => setMenu(menu === c.id ? null : c.id)}><MoreHorizontal size={16} /></button>
                          {menu === c.id && (
                            <div className="search-drop" style={{ right: 0, left: 'auto', width: 220, top: 40 }}>
                              {c.level === 'competent' && !c.reassess_flag && <button className="search-item" onClick={() => { setAction({ c, a: 'reassess' }); setMenu(null); }}>Flag for reassessment</button>}
                              {c.in_plan ? <div className="search-item muted">In training plan ✓</div>
                                : <button className="search-item" onClick={() => { setMenu(null); addCompetencyToPlan(c); }}>Add to training plan</button>}
                              <button className="search-item" onClick={() => { setAction({ c, a: 'due' }); setMenu(null); }}>Change due date</button>
                              {c.required ? <button className="search-item" onClick={() => { setAction({ c, a: 'unrequire' }); setMenu(null); }}>Remove from required</button>
                                : <button className="search-item" onClick={() => { setAction({ c, a: 'require' }); setMenu(null); }}>Make required</button>}
                              <button className="search-item" onClick={() => { setAction({ c, a: 'remove' }); setMenu(null); }}>Remove skill</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Assessment History" icon="history">
            {d.assessments.length === 0 ? <EmptyState icon="history" text="No assessments yet." /> : d.assessments.map(a => (
              <div key={a.id} className="list-row">
                <div className="grow">
                  <div className="strong small">{a.skill_name} · <StatusPill status={a.level} label={LEVELS[a.level]?.label} /></div>
                  <div className="muted small">{fmtDate(a.date)} by {a.manager_name || '—'}{a.notes ? ` — ${a.notes}` : ''}</div>
                </div>
              </div>
            ))}
          </Panel>
        </div>

        <div className="stack">
          {ob && !ob.is_baseline && <Checklist onboardingId={ob.id} />}
          <Panel title="Training Plans" icon="calendar-days">
            {d.plans.length === 0 ? <EmptyState icon="calendar-days" text="No plans." /> : d.plans.map(p => (
              <div key={p.id} className="list-row clickable" onClick={() => navigate(`/training-hub/plans/${p.id}`)}>
                <div className="grow">
                  <div className="strong small ellipsis">{p.title}</div>
                  <div className="row-gap mt-4"><TypeTag type={p.type} types={PLAN_TYPES} /><StatusPill status={p.status} /></div>
                  <div className="mt-4"><ProgressCell pct={p.modules_total ? (p.modules_done / p.modules_total) * 100 : 0} label={`${p.modules_done}/${p.modules_total}`} /></div>
                </div>
                <ChevronRight size={16} className="chev" />
              </div>
            ))}
          </Panel>
          <Panel title="Shadow Period" icon="users" right={<button className="btn btn-secondary btn-sm" onClick={() => setShadow(true)}>Start</button>}>
            {d.shadow_periods.length === 0 ? <EmptyState icon="users" text="No shadow period yet." /> : d.shadow_periods.map(p => (
              <div key={p.id} className="list-row clickable" onClick={() => navigate(`/training-hub/shadow?period=${p.id}`)}>
                <div className="grow"><div className="small strong">Mentor: {p.mentor_name || '—'}</div><div className="mt-4"><ProgressCell pct={(p.shifts_reviewed / p.shift_count) * 100} label={`${p.shifts_reviewed}/${p.shift_count}`} /></div></div>
                <StatusPill status={p.status} />
              </div>
            ))}
          </Panel>
          {ob && ob.is_baseline ? <Panel><div className="muted small">Marked as already trained on {fmtDate(ob.signed_off_at)}.</div><Link to="/training-hub/trainees" className="panel-link mt-16">Back to trainees</Link></Panel> : null}
        </div>
      </div>

      {assess && <AssessmentModal competency={assess} onClose={() => setAssess(null)} />}
      {assign && <AssignAssessmentModal presetStaffId={d.staff.id} onClose={() => setAssign(false)} />}
      {action && <CompetencyActionModal competency={action.c} action={action.a} onClose={() => setAction(null)} />}
      {trained && <AlreadyTrainedModal presetStaffIds={[d.staff.id]} onClose={() => setTrained(false)} />}
      {shadow && <StartShadowModal presetStaffId={d.staff.id} onClose={(id) => { setShadow(false); if (id) navigate(`/training-hub/shadow?period=${id}`); }} />}
    </div>
  );
}
