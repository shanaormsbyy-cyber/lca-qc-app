import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import { Modal, FileDrop, StatusPill, Icon } from './ui';
import { todayStr, addDays, fmtDate, STAGES } from '../lib/format';

function useList(url) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get(url).then(r => setRows(r.data)).catch(() => {}); }, [url]);
  return rows;
}

function Field({ label, children }) {
  return <div className="form-group"><label className="form-label">{label}</label>{children}</div>;
}

// ── New Hire Setup ───────────────────────────────────────────────────────────
export function NewHireSetupModal({ onClose, onDone }) {
  const navigate = useNavigate();
  const staff = useList('/people/staff');
  const managers = useList('/people/managers');
  const [onboarded, setOnboarded] = useState([]);
  const [mode, setMode] = useState('new');
  const [form, setForm] = useState({ staff_id: '', name: '', role: 'Cleaner', start_date: todayStr(), trainer_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/onboarding', { params: { include_baseline: 1 } }).then(r => setOnboarded(r.data.map(o => o.staff_id))).catch(() => {}); }, []);
  const available = staff.filter(s => !onboarded.includes(s.id));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = { start_date: form.start_date, trainer_id: form.trainer_id ? Number(form.trainer_id) : undefined };
      if (mode === 'new') body.new_staff = { name: form.name, role: form.role };
      else body.staff_id = Number(form.staff_id);
      const r = await api.post('/onboarding/new-hire', body);
      onDone && onDone(r.data);
      // Go straight to their onboarding page — that's where setup happens.
      navigate(`/training-hub/onboarding/${r.data.onboarding_id}`);
      return;
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const valid = (mode === 'new' ? form.name.trim() : form.staff_id) && form.start_date;
  return (
    <Modal title="New Hire Setup" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>{busy ? 'Setting up…' : 'Start onboarding'}</button>
    </>}>
      <div className="seg mb-4">
        <button className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>New person</button>
        <button className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>From staff list</button>
      </div>
      {mode === 'new' ? (
        <div className="form-row">
          <Field label="Name"><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
          <Field label="Role"><input className="form-input" value={form.role} onChange={e => set('role', e.target.value)} /></Field>
        </div>
      ) : (
        <Field label="Staff member">
          <select className="form-select" value={form.staff_id} onChange={e => set('staff_id', e.target.value)}>
            <option value="">Choose…</option>
            {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {available.length === 0 && <div className="muted small mt-4">Everyone on the staff list already has an onboarding record.</div>}
        </Field>
      )}
      <div className="form-row">
        <Field label="Start date"><input type="date" className="form-input" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="Trainer">
          <select className="form-select" value={form.trainer_id} onChange={e => set('trainer_id', e.target.value)}>
            <option value="">Me</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// ── Mark as already trained ──────────────────────────────────────────────────
export function AlreadyTrainedModal({ onClose, presetStaffIds = [] }) {
  const staff = useList('/people/staff');
  const managers = useList('/people/managers');
  const skills = useList('/skills');
  const [onboarded, setOnboarded] = useState(null);
  const [selected, setSelected] = useState(presetStaffIds);
  const [skillIds, setSkillIds] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [trainer, setTrainer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { api.get('/onboarding', { params: { include_baseline: 1 } }).then(r => setOnboarded(r.data.map(o => o.staff_id))).catch(() => setOnboarded([])); }, []);
  useEffect(() => { if (skills.length && skillIds === null) setSkillIds(skills.filter(s => s.required).map(s => s.id)); }, [skills, skillIds]);
  const available = onboarded ? staff.filter(s => !onboarded.includes(s.id)) : [];
  const toggle = (arr, setArr, id) => setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/onboarding/already-trained', { staff_ids: selected, signed_off_at: date, trainer_id: trainer ? Number(trainer) : undefined, skill_ids: skillIds });
      setDone(r.data);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="Marked as already trained" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <p>{done.created.length} {done.created.length === 1 ? 'person' : 'people'} marked as trained and competent.{done.skipped.length ? ` ${done.skipped.length} skipped (already have an onboarding record).` : ''}</p>
      </Modal>
    );
  }

  return (
    <Modal wide title="Mark as already trained" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!selected.length || busy} onClick={save}>{busy ? 'Saving…' : `Mark ${selected.length || ''} as trained`}</button>
    </>}>
      <p className="muted small mb-4">For existing cleaners: records them as signed off and competent so you can flag reassessments or start plans straight away.</p>
      <div className="two-col-even">
        <div>
          <div className="row-gap mb-4" style={{ justifyContent: 'space-between' }}>
            <label className="form-label" style={{ margin: 0 }}>Staff ({available.length} without a record)</label>
            <button className="panel-link" onClick={() => setSelected(selected.length === available.length ? [] : available.map(s => s.id))}>
              {selected.length === available.length && available.length ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {available.map(s => (
              <label key={s.id} className="check-row"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(selected, setSelected, s.id)} /><span>{s.name}</span></label>
            ))}
            {onboarded && available.length === 0 && <div className="muted small">Everyone already has a record.</div>}
          </div>
        </div>
        <div>
          <div className="form-row">
            <Field label="Signed off on"><input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Trained by (optional)">
              <select className="form-select" value={trainer} onChange={e => setTrainer(e.target.value)}>
                <option value="">—</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          </div>
          <label className="form-label">Competent in</label>
          {(skillIds || []) && skills.map(s => (
            <label key={s.id} className="check-row"><input type="checkbox" checked={(skillIds || []).includes(s.id)} onChange={() => toggle(skillIds || [], setSkillIds, s.id)} />
              <span>{s.name}{s.required ? <span className="muted small"> · required</span> : null}</span></label>
          ))}
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// ── Run assessment ───────────────────────────────────────────────────────────
export function AssessmentModal({ competency, onClose }) {
  const skills = useList('/skills?include_archived=1');
  const allComps = useList('/competencies');
  const [compId, setCompId] = useState(competency ? competency.id : '');
  const comp = competency || allComps.find(c => c.id === Number(compId));
  const skill = comp ? skills.find(s => s.id === comp.skill_id) : null;
  const [last, setLast] = useState(null);
  const [form, setForm] = useState({ date: todayStr(), level: 'practicing', notes: '' });
  const [ticks, setTicks] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!comp) return;
    api.get(`/competencies/${comp.id}/assessments`).then(r => setLast(r.data[0] || null)).catch(() => {});
  }, [comp && comp.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('date', form.date);
    fd.append('level', form.level);
    fd.append('notes', form.notes);
    fd.append('criteria_json', JSON.stringify((skill?.criteria || []).map(c => ({ text: c.text, met: ticks.includes(c.id) }))));
    files.forEach(f => fd.append('photos', f));
    try { await api.post(`/competencies/${comp.id}/assessments`, fd); onClose(true); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={comp ? `Assess ${comp.skill_name} — ${comp.staff_name}` : 'Run Assessment'} onClose={() => onClose(false)} footer={<>
      <button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
      <button className="btn btn-primary" disabled={!comp || busy} onClick={save}>{busy ? 'Saving…' : 'Save assessment'}</button>
    </>}>
      {!competency && (
        <Field label="Trainee & skill">
          <select className="form-select" value={compId} onChange={e => setCompId(e.target.value)}>
            <option value="">Choose…</option>
            {allComps.filter(c => c.status !== 'competent').map(c => <option key={c.id} value={c.id}>{c.staff_name} — {c.skill_name}</option>)}
            {allComps.filter(c => c.status === 'competent').map(c => <option key={c.id} value={c.id}>{c.staff_name} — {c.skill_name} (competent)</option>)}
          </select>
        </Field>
      )}
      {comp && last && (
        <div className="notice notice-cyan mb-4"><Icon name="history" />
          <div>Last assessed {fmtDate(last.date)} ·<StatusPill status={last.level} />{last.notes ? <div className="small mt-4">{last.notes}</div> : null}</div>
        </div>
      )}
      <div className="form-row">
        <Field label="Date"><input type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Result">
          <select className="form-select" value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
            <option value="introduced">Introduced</option>
            <option value="practicing">Practicing</option>
            <option value="competent">Competent</option>
          </select>
        </Field>
      </div>
      {skill && skill.criteria.length > 0 && (
        <Field label="Criteria">
          {skill.criteria.map(c => (
            <label key={c.id} className="check-row"><input type="checkbox" checked={ticks.includes(c.id)} onChange={() => setTicks(t => t.includes(c.id) ? t.filter(x => x !== c.id) : [...t, c.id])} /><span>{c.text}</span></label>
          ))}
        </Field>
      )}
      <Field label="Notes"><textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What went well, what to work on" /></Field>
      <Field label="Photos (optional)">
        <FileDrop onFiles={fs => setFiles(prev => [...prev, ...fs])} />
        {files.length > 0 && <div className="thumbs">{files.map((f, i) => <div key={i} className="thumb">{f.type.startsWith('image/') ? <img className="thumb" src={URL.createObjectURL(f)} alt="" /> : f.name.slice(0, 10)}</div>)}</div>}
      </Field>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// ── Assign assessment (create trainee × skill) ───────────────────────────────
export function AssignAssessmentModal({ onClose, presetStaffId }) {
  const staff = useList('/people/staff');
  const skills = useList('/skills');
  const [dueDays, setDueDays] = useState(21);
  const [form, setForm] = useState({ staff_id: presetStaffId || '', skill_id: '', new_skill: '', required: true, due_date: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/settings').then(r => setDueDays(r.data.competency_due_days)).catch(() => {}); }, []);
  const due = form.due_date || addDays(todayStr(), dueDays);

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (form.skill_id === 'new') {
        await api.post('/competencies/new-skill', { staff_id: Number(form.staff_id), name: form.new_skill, required: form.required, due_date: due });
      } else {
        await api.post('/competencies', { staff_id: Number(form.staff_id), skill_id: Number(form.skill_id), required: form.required ? 1 : 0, due_date: due });
      }
      onClose(true);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const valid = form.staff_id && (form.skill_id === 'new' ? form.new_skill.trim() : form.skill_id);

  return (
    <Modal title="Assign Assessment" onClose={() => onClose(false)} footer={<>
      <button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
      <button className="btn btn-primary" disabled={!valid || busy} onClick={save}>Assign</button>
    </>}>
      <Field label="Trainee">
        <select className="form-select" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} disabled={!!presetStaffId}>
          <option value="">Choose…</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Skill">
        <select className="form-select" value={form.skill_id} onChange={e => setForm({ ...form, skill_id: e.target.value })}>
          <option value="">Choose…</option>
          {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          <option value="new">+ New skill…</option>
        </select>
      </Field>
      {form.skill_id === 'new' && <Field label="New skill name"><input className="form-input" value={form.new_skill} onChange={e => setForm({ ...form, new_skill: e.target.value })} /></Field>}
      <div className="form-row">
        <Field label="Due date"><input type="date" className="form-input" value={due} onChange={e => setForm({ ...form, due_date: e.target.value })} /></Field>
        <Field label="Sign-off">
          <label className="check-row"><input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} /><span>Required for this trainee's sign-off</span></label>
        </Field>
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// ── Competency actions (reassess / due date / un-require / remove) ───────────
export function CompetencyActionModal({ competency, action, onClose }) {
  const [reason, setReason] = useState('');
  const [due, setDue] = useState(competency.due_date || addDays(todayStr(), 14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titles = { reassess: 'Flag for reassessment', due: 'Change due date', unrequire: 'Remove from required skills', require: 'Make required', remove: 'Remove skill from trainee' };
  const run = async () => {
    setBusy(true); setError('');
    try {
      if (action === 'reassess') await api.post(`/competencies/${competency.id}/reassess`, { reason, due_date: due });
      if (action === 'due') await api.put(`/competencies/${competency.id}`, { due_date: due });
      if (action === 'unrequire') await api.put(`/competencies/${competency.id}`, { required: 0, unrequired_reason: reason });
      if (action === 'require') await api.put(`/competencies/${competency.id}`, { required: 1 });
      if (action === 'remove') await api.delete(`/competencies/${competency.id}`);
      onClose(true);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const needsReason = action === 'reassess' || action === 'unrequire';
  return (
    <Modal title={`${titles[action]} — ${competency.skill_name}`} onClose={() => onClose(false)} footer={<>
      <button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
      <button className={`btn ${action === 'remove' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (needsReason && !reason.trim())} onClick={run}>Confirm</button>
    </>}>
      <p className="muted small mb-4">{competency.staff_name}</p>
      {needsReason && <Field label="Reason"><textarea className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} autoFocus /></Field>}
      {(action === 'reassess' || action === 'due') && <Field label="Due date"><input type="date" className="form-input" value={due} onChange={e => setDue(e.target.value)} /></Field>}
      {action === 'remove' && <p>This removes the skill and its assessment history for this trainee.</p>}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// ── Stage control ────────────────────────────────────────────────────────────
export function StageControl({ onboarding, onMoved }) {
  const [blocked, setBlocked] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!onboarding) return null;
  const stage = onboarding.stage;
  const completed = onboarding.record_status === 'completed';

  const move = async (to, override) => {
    setBusy(true); setError('');
    try {
      await api.post(`/onboarding/${onboarding.id}/stage`, { to_stage: to, override_reason: override });
      setBlocked(null); setReason('');
      onMoved && onMoved(to);
    } catch (e) {
      if (e.response?.status === 409) setBlocked({ to, list: e.response.data.blocking || [], error: e.response.data.error });
      else setError(errMsg(e));
    } finally { setBusy(false); }
  };
  const signoff = async () => {
    if (!window.confirm('Sign off this trainee as fully trained?')) return;
    try { await api.post(`/onboarding/${onboarding.id}/signoff`); } catch (e) { setError(errMsg(e)); }
  };

  if (completed) return <div className="row-gap"><StatusPill status="signed_off" /><span className="muted small">{onboarding.is_baseline ? 'Marked as already trained' : `Signed off ${fmtDate(onboarding.signed_off_at)}`}</span></div>;

  return (
    <div>
      <div className="row-gap">
        {stage > 1 && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => move(stage - 1)}>← Back to {STAGES[stage - 2]}</button>}
        {stage < 5 && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => move(stage + 1)}>Move to {STAGES[stage]} →</button>}
        {stage === 5 && <button className="btn btn-primary btn-sm" onClick={signoff}>Sign off trainee</button>}
      </div>
      {blocked && (
        <div className="notice notice-amber mt-16"><Icon name="alert-triangle" />
          <div style={{ flex: 1 }}>
            <div className="strong">{blocked.error}</div>
            {blocked.list.length > 0 && <div className="small">Still needed: {blocked.list.join(', ')}</div>}
            <div className="small mt-4">You can override with a reason (it's recorded on their profile).</div>
            <div className="row-gap mt-4">
              <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Reason for override" value={reason} onChange={e => setReason(e.target.value)} />
              <button className="btn btn-secondary btn-sm" disabled={!reason.trim() || busy} onClick={() => move(blocked.to, reason)}>Override &amp; move</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setBlocked(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

// ── Start shadow period ──────────────────────────────────────────────────────
export function StartShadowModal({ onClose, presetStaffId }) {
  const staff = useList('/people/staff');
  const managers = useList('/people/managers');
  const [form, setForm] = useState({ staff_id: presetStaffId || '', mentor_id: '' });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      const r = await api.post('/shadow', { staff_id: Number(form.staff_id), mentor_id: form.mentor_id ? Number(form.mentor_id) : undefined });
      onClose(r.data.id);
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Modal title="Start Shadow Period" onClose={() => onClose(null)} footer={<>
      <button className="btn btn-ghost" onClick={() => onClose(null)}>Cancel</button>
      <button className="btn btn-primary" disabled={!form.staff_id} onClick={save}>Start</button>
    </>}>
      <Field label="Trainee">
        <select className="form-select" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
          <option value="">Choose…</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Mentor">
        <select className="form-select" value={form.mentor_id} onChange={e => setForm({ ...form, mentor_id: e.target.value })}>
          <option value="">Me</option>
          {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// Add a competency's skill modules to the trainee's open training plan; tells the trainer if it can't.
export async function addCompetencyToPlan(c) {
  try {
    const r = await api.post(`/competencies/${c.id}/add-to-plan`);
    return r.data;
  } catch (e) {
    window.alert(errMsg(e));
    return null;
  }
}

export function useSkillsMap() {
  const skills = useList('/skills?include_archived=1');
  return useMemo(() => Object.fromEntries(skills.map(s => [s.id, s])), [skills]);
}
