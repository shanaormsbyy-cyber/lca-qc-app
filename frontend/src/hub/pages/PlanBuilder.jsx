import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUp, ArrowDown, Trash2, Plus, Check } from 'lucide-react';
import api, { errMsg } from '../api';
import { useAuth } from '../../context/AuthContext';
import { PageTitle, Panel, StatusPill, ProgressCell, EmptyState, Loading, Icon } from '../components/ui';
import { PLAN_TYPES, LEVELS, todayStr, addDays } from '../lib/format';

const STEPS = ['Select Trainee', 'Choose Training Areas', 'Set Timeframe', 'Publish'];

export default function PlanBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const editing = !!id;
  // Title fills itself from trainee + plan type until the trainer types their own.
  const [titleTouched, setTitleTouched] = useState(editing);
  const [step, setStep] = useState(editing ? 2 : 1);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [managers, setManagers] = useState([]);
  const [skills, setSkills] = useState([]);
  const [systems, setSystems] = useState([]);
  const [sugg, setSugg] = useState(null);
  const [status, setStatus] = useState('draft');
  const [plan, setPlan] = useState({
    staff_id: params.get('staff_id') ? Number(params.get('staff_id')) : '', title: '', description: '', type: 'development',
    trainer_id: manager?.id || '', start_date: todayStr(), end_date: addDays(todayStr(), 28), modules: [], sessions: [],
  });
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setPlan(p => ({ ...p, ...patch }));

  useEffect(() => {
    (async () => {
      const [s, m, k, sy] = await Promise.all([api.get('/people/staff'), api.get('/people/managers'), api.get('/skills?include_archived=1'), api.get('/systems?include_archived=1')]);
      setStaff(s.data); setManagers(m.data); setSkills(k.data); setSystems(sy.data);
      const src = id || params.get('template');
      if (src) {
        const p = (await api.get(`/plans/${src}`)).data;
        setStatus(id ? p.status : 'draft');
        setPlan(prev => ({
          ...prev,
          staff_id: id ? (p.staff_id || '') : prev.staff_id,
          title: id ? p.title : (p.is_template ? '' : p.title),
          description: p.description || '', type: p.type,
          trainer_id: id ? (p.trainer_id || manager?.id || '') : prev.trainer_id,
          start_date: id ? (p.start_date || prev.start_date) : prev.start_date,
          end_date: id ? (p.end_date || prev.end_date) : prev.end_date,
          modules: p.modules.map(x => ({ id: id ? x.id : undefined, title: x.title, notes: x.notes || '', skill_id: x.skill_id, system_id: x.system_id, completed: id ? x.completed : 0 })),
          sessions: id ? p.sessions.map(x => ({ id: x.id, date: x.date, time: x.time || '', trainer_id: x.trainer_id || '', notes: x.notes || '', module_ids: JSON.parse(x.module_ids || '[]') })) : [],
        }));
      }
      setLoading(false);
    })().catch(e => { setError(errMsg(e)); setLoading(false); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan.staff_id) { setSugg(null); return; }
    api.get('/plans/suggestions', { params: { staff_id: plan.staff_id } }).then(r => setSugg(r.data)).catch(() => setSugg(null));
  }, [plan.staff_id]);

  useEffect(() => {
    if (titleTouched) return;
    const name = staff.find(s => s.id === Number(plan.staff_id))?.name;
    const auto = name ? `${PLAN_TYPES[plan.type].label} — ${name}` : '';
    setPlan(p => (p.title === auto ? p : { ...p, title: auto }));
  }, [plan.staff_id, plan.type, staff, titleTouched]);

  if (loading) return <Loading />;

  const staffName = staff.find(s => s.id === Number(plan.staff_id))?.name;
  const has = (title) => plan.modules.some(m => m.title === title);
  // Functional update: several adds in one click (Add all / Add N) must each see the latest list.
  const addModule = (m) => setPlan(p => (p.modules.some(x => x.title === m.title) ? p : {
    ...p, modules: [...p.modules, { title: m.title, notes: m.notes || '', skill_id: m.skill_id || null, system_id: m.system_id || null, completed: 0 }],
  }));
  const moveModule = (i, d) => { const a = [...plan.modules]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ modules: a }); };
  const setModule = (i, patch) => set({ modules: plan.modules.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setSession = (i, patch) => set({ sessions: plan.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const save = async (publish) => {
    setBusy(true); setError('');
    const title = plan.title.trim() || `${PLAN_TYPES[plan.type].label} — ${staffName || 'Trainee'}`;
    const body = { ...plan, title, staff_id: plan.staff_id ? Number(plan.staff_id) : null, trainer_id: plan.trainer_id ? Number(plan.trainer_id) : null,
      sessions: plan.sessions.filter(s => s.date).map(s => ({ ...s, trainer_id: s.trainer_id ? Number(s.trainer_id) : null })) };
    try {
      let pid = id;
      if (editing) await api.put(`/plans/${id}`, body);
      else pid = (await api.post('/plans', { ...body, status: 'draft' })).data.id;
      if (publish && status === 'draft') await api.post(`/plans/${pid}/publish`);
      navigate(`/training-hub/plans/${pid}`);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const canNext = step !== 1 || plan.staff_id;

  return (
    <div>
      <PageTitle title={editing ? 'Edit Training Plan' : 'Build Training Plan'} sub={staffName ? `For ${staffName}` : 'Create a customised training plan for your trainee.'}>
        <button className="btn btn-ghost" onClick={() => navigate(editing ? `/plans/${id}` : '/plans')}>Cancel</button>
      </PageTitle>
      <div className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={`step${step === i + 1 ? ' active' : step > i + 1 ? ' done' : ''}`} onClick={() => (i + 1 < step || canNext) && setStep(i + 1)}>
            <span className="step-num">{step > i + 1 ? <Check size={12} /> : i + 1}</span>{s}
          </button>
        ))}
      </div>

      {step === 1 && (
        <Panel title="Select Trainee" icon="user">
          <div className="form-row">
            <div className="form-group"><label className="form-label">Trainee</label>
              <select className="form-select" value={plan.staff_id} onChange={e => set({ staff_id: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Choose…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Plan type</label>
              <select className="form-select" value={plan.type} onChange={e => set({ type: e.target.value })}>
                {Object.entries(PLAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
          </div>
          {sugg && (
            <div className="row-gap">
              {sugg.competencies.length === 0 ? <span className="muted small">No competencies recorded yet for this trainee.</span>
                : <span className="small muted">{sugg.competencies.filter(c => c.status === 'competent').length} of {sugg.competencies.length} skills competent · {sugg.suggestions.length} suggested modules</span>}
            </div>
          )}
        </Panel>
      )}

      {step === 2 && (
        <div className="two-col-even">
          <div className="stack">
          <Panel title="Competency Picture" icon="award">
            {!plan.staff_id ? <EmptyState text="Choose a trainee first." /> : !sugg || sugg.competencies.length === 0 ? <EmptyState icon="award" text="No assessments yet — add modules manually or from skills." /> : sugg.competencies.map(c => (
              <div key={c.skill_id} className="list-row">
                <div className="grow">
                  <div className="row-gap"><span className="strong small">{c.skill_name}</span><StatusPill status={c.status === 'competent' ? 'competent' : c.level} label={c.status === 'reassess' ? 'Reassess' : c.status === 'overdue' ? 'Overdue' : LEVELS[c.level]?.label} /></div>
                  {c.last_notes && <div className="muted small ellipsis">“{c.last_notes}”</div>}
                </div>
              </div>
            ))}
          </Panel>
            <Panel title="Suggested Modules" icon="sparkles" right={sugg && sugg.suggestions.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => sugg.suggestions.forEach(addModule)}>Add all</button>}>
              <p className="muted small mb-4">Weakest skills first, based on the latest assessments.</p>
              {!sugg || sugg.suggestions.length === 0 ? <EmptyState icon="check-circle" text="No gaps to suggest for — all assessed skills are competent." /> : (() => {
                const groups = [];
                for (const m of sugg.suggestions) {
                  let g = groups.find(x => x.skill_id === m.skill_id);
                  if (!g) { g = { skill_id: m.skill_id, skill_name: m.skill_name, progress: m.progress, status: m.status, mods: [] }; groups.push(g); }
                  g.mods.push(m);
                }
                return groups.map(g => {
                  const missing = g.mods.filter(m => !has(m.title));
                  return (
                    <div key={g.skill_id} className="list-row" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="row-gap"><span className="strong small">{g.skill_name}</span>{g.status === 'overdue' && <StatusPill status="overdue" />}{g.status === 'reassess' && <StatusPill status="reassess" />}</div>
                        {g.mods.map(m => (
                          <div key={m.title} className="row-gap small" style={{ padding: '2px 0', flexWrap: 'nowrap' }}>
                            <span className="grow muted ellipsis">{m.title}</span>
                            {has(m.title) ? <Icon name="check" size={14} style={{ color: 'var(--green)' }} /> : <button className="panel-link" onClick={() => addModule(m)}>+ Add</button>}
                          </div>
                        ))}
                      </div>
                      <button className="btn btn-ghost btn-sm" disabled={!missing.length} onClick={() => missing.forEach(addModule)}>{missing.length ? `Add ${missing.length}` : 'Added'}</button>
                    </div>
                  );
                });
              })()}
            </Panel>
          </div>
          <div className="stack">
            <Panel title={`Plan Modules (${plan.modules.length})`} icon="list-checks">
              {plan.modules.map((m, i) => (
                <div key={i} className="editor-row">
                  <div className="grow">
                    <input className="form-input" value={m.title} onChange={e => setModule(i, { title: e.target.value })} />
                    <div className="row-gap mt-4">
                      {m.skill_id && <span className="pill pill-grey">{skills.find(s => s.id === m.skill_id)?.name || 'Skill'}</span>}
                      {m.system_id && <span className="pill pill-cyan">{systems.find(s => s.id === m.system_id)?.name || 'System'}</span>}
                      {m.completed ? <StatusPill status="completed" /> : null}
                    </div>
                  </div>
                  <button className="icon-btn" onClick={() => moveModule(i, -1)}><ArrowUp size={14} /></button>
                  <button className="icon-btn" onClick={() => moveModule(i, 1)}><ArrowDown size={14} /></button>
                  <button className="icon-btn danger" onClick={() => set({ modules: plan.modules.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="form-group mt-16"><label className="form-label">Add from a skill</label>
                <select className="form-select" value="" onChange={e => { const s = skills.find(x => x.id === Number(e.target.value)); if (s) { const mods = s.default_modules.length ? s.default_modules : [{ title: `${s.name} — practice` }]; mods.forEach(m => addModule({ ...m, skill_id: s.id })); } }}>
                  <option value="">Choose a skill…</option>
                  {skills.filter(s => !s.archived).map(s => <option key={s.id} value={s.id}>{s.name} ({s.default_modules.length || 1} modules)</option>)}
                </select></div>
              <div className="row-gap"><input className="form-input grow" placeholder="Custom module" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { addModule({ title: custom.trim() }); setCustom(''); } }} />
                <button className="btn btn-secondary btn-sm" disabled={!custom.trim()} onClick={() => { addModule({ title: custom.trim() }); setCustom(''); }}><Plus size={14} /> Add</button></div>
            </Panel>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="two-col-even">
          <Panel title="Plan Details" icon="file-text">
            <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={plan.title} placeholder={`${PLAN_TYPES[plan.type].label} — ${staffName || 'Trainee'}`} onChange={e => { setTitleTouched(true); set({ title: e.target.value }); }} /></div>
            <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={plan.description} placeholder="e.g. Targeted training: Bedroom, Bathroom & Presentation" onChange={e => set({ description: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-select" value={plan.type} onChange={e => set({ type: e.target.value })}>
                  {Object.entries(PLAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Trainer</label>
                <select className="form-select" value={plan.trainer_id} onChange={e => set({ trainer_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Start</label><input type="date" className="form-input" value={plan.start_date || ''} onChange={e => set({ start_date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">End</label><input type="date" className="form-input" value={plan.end_date || ''} onChange={e => set({ end_date: e.target.value })} /></div>
            </div>
          </Panel>
          <Panel title={`Sessions (${plan.sessions.length})`} icon="calendar-days" right={<button className="btn btn-secondary btn-sm" onClick={() => set({ sessions: [...plan.sessions, { date: plan.start_date || todayStr(), time: '10:00', trainer_id: plan.trainer_id, notes: '', module_ids: [] }] })}>+ Add session</button>}>
            {plan.sessions.length === 0 ? <EmptyState icon="calendar-days" text="No sessions scheduled yet." /> : plan.sessions.map((s, i) => (
              <div key={i} className="group-box" style={{ padding: 12 }}>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={s.date} onChange={e => setSession(i, { date: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Time</label><input type="time" className="form-input" value={s.time} onChange={e => setSession(i, { time: e.target.value })} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Trainer</label>
                    <select className="form-select" value={s.trainer_id || ''} onChange={e => setSession(i, { trainer_id: e.target.value })}>
                      <option value="">Plan trainer</option>
                      {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select></div>
                  <div className="form-group"><label className="form-label">Focus</label><input className="form-input" value={s.notes} placeholder="e.g. Kitchen + presentation" onChange={e => setSession(i, { notes: e.target.value })} /></div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => set({ sessions: plan.sessions.filter((_, j) => j !== i) })}><Trash2 size={14} /> Remove</button>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {step === 4 && (
        <Panel title="Review & Publish" icon="send">
          <div className="two-col-even">
            <div>
              <div className="kv-label">Trainee</div><div className="kv-value mb-4">{staffName || '—'}</div>
              <div className="kv-label">Plan</div><div className="kv-value mb-4">{plan.title || `${PLAN_TYPES[plan.type].label} — ${staffName || 'Trainee'}`} · {PLAN_TYPES[plan.type].label}</div>
              <div className="kv-label">Timeframe</div><div className="kv-value mb-4">{plan.start_date || '—'} → {plan.end_date || '—'}</div>
              <div className="kv-label">Trainer</div><div className="kv-value mb-4">{managers.find(m => m.id === Number(plan.trainer_id))?.name || 'Unassigned'}</div>
              <div className="kv-label">Sessions</div><div className="kv-value">{plan.sessions.filter(s => s.date).length}</div>
            </div>
            <div>
              <div className="kv-label">Modules ({plan.modules.length})</div>
              {plan.modules.length === 0 ? <div className="muted small">No modules yet.</div> : plan.modules.map((m, i) => <div key={i} className="small" style={{ padding: '3px 0' }}><Icon name="check" size={14} /> {m.title}</div>)}
            </div>
          </div>
        </Panel>
      )}

      {error && <div className="form-error">{error}</div>}
      <div className="row-gap mt-16" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>← Back</button>
        <div className="row-gap">
          <button className="btn btn-secondary" disabled={busy || !plan.staff_id} onClick={() => save(false)}>{status === 'draft' ? 'Save draft' : 'Save changes'}</button>
          {step < 4 ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next →</button>
            : status === 'draft' && <button className="btn btn-primary" disabled={busy || !plan.staff_id} onClick={() => save(true)}>Publish plan</button>}
        </div>
      </div>
    </div>
  );
}
