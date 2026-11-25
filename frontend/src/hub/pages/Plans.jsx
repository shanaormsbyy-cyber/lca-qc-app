import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CalendarDays, ArrowRight } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, StatTile, Panel, ProgressBar, StatusPill, Avatar, EmptyState, Loading, Icon, TypeTag, Modal } from '../components/ui';
import { fmtShort, fmtTime, fmtDate, PLAN_TYPES } from '../lib/format';

const TYPE_ICONS = { new_hire: 'graduation-cap', development: 'bed-double', pip: 'star', cross_training: 'users', reassessment: 'refresh-cw' };
const FILTERS = [['all', 'All Plans'], ['active', 'In Training'], ['draft', 'Drafts'], ['completed', 'Completed'], ['archived', 'Archived']];

function TemplatePicker({ onClose }) {
  const navigate = useNavigate();
  const [templates] = useLoad(() => api.get('/plans/templates').then(r => r.data));
  return (
    <Modal title="Create from Template" onClose={onClose}>
      {!templates ? <Loading /> : templates.length === 0 ? <EmptyState text="No templates yet. Save any plan as a template from its page." /> : templates.map(t => (
        <button key={t.id} className="mini-card w-full mb-4" onClick={() => navigate(`/training-hub/plans/new?template=${t.id}`)}>
          <Icon name={TYPE_ICONS[t.type]} className="mini-card-icon" size={22} />
          <div className="grow"><div className="strong">{t.title}</div><div className="muted small">{PLAN_TYPES[t.type]?.label} · {t.module_count} modules</div></div>
          <ChevronRight size={16} className="chev" />
        </button>
      ))}
    </Modal>
  );
}

function BulkPlanModal({ onClose }) {
  const [templates] = useLoad(() => api.get('/plans/templates').then(r => r.data));
  const [staff] = useLoad(() => api.get('/people/staff').then(r => r.data));
  const [managers] = useLoad(() => api.get('/people/managers').then(r => r.data));
  const [form, setForm] = useState({ template_id: '', staff_ids: [], trainer_id: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const toggle = (id) => setForm(f => ({ ...f, staff_ids: f.staff_ids.includes(id) ? f.staff_ids.filter(x => x !== id) : [...f.staff_ids, id] }));
  const save = async () => {
    try {
      const r = await api.post('/plans/bulk', { template_id: Number(form.template_id), staff_ids: form.staff_ids, trainer_id: form.trainer_id ? Number(form.trainer_id) : null });
      setDone(r.data.ids.length);
    } catch (e) { setError(errMsg(e)); }
  };
  if (done !== null) return <Modal title="Plans created" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}><p>{done} draft plans created. Find them under Drafts to adjust and publish.</p></Modal>;
  return (
    <Modal wide title="Plan Bulk Training" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!form.template_id || !form.staff_ids.length} onClick={save}>Create {form.staff_ids.length || ''} draft plans</button>
    </>}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Template</label>
          <select className="form-select" value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}>
            <option value="">Choose…</option>
            {(templates || []).map(t => <option key={t.id} value={t.id}>{t.title} ({t.module_count} modules)</option>)}
          </select></div>
        <div className="form-group"><label className="form-label">Trainer</label>
          <select className="form-select" value={form.trainer_id} onChange={e => setForm({ ...form, trainer_id: e.target.value })}>
            <option value="">Unassigned</option>
            {(managers || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
      </div>
      <label className="form-label">Trainees</label>
      <div style={{ maxHeight: 260, overflowY: 'auto', columns: 2 }}>
        {(staff || []).map(s => <label key={s.id} className="check-row"><input type="checkbox" checked={form.staff_ids.includes(s.id)} onChange={() => toggle(s.id)} /><span>{s.name}</span></label>)}
      </div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

function ScheduleModal({ onClose }) {
  const navigate = useNavigate();
  const [rows] = useLoad(() => api.get('/plans/sessions/upcoming', { params: { limit: 100 } }).then(r => r.data));
  return (
    <Modal title="Full Schedule" onClose={onClose}>
      {!rows ? <Loading /> : rows.length === 0 ? <EmptyState icon="calendar-days" text="No upcoming sessions." /> : rows.map(s => (
        <div key={s.id} className="list-row clickable" onClick={() => navigate(`/training-hub/plans/${s.plan_id}`)}>
          <div className="day-chip">{fmtShort(s.date).split(' ')[0]}<b>{fmtShort(s.date).split(' ').slice(1).join(' ')}</b></div>
          <div className="grow"><div className="strong small">{s.staff_name}</div><div className="muted small ellipsis">{s.plan_title}</div></div>
          <span className="small">{fmtTime(s.time)}</span>
        </div>
      ))}
    </Modal>
  );
}

export default function Plans() {
  const navigate = useNavigate();
  const [plans] = useLoad(() => api.get('/plans', { params: { sort: 'next_session' } }).then(r => r.data));
  const [stats] = useLoad(() => api.get('/overview/plans').then(r => r.data));
  const [upcoming] = useLoad(() => api.get('/plans/sessions/upcoming', { params: { limit: 5 } }).then(r => r.data));
  const [filter, setFilter] = useState('all');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('next');
  const [modal, setModal] = useState(null);

  if (!plans || !stats) return <Loading />;
  const count = (f) => plans.filter(p => f === 'all' ? p.status !== 'archived' : p.status === f).length;
  let shown = plans.filter(p => (filter === 'all' ? p.status !== 'archived' : p.status === filter) && (!type || p.type === type));
  if (sort === 'progress') shown = [...shown].sort((a, b) => a.progress - b.progress);
  if (sort === 'name') shown = [...shown].sort((a, b) => (a.staff_name || '').localeCompare(b.staff_name || ''));

  const rateSub = stats.completionRateChange == null ? 'Plans ending in the last 30 days'
    : <span className={stats.completionRateChange >= 0 ? 'up' : 'down'}>{stats.completionRateChange >= 0 ? '↑ +' : '↓ '}{stats.completionRateChange}% vs last 30 days</span>;

  return (
    <div>
      <PageTitle title="Training Plans" sub="Build and manage structured development plans.">
        <button className="btn btn-primary" onClick={() => navigate('/training-hub/plans/new')}>+ Build Training Plan</button>
      </PageTitle>
      <div className="two-col">
        <div>
          <div className="tiles">
            <StatTile icon="calendar-days" value={stats.active} label="Active Plans" sub={stats.activeNewThisWeek ? <span className="up">+{stats.activeNewThisWeek} this week</span> : null} tone="cyan" />
            <StatTile icon="pencil" value={stats.drafts} label="Draft Plans" sub="Awaiting finalisation" tone="amber" />
            <StatTile icon="calendar-clock" value={stats.dueThisWeek} label="Due This Week" sub="Sessions / sign-offs" tone="cyan" />
            <StatTile icon="pie-chart" value={stats.completionRate == null ? '—' : `${stats.completionRate}%`} label="Completion Rate" sub={rateSub} tone="green" />
          </div>
          <div className="toolbar">
            <div className="filter-tabs">
              {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l} ({count(k)})</button>)}
            </div>
            <div className="row-gap">
              <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                <option value="">All types</option>
                {Object.entries(PLAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="form-select" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="next">Sort: Next Session</option>
                <option value="progress">Sort: Least progress</option>
                <option value="name">Sort: Trainee</option>
              </select>
            </div>
          </div>
          {shown.length === 0 ? <Panel><EmptyState icon="calendar-days" text="No plans here yet." action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/training-hub/plans/new')}>Build Training Plan</button>} /></Panel> : shown.map(p => (
            <div key={p.id} className="plan-card" onClick={() => navigate(`/training-hub/plans/${p.id}`)}>
              <div className="plan-card-icon"><Icon name={TYPE_ICONS[p.type]} size={22} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="strong ellipsis">{p.title}</div>
                {p.description && <div className="muted small ellipsis">{p.description}</div>}
                <div className="row-gap mt-4">{p.staff_name && <span className="pill pill-grey">{p.staff_name}</span>}<TypeTag type={p.type} types={PLAN_TYPES} />{p.status !== 'active' && <StatusPill status={p.status} />}</div>
              </div>
              <div className="hide-sm">
                <div className="kv-label">Progress</div>
                <div className="row-gap" style={{ flexWrap: 'nowrap' }}><ProgressBar pct={p.progress} tone={p.progress >= 80 ? 'green' : 'cyan'} /><span className="small">{p.progress}%</span></div>
                <div className="muted small mt-4">{p.modules_done} of {p.modules_total} modules completed</div>
              </div>
              <div className="hide-sm hide-md">
                <div className="kv-label"><CalendarDays size={13} /> Next Session</div>
                <div className="kv-value cyan">{p.next_session ? `${fmtShort(p.next_session.date)}${p.next_session.time ? ` • ${fmtTime(p.next_session.time)}` : ''}` : <span className="muted">Not scheduled</span>}</div>
              </div>
              <div className="hide-sm hide-md">
                <div className="kv-label">Trainer</div>
                <div className="person small">{p.trainer_name ? <><Avatar name={p.trainer_name} size={26} />{p.trainer_name}</> : <span className="muted">—</span>}</div>
              </div>
              <ChevronRight size={18} className="chev hide-sm" />
            </div>
          ))}
        </div>

        <div className="stack">
          <Panel title="Upcoming Sessions" icon="calendar-days">
            {!upcoming || upcoming.length === 0 ? <EmptyState icon="calendar-days" text="No sessions scheduled." /> : upcoming.map(s => (
              <div key={s.id} className="session-row clickable" style={{ cursor: 'pointer' }} onClick={() => navigate(`/training-hub/plans/${s.plan_id}`)}>
                <div className="day-chip">{fmtShort(s.date).split(' ')[0]}<b>{fmtShort(s.date).split(' ').slice(1).join(' ')}</b></div>
                <div className="grow"><div className="strong small ellipsis">{s.staff_name}</div><div className="muted small ellipsis">{s.plan_title}</div></div>
                <span className="small">{fmtTime(s.time)}</span>
              </div>
            ))}
            <button className="panel-link w-full mt-16" style={{ justifyContent: 'center', color: 'var(--cyan)' }} onClick={() => setModal('schedule')}>View Full Schedule <ArrowRight size={14} /></button>
          </Panel>
          <Panel title="Quick Actions" icon="zap">
            {[['calendar-plus', 'Build Training Plan', () => navigate('/training-hub/plans/new')], ['layers', 'Create from Template', () => setModal('template')], ['users', 'Plan Bulk Training', () => setModal('bulk')]].map(([i, l, fn]) => (
              <button key={l} className="mini-card w-full mb-4" onClick={fn}><Icon name={i} className="mini-card-icon" /><span className="grow strong small">{l}</span><ChevronRight size={16} className="chev" /></button>
            ))}
          </Panel>
        </div>
      </div>
      {modal === 'template' && <TemplatePicker onClose={() => setModal(null)} />}
      {modal === 'bulk' && <BulkPlanModal onClose={() => setModal(null)} />}
      {modal === 'schedule' && <ScheduleModal onClose={() => setModal(null)} />}
    </div>
  );
}

export { fmtDate };
