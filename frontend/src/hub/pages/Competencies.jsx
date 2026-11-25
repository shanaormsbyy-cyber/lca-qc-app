import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MoreHorizontal, CalendarDays, Play, Settings2 } from 'lucide-react';
import api from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, StatTile, Panel, StatusPill, Avatar, EmptyState, Loading, Icon } from '../components/ui';
import { LEVELS } from '../lib/format';
import { AssessmentModal, AssignAssessmentModal, CompetencyActionModal, addCompetencyToPlan } from '../components/modals';
import { fmtDate, fmtDayMonth, todayStr, addDays } from '../lib/format';

export default function Competencies() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows] = useLoad(() => api.get('/competencies').then(r => r.data));
  const [stats] = useLoad(() => api.get('/overview/competencies').then(r => r.data));
  const [staffFilter, setStaffFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState(params.get('skill_id') || '');
  const [groupBy, setGroupBy] = useState('skill');
  const [assess, setAssess] = useState(params.get('assess') ? 'pick' : null);
  const [assign, setAssign] = useState(false);
  const [action, setAction] = useState(null);
  const [menu, setMenu] = useState(null);
  const focus = Number(params.get('focus')) || null;

  useEffect(() => {
    if (focus && rows) document.getElementById(`comp-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, rows]);

  const filtered = useMemo(() => (rows || []).filter(r =>
    (!staffFilter || r.staff_id === Number(staffFilter)) && (!skillFilter || r.skill_id === Number(skillFilter))), [rows, staffFilter, skillFilter]);

  if (!rows || !stats) return <Loading />;
  const staffOpts = [...new Map(rows.map(r => [r.staff_id, r.staff_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const skillOpts = [...new Map(rows.map(r => [r.skill_id, r.skill_name])).entries()];

  const groups = [];
  for (const r of filtered) {
    const key = groupBy === 'skill' ? r.skill_name : r.staff_name;
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, rows: [] }; groups.push(g); }
    g.rows.push(r);
  }
  if (groupBy === 'trainee') groups.sort((a, b) => a.key.localeCompare(b.key));

  const t = todayStr();
  const due = rows.filter(r => r.status !== 'competent' && r.due_date && r.due_date <= addDays(t, 7))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const closeAssess = () => { setAssess(null); if (params.get('assess')) setParams({}); };

  const row = (r) => (
    <tr key={r.id} id={`comp-${r.id}`} className={`clickable${r.id === focus ? ' focus' : ''}`} onClick={() => navigate(`/training-hub/competency/${r.id}`)} title="Open competency">
      {groupBy !== 'skill' && <td><span className="person"><Icon name={r.skill_icon} size={18} className="muted" /><span className="strong">{r.skill_name}</span></span></td>}
      {groupBy !== 'trainee' && <td><span className="person clickable" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); navigate(`/training-hub/trainees/${r.staff_id}`); }}><Avatar name={r.staff_name} size={28} />{r.staff_name}</span></td>}
      <td><StatusPill status={r.level} label={LEVELS[r.level]?.label} /></td>
      <td><StatusPill status={r.status} /></td>
      <td className="small">{r.status === 'competent' || !r.due_date ? '—' : <span className="row-gap" style={{ color: r.status === 'overdue' ? 'var(--red)' : undefined }}><CalendarDays size={14} />{fmtDate(r.due_date)}</span>}</td>
      <td style={{ whiteSpace: 'nowrap', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" onClick={() => setAssess(r)}>Assess</button>{' '}
        <button className="icon-btn" onClick={() => setMenu(menu === r.id ? null : r.id)}><MoreHorizontal size={16} /></button>
        {menu === r.id && (
          <div className="search-drop" style={{ right: 0, left: 'auto', width: 220, top: 40 }}>
            {r.level === 'competent' && !r.reassess_flag && <button className="search-item" onClick={() => { setAction({ c: r, a: 'reassess' }); setMenu(null); }}>Flag for reassessment</button>}
            {r.in_plan ? <div className="search-item muted">In training plan ✓</div>
              : <button className="search-item" onClick={() => { setMenu(null); addCompetencyToPlan(r); }}>Add to training plan</button>}
            <button className="search-item" onClick={() => { setAction({ c: r, a: 'due' }); setMenu(null); }}>Change due date</button>
            {r.required ? <button className="search-item" onClick={() => { setAction({ c: r, a: 'unrequire' }); setMenu(null); }}>Remove from required</button>
              : <button className="search-item" onClick={() => { setAction({ c: r, a: 'require' }); setMenu(null); }}>Make required</button>}
            <button className="search-item" onClick={() => { setAction({ c: r, a: 'remove' }); setMenu(null); }}>Remove skill</button>
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <div>
      <PageTitle title="Competencies" sub="Track practical skills and assessment status.">
        <select className="form-select" style={{ width: 170 }} value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
          <option value="">All Trainees</option>
          {staffOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className="form-select" style={{ width: 170 }} value={skillFilter} onChange={e => setSkillFilter(e.target.value)}>
          <option value="">All Skills</option>
          {skillOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={() => navigate('/training-hub/competencies/skills')}><Settings2 size={16} /> Manage Skills</button>
      </PageTitle>

      <div className="tiles">
        <StatTile icon="award" value={stats.competent} label="Competent" sub={stats.competentChangeWeek ? <span className="up">↑ +{stats.competentChangeWeek} this week</span> : 'No new sign-offs this week'} tone="green" />
        <StatTile icon="refresh-cw" value={stats.inProgress} label="In Progress" sub="Currently being trained" tone="cyan" />
        <StatTile icon="alert-triangle" value={stats.needsReassessment} label="Needs Reassessment" sub="Performance or QC flags" tone="amber" />
        <StatTile icon="calendar-x" value={stats.overdue} label="Overdue" sub="Assessment past due date" tone="red" />
      </div>

      <div className="two-col">
        <Panel title="Competency Matrix" icon="table" right={
          <div className="row-gap">
            <span className="muted small">Group by:</span>
            <div className="seg">
              <button className={groupBy === 'skill' ? 'active' : ''} onClick={() => setGroupBy('skill')}>Skill</button>
              <button className={groupBy === 'trainee' ? 'active' : ''} onClick={() => setGroupBy('trainee')}>Trainee</button>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setAssign(true)}>+ Assign Assessment</button>
          </div>}>
          {filtered.length === 0 ? <EmptyState icon="award" text={rows.length ? 'No matches for these filters.' : 'No competencies yet. They appear when you set up a new hire or assign an assessment.'} /> : (
            <div className="table-scroll" style={{ minHeight: menu ? 220 : undefined }}>
              <table className="hub-table">
                <thead><tr>{groupBy !== 'skill' && <th>Cleaning skill</th>}{groupBy !== 'trainee' && <th>Trainee</th>}<th>Level</th><th>Status</th><th>Due date</th><th>Actions</th></tr></thead>
                <tbody>
                  {groups.map(g => (
                    <React.Fragment key={g.key}>
                      <tr className="group-row"><td colSpan={5}>{g.key} · {g.rows.length}</td></tr>
                      {g.rows.map(row)}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Assessment Due" icon="calendar-clock">
          <p className="muted small mb-4">Upcoming and overdue competency assessments.</p>
          {due.length === 0 ? <EmptyState icon="check-circle" text="Nothing due in the next 7 days." /> : due.slice(0, 8).map(r => (
            <div key={r.id} className="list-row clickable" onClick={() => setAssess(r)}>
              <Avatar name={r.staff_name} />
              <div className="grow"><div className="strong small ellipsis">{r.staff_name}</div><div className="muted small ellipsis">{r.skill_name}</div></div>
              <span className={`pill ${r.due_date < t ? 'pill-red' : 'pill-grey'}`}>{r.due_date < t ? 'Overdue' : `Due ${fmtDayMonth(r.due_date)}`}</span>
            </div>
          ))}
          <button className="btn btn-primary w-full mt-16" onClick={() => setAssess('pick')}><Play size={16} /> Run Assessment</button>
        </Panel>
      </div>

      {assess && <AssessmentModal competency={assess === 'pick' ? null : assess} onClose={closeAssess} />}
      {assign && <AssignAssessmentModal onClose={() => setAssign(false)} />}
      {action && <CompetencyActionModal competency={action.c} action={action.a} onClose={() => setAction(null)} />}
    </div>
  );
}
