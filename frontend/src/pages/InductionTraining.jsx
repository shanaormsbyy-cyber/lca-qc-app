import React, { useEffect, useState } from 'react';
import api from '../api';

// ─── Colour constants ───────────────────────────────────────────────────────
const CYAN       = '#00c896';
const CYAN_DARK  = '#00a07a';
const CYAN_LIGHT = 'rgba(0,200,150,0.10)';
const BORDER     = 'rgba(255,255,255,0.10)';
const SURFACE    = '#112240';
const SURFACE2   = '#0d1b36';
const TEXT1      = '#ffffff';
const TEXT2      = '#94a3b8';
const TEXT3      = '#475569';

// ─── Data ────────────────────────────────────────────────────────────────────
const PROCESSES_TASKS = [
  { id: 'p1',  label: 'LCA Introduction & Company Overview',             mins: 15 },
  { id: 'p2',  label: 'Health & Safety Induction',                       mins: 30 },
  { id: 'p3',  label: 'COSHH / Chemical Handling',                       mins: 20 },
  { id: 'p4',  label: 'Manual Handling Awareness',                       mins: 20 },
  { id: 'p5',  label: 'PPE Requirements & Usage',                        mins: 15 },
  { id: 'p6',  label: 'Cleaning Equipment Overview',                     mins: 20 },
  { id: 'p7',  label: 'Cleaning Standards & Quality Expectations',       mins: 20 },
  { id: 'p8',  label: 'Reporting Procedures (incidents, damage, etc.)',  mins: 15 },
  { id: 'p9',  label: 'Uniform & Personal Presentation',                 mins: 10 },
  { id: 'p10', label: 'Time Keeping & Attendance Policy',                mins: 15 },
  { id: 'p11', label: 'Communication Channels (WhatsApp, app, etc.)',    mins: 10 },
  { id: 'p12', label: 'Payroll & Pay Queries Process',                   mins: 10 },
];

const CLEANING_AREAS = [
  { id: 'ca1',  label: 'Vacuuming – carpets, edges, stairs' },
  { id: 'ca2',  label: 'Mopping – hard floors (correct technique)' },
  { id: 'ca3',  label: 'Kitchen – surfaces, appliances, splashbacks' },
  { id: 'ca4',  label: 'Bathroom – toilet, basin, bath/shower, tiles' },
  { id: 'ca5',  label: 'Dusting – furniture, skirting, light fittings' },
  { id: 'ca6',  label: 'Windows & Mirrors – streak-free method' },
  { id: 'ca7',  label: 'Bedroom – making beds, under-bed, wardrobes' },
  { id: 'ca8',  label: 'Bin Emptying & Disposal' },
  { id: 'ca9',  label: 'Deep Clean – oven, fridge, inside cupboards' },
  { id: 'ca10', label: 'End of Tenancy – full property walkthrough' },
];

const VALUES_TASKS = [
  { id: 'v1', label: 'Integrity – Doing the right thing even when no one is watching' },
  { id: 'v2', label: 'Reliability – Being on time, every time' },
  { id: 'v3', label: 'Professionalism – Conduct, language, and behaviour on site' },
  { id: 'v4', label: 'Respect – For client properties and personal belongings' },
  { id: 'v5', label: 'Communication – Keeping supervisors informed' },
  { id: 'v6', label: 'Accountability – Taking ownership of mistakes' },
];

const SHIFT_TASKS = [
  {
    id: 'shift1',
    title: 'Shift 1 – Shadowing',
    intro: 'Employee shadows an experienced cleaner for a full shift. No independent tasks — observation and questions only.',
    tasks: [
      { id: 's1t1', label: 'Attend full shadow shift with experienced cleaner' },
      { id: 's1t2', label: 'Observe property entry / key/access procedures' },
      { id: 's1t3', label: 'Watch full room-by-room cleaning sequence' },
      { id: 's1t4', label: 'Note chemical usage and labelling' },
      { id: 's1t5', label: 'End-of-shift Q&A with supervisor' },
    ],
  },
  {
    id: 'shift2',
    title: 'Shift 2 – Assisted Cleaning',
    intro: 'Employee completes tasks alongside the trainer. Trainer corrects technique in real time.',
    tasks: [
      { id: 's2t1', label: 'Complete bathroom clean (supervised)' },
      { id: 's2t2', label: 'Complete kitchen clean (supervised)' },
      { id: 's2t3', label: 'Vacuum full property (supervised)' },
      { id: 's2t4', label: 'Mop hard floors (supervised)' },
      { id: 's2t5', label: 'Demonstrate correct chemical dilution' },
    ],
  },
  {
    id: 'shift3',
    title: 'Shift 3 – Independent with Check',
    intro: 'Employee completes the property independently. Trainer inspects at end and provides written feedback.',
    tasks: [
      { id: 's3t1', label: 'Complete full property clean independently' },
      { id: 's3t2', label: 'Self-check against LCA quality standards' },
      { id: 's3t3', label: 'Trainer final walkthrough & sign-off' },
      { id: 's3t4', label: 'Feedback discussion – areas to improve' },
    ],
  },
  {
    id: 'shift4',
    title: 'Shift 4 – Solo Clean',
    intro: 'Employee completes a solo clean. Trainer available by phone only. QC check conducted same day or next day.',
    tasks: [
      { id: 's4t1', label: 'Complete full property clean solo' },
      { id: 's4t2', label: 'Take before/after photos and submit via app' },
      { id: 's4t3', label: 'Complete post-clean checklist' },
      { id: 's4t4', label: 'QC review by supervisor within 24 hrs' },
    ],
  },
  {
    id: 'shift5',
    title: 'Shift 5 – Sign-Off Clean',
    intro: 'Final assessment clean. Employee demonstrates full competency. Result determines readiness for independent roster.',
    tasks: [
      { id: 's5t1', label: 'Arrive on time with full uniform and equipment' },
      { id: 's5t2', label: 'Complete full clean to LCA standard independently' },
      { id: 's5t3', label: 'Submit photo evidence via app' },
      { id: 's5t4', label: 'Complete end-of-shift self-assessment form' },
      { id: 's5t5', label: 'Trainer/supervisor sign-off on competency' },
    ],
  },
];

const SHIFT_INTROS = SHIFT_TASKS.reduce((acc, s) => { acc[s.id] = s.intro; return acc; }, {});

const SHIFT_5_FIXED = [
  { id: 'sf1', label: 'Property cleaned to full LCA standard' },
  { id: 'sf2', label: 'All rooms addressed — no areas missed' },
  { id: 'sf3', label: 'Chemicals used correctly and safely' },
  { id: 'sf4', label: 'Equipment left clean and stored properly' },
  { id: 'sf5', label: 'Photo evidence submitted' },
  { id: 'sf6', label: 'No damage or complaints reported' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mkTasks(arr) {
  return arr.reduce((acc, t) => { acc[t.id] = false; return acc; }, {});
}

function mkCustom() {
  return [{ id: Date.now(), text: '', done: false }];
}

function initState() {
  const shiftNotes = {};
  const shiftVerdict = {};
  const shiftCustomTasks = {};
  SHIFT_TASKS.forEach(s => {
    shiftNotes[s.id]       = '';
    shiftVerdict[s.id]     = null;
    shiftCustomTasks[s.id] = mkCustom();
  });

  return {
    employeeName:      '',
    startDate:         '',
    supervisorName:    '',
    processTasks:      mkTasks(PROCESSES_TASKS),
    processNotes:      '',
    cleaningAreaTasks: mkTasks(CLEANING_AREAS),
    cleaningNotes:     '',
    valuesTasks:       mkTasks(VALUES_TASKS),
    valuesNotes:       '',
    shiftTasks:        SHIFT_TASKS.reduce((acc, s) => { acc[s.id] = mkTasks(s.tasks); return acc; }, {}),
    shiftNotes,
    shiftVerdict,
    shiftCustomTasks,
    signOffDate:       '',
    signOffNotes:      '',
    signedOff:         false,
    shift5Fixed:       mkTasks(SHIFT_5_FIXED),
  };
}

// ─── Progress helpers ─────────────────────────────────────────────────────────
function countTasks(obj) {
  const vals = Object.values(obj);
  return { done: vals.filter(Boolean).length, total: vals.length };
}

function totalProgress(state) {
  const allChecks = [
    ...Object.values(state.processTasks),
    ...Object.values(state.cleaningAreaTasks),
    ...Object.values(state.valuesTasks),
    ...SHIFT_TASKS.flatMap(s => Object.values(state.shiftTasks[s.id] || {})),
    ...Object.values(state.shift5Fixed),
  ];
  const done  = allChecks.filter(Boolean).length;
  const total = allChecks.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Tick({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        border: `2px solid ${checked ? CYAN : 'rgba(255,255,255,0.20)'}`,
        background: checked ? CYAN : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {checked && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>✓</span>}
    </button>
  );
}

function Field({ label, value, onChange, multiline = false, placeholder = '' }) {
  const inputStyle = {
    background: SURFACE2, border: '1.5px solid rgba(255,255,255,0.12)', color: TEXT1,
    borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
    boxSizing: 'border-box', fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none', resize: multiline ? 'vertical' : 'none',
    minHeight: multiline ? 80 : undefined,
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </label>
      {multiline
        ? <textarea style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} />
        : <input    style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
    </div>
  );
}

function SectionCard({ title, accent = false, children, right = null }) {
  return (
    <div style={{ background: SURFACE, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{
        background: accent ? CYAN : SURFACE2,
        padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ color: TEXT1, fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>{title}</span>
        {right}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

function TaskRow({ task, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <Tick checked={checked} onChange={onChange} />
      <span style={{ flex: 1, fontSize: 14, color: checked ? TEXT2 : TEXT1, textDecoration: checked ? 'line-through' : 'none', transition: 'color 0.15s' }}>
        {task.label}
      </span>
      {task.mins && (
        <span style={{ background: CYAN_LIGHT, color: CYAN, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' }}>
          {task.mins} min
        </span>
      )}
    </div>
  );
}

function ProgressRing({ pct }) {
  const r = 44, circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  return (
    <svg width={100} height={100} style={{ display: 'block' }}>
      <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
      <circle
        cx={50} cy={50} r={r} fill="none"
        stroke={pct === 100 ? CYAN : CYAN}
        strokeWidth={8} strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text x={50} y={55} textAnchor="middle" fill={TEXT1} fontSize={20} fontWeight={800} fontFamily="Inter,system-ui,sans-serif">
        {pct}%
      </text>
    </svg>
  );
}

// ─── Page: Overview ───────────────────────────────────────────────────────────
function Overview({ state, setState }) {
  const prog = totalProgress(state);

  const shiftProgress = SHIFT_TASKS.map(s => {
    const { done, total } = countTasks(state.shiftTasks[s.id]);
    return { id: s.id, title: s.title, done, total };
  });

  return (
    <div>
      {/* Summary card */}
      <div style={{ background: SURFACE, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28 }}>
        <ProgressRing pct={prog.pct} />
        <div>
          <div style={{ color: TEXT2, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Overall Progress</div>
          <div style={{ color: TEXT1, fontSize: 28, fontWeight: 800 }}>{prog.done} <span style={{ color: TEXT3, fontSize: 16, fontWeight: 500 }}>/ {prog.total} tasks</span></div>
          {prog.pct === 100 && <div style={{ color: CYAN, fontSize: 13, fontWeight: 700, marginTop: 6 }}>Induction complete!</div>}
        </div>
      </div>

      {/* Employee details */}
      <SectionCard title="Employee Details">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Employee Name"    value={state.employeeName}   onChange={v => setState(s => ({ ...s, employeeName: v }))}   placeholder="Full name" />
          <Field label="Start Date"       value={state.startDate}      onChange={v => setState(s => ({ ...s, startDate: v }))}      placeholder="DD/MM/YYYY" />
          <Field label="Supervisor"       value={state.supervisorName} onChange={v => setState(s => ({ ...s, supervisorName: v }))} placeholder="Supervisor name" />
        </div>
      </SectionCard>

      {/* Shift progress summary */}
      <SectionCard title="Shift Checklist Progress">
        {shiftProgress.map(sp => (
          <div key={sp.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: TEXT1 }}>{sp.title}</span>
              <span style={{ fontSize: 12, color: TEXT2 }}>{sp.done}/{sp.total}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: CYAN, width: `${sp.total ? (sp.done / sp.total) * 100 : 0}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── Page: Processes ──────────────────────────────────────────────────────────
function ProcessesPage({ state, setState }) {
  const { done, total } = countTasks(state.processTasks);
  return (
    <div>
      <SectionCard
        title="Induction Processes"
        accent
        right={<span style={{ color: TEXT1, fontSize: 12, fontWeight: 700 }}>{done}/{total}</span>}
      >
        {PROCESSES_TASKS.map(t => (
          <TaskRow
            key={t.id} task={t}
            checked={state.processTasks[t.id]}
            onChange={() => setState(s => ({ ...s, processTasks: { ...s.processTasks, [t.id]: !s.processTasks[t.id] } }))}
          />
        ))}
      </SectionCard>
      <SectionCard title="Notes">
        <Field label="Process Notes" multiline value={state.processNotes} onChange={v => setState(s => ({ ...s, processNotes: v }))} placeholder="Any notes on the induction process…" />
      </SectionCard>
    </div>
  );
}

// ─── Page: Cleaning Areas ─────────────────────────────────────────────────────
function CleaningAreasPage({ state, setState }) {
  const { done, total } = countTasks(state.cleaningAreaTasks);
  return (
    <div>
      <SectionCard
        title="Cleaning Areas Covered"
        accent
        right={<span style={{ color: TEXT1, fontSize: 12, fontWeight: 700 }}>{done}/{total}</span>}
      >
        {CLEANING_AREAS.map(t => (
          <TaskRow
            key={t.id} task={t}
            checked={state.cleaningAreaTasks[t.id]}
            onChange={() => setState(s => ({ ...s, cleaningAreaTasks: { ...s.cleaningAreaTasks, [t.id]: !s.cleaningAreaTasks[t.id] } }))}
          />
        ))}
      </SectionCard>
      <SectionCard title="Notes">
        <Field label="Cleaning Area Notes" multiline value={state.cleaningNotes} onChange={v => setState(s => ({ ...s, cleaningNotes: v }))} placeholder="Any notes on areas covered…" />
      </SectionCard>
    </div>
  );
}

// ─── Page: Values ─────────────────────────────────────────────────────────────
function ValuesPage({ state, setState }) {
  const { done, total } = countTasks(state.valuesTasks);
  return (
    <div>
      <SectionCard
        title="LCA Values & Conduct"
        accent
        right={<span style={{ color: TEXT1, fontSize: 12, fontWeight: 700 }}>{done}/{total}</span>}
      >
        {VALUES_TASKS.map(t => (
          <TaskRow
            key={t.id} task={t}
            checked={state.valuesTasks[t.id]}
            onChange={() => setState(s => ({ ...s, valuesTasks: { ...s.valuesTasks, [t.id]: !s.valuesTasks[t.id] } }))}
          />
        ))}
      </SectionCard>
      <SectionCard title="Notes">
        <Field label="Values Notes" multiline value={state.valuesNotes} onChange={v => setState(s => ({ ...s, valuesNotes: v }))} placeholder="Any notes on values discussion…" />
      </SectionCard>
    </div>
  );
}

// ─── Page: Shift ──────────────────────────────────────────────────────────────
function ShiftPage({ shift, state, setState }) {
  const tasks      = state.shiftTasks[shift.id] || {};
  const { done, total } = countTasks(tasks);
  const verdict    = state.shiftVerdict[shift.id];
  const notes      = state.shiftNotes[shift.id] || '';
  const customs    = state.shiftCustomTasks[shift.id] || [];

  const setVerdict = v => setState(s => ({ ...s, shiftVerdict: { ...s.shiftVerdict, [shift.id]: v } }));
  const setNotes   = v => setState(s => ({ ...s, shiftNotes:   { ...s.shiftNotes,   [shift.id]: v } }));

  const addCustom = () => setState(s => ({
    ...s,
    shiftCustomTasks: { ...s.shiftCustomTasks, [shift.id]: [...(s.shiftCustomTasks[shift.id] || []), { id: Date.now(), text: '', done: false }] },
  }));

  const updateCustomText = (cid, text) => setState(s => ({
    ...s,
    shiftCustomTasks: {
      ...s.shiftCustomTasks,
      [shift.id]: (s.shiftCustomTasks[shift.id] || []).map(c => c.id === cid ? { ...c, text } : c),
    },
  }));

  const toggleCustom = cid => setState(s => ({
    ...s,
    shiftCustomTasks: {
      ...s.shiftCustomTasks,
      [shift.id]: (s.shiftCustomTasks[shift.id] || []).map(c => c.id === cid ? { ...c, done: !c.done } : c),
    },
  }));

  const removeCustom = cid => setState(s => ({
    ...s,
    shiftCustomTasks: {
      ...s.shiftCustomTasks,
      [shift.id]: (s.shiftCustomTasks[shift.id] || []).filter(c => c.id !== cid),
    },
  }));

  return (
    <div>
      {/* Intro */}
      <div style={{ background: SURFACE, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <div style={{ color: TEXT2, fontSize: 13, lineHeight: 1.6 }}>{SHIFT_INTROS[shift.id]}</div>
      </div>

      {/* Tasks */}
      <SectionCard
        title="Shift Tasks"
        accent
        right={<span style={{ color: TEXT1, fontSize: 12, fontWeight: 700 }}>{done}/{total}</span>}
      >
        {shift.tasks.map(t => (
          <TaskRow
            key={t.id} task={t}
            checked={tasks[t.id]}
            onChange={() => setState(s => ({
              ...s,
              shiftTasks: { ...s.shiftTasks, [shift.id]: { ...s.shiftTasks[shift.id], [t.id]: !s.shiftTasks[shift.id][t.id] } },
            }))}
          />
        ))}
      </SectionCard>

      {/* Shift 5 fixed criteria */}
      {shift.id === 'shift5' && (
        <SectionCard title="Sign-Off Criteria" accent>
          {SHIFT_5_FIXED.map(t => (
            <TaskRow
              key={t.id} task={t}
              checked={state.shift5Fixed[t.id]}
              onChange={() => setState(s => ({ ...s, shift5Fixed: { ...s.shift5Fixed, [t.id]: !s.shift5Fixed[t.id] } }))}
            />
          ))}
        </SectionCard>
      )}

      {/* Custom tasks */}
      <SectionCard title="Additional Observations">
        {customs.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, background: 'rgba(0,200,150,0.07)', borderRadius: 8, padding: '8px 10px' }}>
            <Tick checked={c.done} onChange={() => toggleCustom(c.id)} />
            <input
              value={c.text}
              onChange={e => updateCustomText(c.id, e.target.value)}
              placeholder="Add observation…"
              style={{ flex: 1, background: 'transparent', border: 'none', color: TEXT1, fontSize: 14, outline: 'none', fontFamily: "'Inter', system-ui, sans-serif" }}
            />
            <button onClick={() => removeCustom(c.id)} style={{ background: 'none', border: 'none', color: TEXT3, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
        ))}
        <button
          onClick={addCustom}
          style={{ background: 'none', border: `1px dashed ${CYAN}`, color: CYAN, borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
        >
          + Add observation
        </button>
      </SectionCard>

      {/* Shift verdict */}
      <SectionCard title="Shift Outcome">
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => setVerdict('pass')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: `2px solid ${verdict === 'pass' ? '#22c55e' : 'rgba(255,255,255,0.12)'}`,
              background: verdict === 'pass' ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: verdict === 'pass' ? '#22c55e' : TEXT2,
              transition: 'all 0.15s',
            }}
          >
            Pass
          </button>
          <button
            onClick={() => setVerdict('needs-work')}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: `2px solid ${verdict === 'needs-work' ? CYAN : 'rgba(255,255,255,0.12)'}`,
              background: verdict === 'needs-work' ? CYAN_LIGHT : 'transparent',
              color: verdict === 'needs-work' ? CYAN : TEXT2,
              transition: 'all 0.15s',
            }}
          >
            Needs Work
          </button>
        </div>
        <Field label="Shift Notes" multiline value={notes} onChange={setNotes} placeholder="Notes on this shift…" />
      </SectionCard>
    </div>
  );
}

// ─── Page: Sign-Off ───────────────────────────────────────────────────────────
function SignOffPage({ state, setState }) {
  const prog = totalProgress(state);
  return (
    <div>
      <SectionCard title="Induction Sign-Off" accent>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <ProgressRing pct={prog.pct} />
            <div>
              <div style={{ color: TEXT2, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Overall Completion</div>
              <div style={{ color: TEXT1, fontSize: 22, fontWeight: 800 }}>{prog.done}/{prog.total} tasks</div>
            </div>
          </div>
          {prog.pct < 100 && (
            <div style={{ background: CYAN_LIGHT, border: `1px solid ${CYAN}`, borderRadius: 8, padding: '10px 14px', color: CYAN, fontSize: 13, fontWeight: 600 }}>
              {prog.total - prog.done} task{prog.total - prog.done !== 1 ? 's' : ''} still incomplete. Complete all tasks before final sign-off.
            </div>
          )}
        </div>

        <Field label="Sign-Off Date" value={state.signOffDate} onChange={v => setState(s => ({ ...s, signOffDate: v }))} placeholder="DD/MM/YYYY" />
        <Field label="Sign-Off Notes" multiline value={state.signOffNotes} onChange={v => setState(s => ({ ...s, signOffNotes: v }))} placeholder="Any final notes or conditions…" />

        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setState(s => ({ ...s, signedOff: !s.signedOff }))}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: 'pointer',
              border: `2px solid ${state.signedOff ? '#22c55e' : CYAN}`,
              background: state.signedOff ? 'rgba(34,197,94,0.15)' : CYAN_LIGHT,
              color: state.signedOff ? '#22c55e' : CYAN,
              transition: 'all 0.2s',
            }}
          >
            {state.signedOff ? '✓ Induction Signed Off' : 'Mark Induction as Complete'}
          </button>
        </div>
      </SectionCard>

      {/* Shift verdict summary */}
      <SectionCard title="Shift Outcomes Summary">
        {SHIFT_TASKS.map(s => {
          const v = state.shiftVerdict[s.id];
          return (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 13, color: TEXT1 }}>{s.title}</span>
              {v === 'pass'       && <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e',  fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px' }}>Pass</span>}
              {v === 'needs-work' && <span style={{ background: CYAN_LIGHT,             color: CYAN,       fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px' }}>Needs Work</span>}
              {!v                 && <span style={{ background: 'rgba(255,255,255,0.06)', color: TEXT3,    fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px' }}>Pending</span>}
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',    label: 'Overview' },
  { id: 'processes',   label: 'Processes' },
  { id: 'areas',       label: 'Cleaning Areas' },
  { id: 'values',      label: 'Values' },
  ...SHIFT_TASKS.map(s => ({ id: s.id, label: s.title })),
  { id: 'signoff',     label: 'Sign Off' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InductionTraining() {
  const [staffList,       setStaffList]       = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [state,           setState]           = useState(initState);
  const [page,            setPage]            = useState('overview');
  const [menuOpen,        setMenuOpen]        = useState(false);

  // Load staff list
  useEffect(() => {
    api.get('/staff').then(r => setStaffList(r.data)).catch(() => {});
  }, []);

  // Auto-save
  useEffect(() => {
    if (selectedStaffId) {
      localStorage.setItem('lca-induction-' + selectedStaffId, JSON.stringify(state));
    }
  }, [state, selectedStaffId]);

  function handleSelectStaff(id) {
    setSelectedStaffId(id);
    if (!id) return;
    const saved = localStorage.getItem('lca-induction-' + id);
    if (saved) {
      try { setState(JSON.parse(saved)); return; } catch {}
    }
    const staffMember = staffList.find(s => String(s.id) === String(id));
    const fresh = initState();
    if (staffMember) fresh.employeeName = staffMember.name;
    setState(fresh);
  }

  const currentNavIdx = NAV.findIndex(n => n.id === page);

  const renderPage = () => {
    if (page === 'overview')  return <Overview         state={state} setState={setState} />;
    if (page === 'processes') return <ProcessesPage    state={state} setState={setState} />;
    if (page === 'areas')     return <CleaningAreasPage state={state} setState={setState} />;
    if (page === 'values')    return <ValuesPage        state={state} setState={setState} />;
    if (page === 'signoff')   return <SignOffPage       state={state} setState={setState} />;
    const shift = SHIFT_TASKS.find(s => s.id === page);
    if (shift) return <ShiftPage shift={shift} state={state} setState={setState} />;
    return null;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Induction Training Plan</h1>
      </div>

      {/* Staff selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          SELECT EMPLOYEE
        </label>
        <select
          value={selectedStaffId}
          onChange={e => handleSelectStaff(e.target.value)}
          style={{
            background: SURFACE, border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 8,
            padding: '10px 14px', color: selectedStaffId ? TEXT1 : TEXT2, fontSize: 14,
            width: '100%', maxWidth: 360, fontFamily: "'Inter', system-ui, sans-serif",
            outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">Choose a team member to begin...</option>
          {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* No staff selected */}
      {!selectedStaffId && (
        <div style={{ background: SURFACE, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            <span style={{ color: CYAN, fontWeight: 900, fontSize: 28, fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: 2 }}>LCA</span>
          </div>
          <div style={{ color: TEXT2, fontSize: 15 }}>Select a team member above to start or continue their induction.</div>
        </div>
      )}

      {/* Main content */}
      {selectedStaffId && (
        <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

          {/* Page header bar */}
          <div style={{ background: SURFACE, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ color: CYAN, fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>LCA</span>
              <div>
                <div style={{ color: TEXT1, fontWeight: 700, fontSize: 15 }}>{state.employeeName || 'New Employee'}</div>
                <div style={{ color: TEXT2, fontSize: 12 }}>{state.startDate ? `Started ${state.startDate}` : 'Start date not set'}</div>
              </div>
            </div>
            {state.signedOff && (
              <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '4px 12px' }}>
                Signed Off
              </span>
            )}
          </div>

          {/* Mobile nav menu toggle */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: SURFACE, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 10,
                padding: '10px 16px', color: TEXT1, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                width: '100%',
              }}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{NAV.find(n => n.id === page)?.label}</span>
              <span style={{ color: TEXT2, fontSize: 11 }}>{menuOpen ? '▲' : '▼'} Menu</span>
            </button>

            {menuOpen && (
              <div style={{ background: SURFACE2, border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                {NAV.map((n, i) => (
                  <button
                    key={n.id}
                    onClick={() => { setPage(n.id); setMenuOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '11px 16px', fontSize: 13, cursor: 'pointer',
                      background: n.id === page ? CYAN_LIGHT : 'transparent',
                      color: n.id === page ? CYAN : TEXT2,
                      fontWeight: n.id === page ? 700 : 400,
                      border: 'none', borderBottom: i < NAV.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          {renderPage()}

          {/* Bottom navigation */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button
              disabled={currentNavIdx <= 0}
              onClick={() => currentNavIdx > 0 && setPage(NAV[currentNavIdx - 1].id)}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: currentNavIdx <= 0 ? 'not-allowed' : 'pointer',
                border: '1.5px solid rgba(255,255,255,0.12)', background: SURFACE, color: currentNavIdx <= 0 ? TEXT3 : TEXT2,
                opacity: currentNavIdx <= 0 ? 0.5 : 1, transition: 'all 0.15s',
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Previous
            </button>
            <button
              disabled={currentNavIdx >= NAV.length - 1}
              onClick={() => currentNavIdx < NAV.length - 1 && setPage(NAV[currentNavIdx + 1].id)}
              style={{
                flex: 2, padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: currentNavIdx >= NAV.length - 1 ? 'not-allowed' : 'pointer',
                border: 'none', background: currentNavIdx >= NAV.length - 1 ? 'rgba(0,200,150,0.3)' : CYAN, color: '#fff',
                opacity: currentNavIdx >= NAV.length - 1 ? 0.5 : 1, transition: 'all 0.15s',
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Next: {currentNavIdx < NAV.length - 1 ? NAV[currentNavIdx + 1].label : 'Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
