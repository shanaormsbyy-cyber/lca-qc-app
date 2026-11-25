import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ChevronRight, ArrowRight, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, StatTile, Panel, ProgressCell, StatusPill, Avatar, JourneyStrip, EmptyState, Loading, Icon, Modal } from '../components/ui';
import { NewHireSetupModal } from '../components/modals';
import { fmtDate, STAGES } from '../lib/format';

function ChecklistTemplateModal({ onClose }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/onboarding/checklist-template').then(r => setGroups(r.data.map(g => ({
      name: g.name, description: g.description || '', source: g.source || null,
      items: g.items.map(i => ({ text: i.text, details: i.details || '' })),
    }))));
  }, []);
  const setGroup = (i, patch) => setGroups(gs => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const setItem = (gi, ii, patch) => setGroup(gi, { items: groups[gi].items.map((x, k) => (k === ii ? { ...x, ...patch } : x)) });
  const moveGroup = (i, d) => { const a = [...groups]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setGroups(a); };
  const save = async () => {
    try { await api.put('/onboarding/checklist-template', { groups }); onClose(); } catch (e) { setError(errMsg(e)); }
  };
  const hasCaddy = groups && groups.some(g => g.source === 'caddy');
  return (
    <Modal wide title="Edit onboarding checklist template" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save template</button></>}>
      <div className="notice notice-cyan mb-4"><Icon name="info" /><div>Applies to new hires from now on. Existing trainees keep their current checklist. Add details under any item to explain what to cover.</div></div>
      {!groups ? <Loading /> : groups.map((g, i) => (
        <div key={i} className="group-box" style={{ padding: 12 }}>
          <div className="editor-row">
            <input className="form-input strong" value={g.name} placeholder="Section name" onChange={e => setGroup(i, { name: e.target.value })} />
            <button className="icon-btn" onClick={() => moveGroup(i, -1)}><ArrowUp size={14} /></button>
            <button className="icon-btn" onClick={() => moveGroup(i, 1)}><ArrowDown size={14} /></button>
            <button className="icon-btn danger" onClick={() => setGroups(groups.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
          {g.source === 'caddy' ? (
            <div className="muted small" style={{ paddingLeft: 4 }}>Items come from the <Link to="/training-hub/caddy" onClick={onClose} style={{ color: 'var(--cyan)' }}>Cleaning Caddy Contents</Link> list — edit them there.</div>
          ) : (
            <>
              {g.items.map((it, j) => (
                <div key={j} className="editor-row" style={{ paddingLeft: 16 }}>
                  <div className="grow">
                    <input className="form-input" value={it.text} placeholder="Item" onChange={e => setItem(i, j, { text: e.target.value })} />
                    <input className="form-input mt-4" value={it.details} placeholder="Details (optional) — e.g. what it's for, what to show them" onChange={e => setItem(i, j, { details: e.target.value })} />
                  </div>
                  <button className="icon-btn danger" onClick={() => setGroup(i, { items: g.items.filter((_, k) => k !== j) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 16 }} onClick={() => setGroup(i, { items: [...g.items, { text: '', details: '' }] })}><Plus size={14} /> Item</button>
            </>
          )}
        </div>
      ))}
      {groups && (
        <div className="row-gap">
          <button className="btn btn-secondary btn-sm" onClick={() => setGroups([...groups, { name: '', description: '', source: null, items: [] }])}><Plus size={14} /> Section</button>
          {!hasCaddy && <button className="btn btn-ghost btn-sm" onClick={() => setGroups([...groups, { name: 'Cleaning Caddy', description: '', source: 'caddy', items: [] }])}><Plus size={14} /> Caddy section</button>}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows] = useLoad(() => api.get('/onboarding').then(r => r.data));
  const [stats] = useLoad(() => api.get('/overview/onboarding').then(r => r.data));
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [setup, setSetup] = useState(!!params.get('setup'));
  const [template, setTemplate] = useState(!!params.get('template'));

  useEffect(() => { if (params.get('focus')) navigate(`/training-hub/onboarding/${params.get('focus')}`, { replace: true }); }, [params, navigate]);

  if (!rows || !stats) return <Loading />;
  const shown = rows.filter(r => (!q || r.staff_name.toLowerCase().includes(q.toLowerCase()))
    && (!stage || r.stage === Number(stage)) && (!status || r.status === status));

  return (
    <div>
      <PageTitle title="Onboarding" sub="Manage new starter induction and onboarding progress. Click a name to open their onboarding checklist.">
        <button className="btn btn-ghost" onClick={() => setTemplate(true)}>Edit checklist template</button>
        <button className="btn btn-primary" onClick={() => setSetup(true)}><Icon name="user-plus" size={16} /> New Hire Setup <ArrowRight size={16} /></button>
      </PageTitle>
      <div className="tiles">
        <StatTile icon="users" value={stats.newStarters} label="New Starters" sub="In setup & induction" tone="cyan" />
        <StatTile icon="refresh-cw" value={stats.inProgress} label="In Progress" sub="Actively onboarding" tone="cyan" />
        <StatTile icon="check-circle" value={stats.completed} label="Completed" sub="Fully onboarded" tone="green" />
        <StatTile icon="calendar" value={stats.startingSoon} label="Starting Soon" sub="Within 7 days" tone="amber" />
      </div>
      <div className="stack">
        <Panel title="Onboarding Progress" icon="bar-chart-3" right={
          <div className="toolbar" style={{ margin: 0 }}>
            <input className="form-input" placeholder="Search employees…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="form-select" value={stage} onChange={e => setStage(e.target.value)}>
              <option value="">All Stages</option>{STAGES.map((s, i) => <option key={s} value={i + 1}>{s}</option>)}
            </select>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option><option value="starting_soon">Starting Soon</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
            </select>
          </div>}>
          {shown.length === 0 ? <EmptyState icon="user-plus" text={rows.length ? 'No matches.' : 'No one in onboarding yet.'} action={<button className="btn btn-primary btn-sm" onClick={() => setSetup(true)}>New Hire Setup</button>} /> : (
            <div className="table-scroll">
              <table className="hub-table">
                <thead><tr><th>Employee</th><th>Start date</th><th>Current stage</th><th>Progress</th><th>Trainer</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/training-hub/onboarding/${r.id}`)}>
                      <td><span className="person"><Avatar name={r.staff_name} size={30} /><span className="strong" style={{ color: 'var(--cyan)' }}>{r.staff_name}</span></span></td>
                      <td>{fmtDate(r.start_date)}</td>
                      <td><StatusPill status={r.status === 'completed' ? 'completed' : 'in_progress'} label={r.status === 'completed' ? 'Completed' : r.stage_name} /></td>
                      <td><ProgressCell pct={r.progress} tone={r.progress >= 100 ? 'green' : 'cyan'} /></td>
                      <td>{r.trainer_name || 'TBC'}</td>
                      <td><StatusPill status={r.status} /></td>
                      <td><span className="btn btn-secondary btn-sm">Open checklist <ChevronRight size={14} /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Onboarding Stages" icon="route"><JourneyStrip current={1} /></Panel>
      </div>
      {setup && <NewHireSetupModal onClose={() => { setSetup(false); if (params.get('setup')) setParams({}); }} />}
      {template && <ChecklistTemplateModal onClose={() => { setTemplate(false); if (params.get('template')) setParams({}); }} />}
    </div>
  );
}
