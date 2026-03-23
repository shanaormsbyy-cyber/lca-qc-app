import React, { useEffect, useRef, useState } from 'react';
import api from '../api';

// ─── Colours ──────────────────────────────────────────────────────────────────
const CYAN       = '#00c896';
const CYAN_LIGHT = 'rgba(0,200,150,0.10)';
const BORDER     = 'rgba(255,255,255,0.10)';
const SURFACE    = '#112240';
const SURFACE2   = '#0d1b36';
const TEXT1      = '#ffffff';
const TEXT2      = '#94a3b8';

// ─── Exact data from training document ───────────────────────────────────────
const PROCESSES_TASKS = [
  "Employee has signed in to all necessary software accounts.",
  "Demonstrated how to use staff communication channels and what to use them for.",
  "Clocking in and out process shown.",
  "Shown how lockboxes and keys work, where to find access codes etc.",
  "Told of the correct channels for contact, including who to contact depending on specific issues or queries: Pay, Complaints, etc.",
  "Adequate training provided on any checklist software used.",
  "Demonstrated how to visually inspect and maintain equipment.",
  "House navigation explained (clean from back to front). Top to Bottom, left to right in a circle around the room process explained, as well as the 'room by room' process.",
];

const CLEANING_AREAS = [
  "System", "Bathroom", "Kitchen", "Bedroom",
  "Living Room", "Laundry", "Dusting", "Vacuuming", "Mopping", "Final Touches",
];

const VALUES_TASKS = [
  "Educated on business core values and their meanings including how to conduct their behaviour and attitude in accordance with the values.",
  "Advised on the call in policy, including how to call in & what is considered acceptable notice, as well as the nature of casual / on call employment.",
  "Employee advised of the scope of services for their role and shown/told what is considered 'Outside the scope of a standard job'. Employee advised on steps to take if a job falls outside the standard policy (refer to excessive cleaning policy).",
  "Advised on the 3-strike policy, how warnings are issued and what can warrant one, advised on PIPs and why they're issued and how you expect feedback to be handled.",
  "Advised of the code of conduct policy and the expectations during a clean.",
  "Advised on equipment return policies in the event of a termination of employment.",
  "Shown 'What good looks like' in terms of presentation and proper cleaning.",
  "Advised of how long specific tasks should take and how long is acceptable per each room in each house / property.",
];

const SHIFT_TASKS = {
  1: [
    { time: "~30 mins", desc: "Introduce trainee and tell them about how their shift will go. Be positive and friendly. Note their punctuality, attitude, and how they present themself." },
    { time: "~30 mins", desc: "Demonstrate how to clean a bathroom step-by-step, explaining each action slowly." },
    { time: "~20 mins", desc: "Let the trainee clean a second bathroom using the same method, watching briefly to ensure they understand, then give them space to clean on their own. While they clean, work on another task, like cleaning the kitchen." },
    { time: "~5 mins",  desc: "Review their work in the bathroom and provide feedback." },
    { time: "~15 mins", desc: "Show the trainee how to make a bed, demonstrate the end product including how throws, pillows and decorative pillows are presented." },
    { time: "~20 mins", desc: "Have the trainee make a bed on their own, giving feedback as needed." },
    { time: "~5 mins",  desc: "Once the trainee has made a bed, show them how to dust, from top to bottom, lifting things up." },
    { time: "~15 mins", desc: "Have them dust the entire house whilst you're vacuuming, pay special attention to the level of detail taken during dusting and any 'hotspots' — Provide feedback where necessary." },
    { time: "~15 mins", desc: "Teach the trainee how to mop correctly, from the back of the room out. Demonstrate mopping in the kitchen. Have the employee mop the bathrooms; while they're mopping, complete any checklists / fill out their training forms accordingly." },
  ],
  2: [
    { time: "~30 mins", desc: "Demonstrate how to clean a kitchen step-by-step, explaining each action slowly. Let the trainee do the entire clean. Observe and give pointers where needed." },
    { time: "~15 mins", desc: "Let the trainee clean one of the bathrooms. Observe and give pointers where needed. Sign-off on the trainee's bathroom work with them beside you." },
    { time: "~25 mins", desc: "Let the trainee make 2 beds — 1 single + 1 king or queen. Do a bathroom and the final bed whilst the trainee is doing their beds. Check their beds once complete, provide any feedback where necessary." },
    { time: "~5 mins",  desc: "Let the trainee start vacuuming the floors." },
    { time: "~5 mins",  desc: "Show them how to set up the vacuum and explain correct usage. Demonstrate proper technique, how to grid, and going back-to-front, getting behind doors and deep in corners etc." },
    { time: "~20 mins", desc: "Let the trainee vacuum the whole house. Finish dusting / checklists whilst the trainee is vacuuming — Mop behind them." },
  ],
  3: [
    { time: "~30 mins",    desc: "Let the trainee clean a bathroom by themself. If the house has a second bathroom, clean that while they clean the other one. Walk through their clean of the bathroom afterwards and provide feedback." },
    { time: "~30–45 mins", desc: "Give them a quick refresher of a kitchen clean. Let them clean the whole kitchen. Observe and correct any small mistakes as they go. Reiterate the system (left to right, top down, polish last, etc)." },
    { time: "~15–20 mins", desc: "Explain how to clean a bedroom from start to finish. Walk around the room and point things out, but do not clean anything. Let the trainee clean the whole bedroom, from making beds to dusting, while you watch and give pointers." },
    { time: "~15–20 mins", desc: "Let the trainee do the other bedroom unsupervised (beds, dusting). Finish dusting the rest of the house and completing any other tasks while you wait. Check off on their work with them once they've finished and provide feedback." },
    { time: "~15 mins",    desc: "Explain how to use checklist software, give any tips or tricks to make the process as efficient as possible. Have the trainee complete the checklist for 1 bedroom, 1 bathroom. Observe, give pointers on efficiency, then have the trainee watch you complete the rest." },
    { time: "~10–15 mins", desc: "Do a walkthrough of the home with the trainee beside you to look at final touches and presentation. Explain how presentation matters, tips they can use, and give feedback." },
    { time: "~15–20 mins", desc: "Let the trainee start vacuuming the floors." },
    { time: "~15–20 mins", desc: "Mop behind the trainee and finish up." },
  ],
  4: [
    { time: "~30 mins",    desc: "Let the trainee clean both bathrooms by themself. Observe and give direction where needed. If they have learned any bad habits, now is the time to correct them. Focus on direction: left to right, top to bottom, making sure they don't go back and forth re-cleaning or over-cleaning areas." },
    { time: "~20–30 mins", desc: "Let the trainee clean the entire kitchen. Whilst they're cleaning the kitchen, make a bed if more than 2 beds have been slept in. Ensure there are TWO beds left for the trainee to make." },
    { time: "~20–25 mins", desc: "Let the trainee make at least 2 beds in the house. Watch them as they go and give pointers / correct any mistakes." },
    { time: "~10 mins",    desc: "Let the trainee dust the rest of the house on their own. Begin to plan for Shift 5 while you wait. If you have identified any areas of weakness, make sure these are focussed on in the next shift. Write these things down." },
    { time: "~15 mins",    desc: "Quickly check off on all their dusting work and provide any feedback." },
    { time: "~15–20 mins", desc: "Give the trainee a quick refresher on how to vacuum the correct way. Let them vacuum the entire house. Observe for 5–10 minutes to ensure the system is being followed and give direction where needed." },
    { time: "~15 mins",    desc: "If running behind time, begin mopping while they vacuum. If not, wait for them to finish vacuuming and let them mop the whole house as well. Ensure they use proper technique and give pointers if necessary." },
  ],
};

const SHIFT_INTROS = {
  5: "This is where trainees should be shown time management and efficiency. Fill in your training plan based on observations from the previous 4 training sessions — list items and time allocations for each task. This session should take roughly the time it would take for the house to be completed by an experienced team member. Ensure extra tasks are captured (Laundry, garage, etc).",
  6: "Time management & attention to detail is the main focus of this session. Plan this session around any feedback you noted in previous sessions. Trainees should be confident in their job at this stage and their error rate should be minimal. Time targets should be at least 90% achieved by this stage.",
  7: "This is the trainee's final day of training before going solo. Ensure any issues have been addressed and rectified by this stage. Trainee should be confident in software, cleaning processes, presentation standards and overall cleaning standards. Ask questions, ensure they're confident. Plan this session around ensuring the trainee is 'Ready to leave the nest'.",
};

const SHIFT_5_FIXED = [
  { time: "~15 mins", desc: "Software training — Allow the trainee to complete their own checklist for this entire clean. Time them & provide pointers and tips. Target: under 10 minutes to complete a checklist." },
];

// ─── State helpers ─────────────────────────────────────────────────────────────
function mkTasks(n) { return Array.from({ length: n }, () => ({ checked: false, comment: '' })); }

function initState() {
  return {
    employeeName: '', inductionDate: '',
    overview: {
      contractSigned: false, policiesSigned: false,
      shifts: [false, false, false, false, false, false, false],
      processesAndSystems: false, valuesAndGuidelines: false, signOff: false,
    },
    processes: mkTasks(PROCESSES_TASKS.length),
    cleaningAreas: Object.fromEntries(CLEANING_AREAS.map(a => [a, false])),
    values: mkTasks(VALUES_TASKS.length),
    shifts: {
      1: { trainer: '', date: '', tasks: mkTasks(SHIFT_TASKS[1].length) },
      2: { trainer: '', date: '', tasks: mkTasks(SHIFT_TASKS[2].length), verdict: null, summary: '' },
      3: { trainer: '', date: '', tasks: mkTasks(SHIFT_TASKS[3].length) },
      4: { trainer: '', date: '', tasks: mkTasks(SHIFT_TASKS[4].length) },
      5: { trainer: '', date: '', tasks: mkTasks(SHIFT_5_FIXED.length), custom: [] },
      6: { trainer: '', date: '', custom: [] },
      7: { trainer: '', date: '', custom: [] },
    },
    signOff: { supervisorName: '', company: '', employeePrint: '', trainerPrint: '', supervisorSig: null, employeeSig: null, trainerSig: null },
  };
}

// ─── Shared input style ────────────────────────────────────────────────────────
const INPUT = {
  background: SURFACE2, border: `1.5px solid rgba(255,255,255,0.15)`,
  color: TEXT1, colorScheme: 'dark', borderRadius: 8, padding: '8px 12px',
  fontSize: 14, width: '100%', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

// ─── UI Primitives ─────────────────────────────────────────────────────────────
function Tick({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 26, height: 26, minWidth: 26, borderRadius: 6, flexShrink: 0,
      border: `2px solid ${checked ? CYAN : 'rgba(255,255,255,0.20)'}`,
      background: checked ? CYAN : 'transparent',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      {checked && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>✓</span>}
    </button>
  );
}

function NoteInput({ value, onChange }) {
  return (
    <input
      placeholder="Add a note…"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...INPUT, fontSize: 13, color: TEXT2, padding: '6px 10px', marginTop: 6 }}
    />
  );
}

function SectionCard({ title, badge, children, accent }) {
  return (
    <div style={{ background: SURFACE, borderRadius: 14, border: `1.5px solid rgba(255,255,255,0.08)`, marginBottom: 20 }}>
      <div style={{
        background: accent ? CYAN : SURFACE2,
        borderBottom: `1.5px solid rgba(255,255,255,0.08)`,
        padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: accent ? '#0a1628' : TEXT1 }}>{title}</span>
        {badge !== undefined && (
          <span style={{
            marginLeft: 'auto', background: accent ? 'rgba(0,0,0,0.15)' : CYAN,
            color: accent ? '#0a1628' : '#0a1628', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700,
          }}>{badge}</span>
        )}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

function TaskRow({ time, desc, checked, comment, onCheck, onComment }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 32px', gap: 12, padding: '12px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'start' }}>
      <div style={{ background: CYAN_LIGHT, color: CYAN, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center', marginTop: 2 }}>{time}</div>
      <div>
        <p style={{ fontSize: 14, color: TEXT1, margin: '0 0 4px', lineHeight: 1.55 }}>{desc}</p>
        <NoteInput value={comment} onChange={onComment} />
      </div>
      <Tick checked={checked} onChange={onCheck} />
    </div>
  );
}

// ─── Pages ──────────────────────────────────────────────────────────────────────
function Overview({ state, set }) {
  const ov = state.overview;
  const items = [ov.contractSigned, ov.policiesSigned, ...ov.shifts, ov.processesAndSystems, ov.valuesAndGuidelines, ov.signOff];
  const done = items.filter(Boolean).length;
  const pct = Math.round((done / items.length) * 100);

  const toggle = key => set(s => ({ ...s, overview: { ...s.overview, [key]: !s.overview[key] } }));
  const toggleShift = i => set(s => {
    const shifts = [...s.overview.shifts]; shifts[i] = !shifts[i];
    return { ...s, overview: { ...s.overview, shifts } };
  });

  const rows = [
    { label: 'Contract / IRD Forms Signed', key: 'contractSigned' },
    { label: 'Employee Policies Signed', key: 'policiesSigned' },
    ...Array.from({ length: 7 }, (_, i) => ({ label: `Shift ${i + 1}`, shiftIdx: i })),
    { label: 'Processes & Systems', key: 'processesAndSystems' },
    { label: 'Values & Guidelines', key: 'valuesAndGuidelines' },
    { label: 'Sign-Off Sheet', key: 'signOff' },
  ];

  return (
    <div>
      <SectionCard title="Employee Details">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Employee Name</label>
            <input value={state.employeeName} onChange={e => set(s => ({ ...s, employeeName: e.target.value }))}
              placeholder="Full name" style={INPUT} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Induction Date</label>
            <input type="date" value={state.inductionDate} onChange={e => set(s => ({ ...s, inductionDate: e.target.value }))}
              style={INPUT} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Overall Progress" accent>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: '#0a1628', lineHeight: 1 }}>{pct}%</div>
          <div>
            <div style={{ color: '#0a1628', fontWeight: 700, fontSize: 18 }}>{done} / {items.length} complete</div>
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13, marginTop: 2 }}>Induction checklist progress</div>
          </div>
          <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.15)', borderRadius: 99, overflow: 'hidden', maxWidth: 200, marginLeft: 'auto' }}>
            <div style={{ height: '100%', background: '#0a1628', width: `${pct}%`, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Completion Checklist" badge={`${done}/${items.length}`}>
        {rows.map((row, i) => {
          const checked = row.shiftIdx !== undefined ? ov.shifts[row.shiftIdx] : ov[row.key];
          const toggle_ = row.shiftIdx !== undefined ? () => toggleShift(row.shiftIdx) : () => toggle(row.key);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
              <span style={{ fontSize: 14, color: checked ? TEXT2 : TEXT1, textDecoration: checked ? 'line-through' : 'none' }}>{row.label}</span>
              <Tick checked={checked} onChange={toggle_} />
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

function ProcessesPage({ state, set }) {
  const done = state.processes.filter(t => t.checked).length;
  const toggle = i => set(s => { const p = [...s.processes]; p[i] = { ...p[i], checked: !p[i].checked }; return { ...s, processes: p }; });
  const setNote = (i, v) => set(s => { const p = [...s.processes]; p[i] = { ...p[i], comment: v }; return { ...s, processes: p }; });
  const toggleArea = a => set(s => ({ ...s, cleaningAreas: { ...s.cleaningAreas, [a]: !s.cleaningAreas[a] } }));

  return (
    <div>
      <SectionCard title="Processes & System Usage" badge={`${done}/${PROCESSES_TASKS.length}`}>
        {PROCESSES_TASKS.map((task, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: i < PROCESSES_TASKS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <Tick checked={state.processes[i].checked} onChange={() => toggle(i)} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, color: state.processes[i].checked ? TEXT2 : TEXT1, margin: 0, lineHeight: 1.55, textDecoration: state.processes[i].checked ? 'line-through' : 'none' }}>{task}</p>
              <NoteInput value={state.processes[i].comment} onChange={v => setNote(i, v)} />
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Demonstrated How to Clean — mark each area completed">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {CLEANING_AREAS.map(area => {
            const checked = state.cleaningAreas[area];
            return (
              <button key={area} onClick={() => toggleArea(area)} style={{
                border: `2px solid ${checked ? CYAN : BORDER}`,
                background: checked ? CYAN_LIGHT : SURFACE2,
                borderRadius: 9, padding: '10px 6px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 18 }}>{checked ? '✓' : '○'}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: checked ? CYAN : TEXT2, letterSpacing: 0.5 }}>{area.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function ValuesPage({ state, set }) {
  const done = state.values.filter(t => t.checked).length;
  const toggle = i => set(s => { const v = [...s.values]; v[i] = { ...v[i], checked: !v[i].checked }; return { ...s, values: v }; });
  const setNote = (i, val) => set(s => { const v = [...s.values]; v[i] = { ...v[i], comment: val }; return { ...s, values: v }; });

  return (
    <SectionCard title="Values, Guidelines & Expectations" badge={`${done}/${VALUES_TASKS.length}`}>
      {VALUES_TASKS.map((task, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: i < VALUES_TASKS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
          <Tick checked={state.values[i].checked} onChange={() => toggle(i)} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, color: state.values[i].checked ? TEXT2 : TEXT1, margin: 0, lineHeight: 1.55, textDecoration: state.values[i].checked ? 'line-through' : 'none' }}>{task}</p>
            <NoteInput value={state.values[i].comment} onChange={v => setNote(i, v)} />
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function ShiftPage({ shiftNum, state, set }) {
  const shift = state.shifts[shiftNum];
  const fixedTasks = shiftNum <= 4 ? SHIFT_TASKS[shiftNum] : SHIFT_5_FIXED;
  const isCustom = shiftNum >= 5;
  const intro = SHIFT_INTROS[shiftNum];
  const hasVerdict = shiftNum === 2;

  const setMeta = (key, val) => set(s => ({ ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], [key]: val } } }));

  const toggleTask = i => set(s => {
    const t = [...s.shifts[shiftNum].tasks];
    t[i] = { ...t[i], checked: !t[i].checked };
    return { ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], tasks: t } } };
  });
  const setTaskNote = (i, v) => set(s => {
    const t = [...s.shifts[shiftNum].tasks];
    t[i] = { ...t[i], comment: v };
    return { ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], tasks: t } } };
  });

  const addCustom = () => set(s => {
    const custom = [...(s.shifts[shiftNum].custom || []), { time: '', desc: '', checked: false, comment: '' }];
    return { ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], custom } } };
  });
  const removeCustom = i => set(s => {
    const custom = (s.shifts[shiftNum].custom || []).filter((_, idx) => idx !== i);
    return { ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], custom } } };
  });
  const setCustomField = (i, key, val) => set(s => {
    const custom = [...(s.shifts[shiftNum].custom || [])];
    custom[i] = { ...custom[i], [key]: val };
    return { ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], custom } } };
  });
  const toggleCustom = i => set(s => {
    const custom = [...(s.shifts[shiftNum].custom || [])];
    custom[i] = { ...custom[i], checked: !custom[i].checked };
    return { ...s, shifts: { ...s.shifts, [shiftNum]: { ...s.shifts[shiftNum], custom } } };
  });

  const fixedDone = (shift.tasks || []).filter(t => t.checked).length;
  const customDone = (shift.custom || []).filter(t => t.checked).length;
  const totalDone = fixedDone + customDone;
  const totalCount = (shift.tasks ? shift.tasks.length : 0) + (shift.custom ? shift.custom.length : 0);

  const shiftLabels = { 1: 'Trial — Supervised', 2: 'Trial — Supervised', 3: 'Training — Supervised', 4: 'Training — Supervised', 5: 'Training — Supervised', 6: 'Training — Supervised', 7: 'Training — Final Supervised' };

  return (
    <div>
      <SectionCard title={`Shift ${shiftNum} — ${shiftLabels[shiftNum]}`} accent>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {['trainer', 'date'].map(key => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{key === 'trainer' ? 'Trainer' : 'Date'}</label>
              <input type={key === 'date' ? 'date' : 'text'} value={shift[key]} onChange={e => setMeta(key, e.target.value)} placeholder={key === 'trainer' ? 'Trainer name' : ''}
                style={{ ...INPUT, background: 'rgba(255,255,255,0.9)', color: '#0a1628', colorScheme: 'light', border: '1.5px solid rgba(0,0,0,0.15)' }} />
            </div>
          ))}
        </div>
      </SectionCard>

      {intro && (
        <div style={{ background: CYAN_LIGHT, border: `1.5px solid rgba(0,200,150,0.25)`, borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: CYAN, lineHeight: 1.6, margin: 0 }}>{intro}</p>
        </div>
      )}

      <SectionCard title="Task Checklist" badge={`${totalDone}/${totalCount}`}>
        {(shiftNum <= 4 ? fixedTasks : []).map((task, i) => (
          <TaskRow key={i}
            time={task.time} desc={task.desc}
            checked={shift.tasks?.[i]?.checked || false}
            comment={shift.tasks?.[i]?.comment || ''}
            onCheck={() => toggleTask(i)}
            onComment={v => setTaskNote(i, v)}
          />
        ))}
        {shiftNum === 5 && SHIFT_5_FIXED.map((task, i) => (
          <TaskRow key={i}
            time={task.time} desc={task.desc}
            checked={shift.tasks?.[i]?.checked || false}
            comment={shift.tasks?.[i]?.comment || ''}
            onCheck={() => toggleTask(i)}
            onComment={v => setTaskNote(i, v)}
          />
        ))}

        {isCustom && (shift.custom || []).map((task, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 32px', gap: 12, padding: '12px 0', borderBottom: `1px solid ${BORDER}`, alignItems: 'start', background: 'rgba(0,200,150,0.03)' }}>
            <input value={task.time} onChange={e => setCustomField(i, 'time', e.target.value)} placeholder="~time"
              style={{ background: CYAN_LIGHT, border: `1.5px solid rgba(0,200,150,0.3)`, borderRadius: 6, padding: '5px 7px', fontSize: 12, fontWeight: 700, color: CYAN, outline: 'none', fontFamily: 'inherit', textAlign: 'center' }} />
            <div>
              <input value={task.desc} onChange={e => setCustomField(i, 'desc', e.target.value)} placeholder="Task description…"
                style={{ width: '100%', boxSizing: 'border-box', background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 7, padding: '7px 10px', fontSize: 14, color: TEXT1, outline: 'none', fontFamily: 'inherit', marginBottom: 6 }} />
              <NoteInput value={task.comment} onChange={v => setCustomField(i, 'comment', v)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <Tick checked={task.checked} onChange={() => toggleCustom(i)} />
              <button onClick={() => removeCustom(i)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', padding: 0 }}>✕</button>
            </div>
          </div>
        ))}

        {isCustom && (
          <button onClick={addCustom} style={{ marginTop: 14, background: CYAN_LIGHT, color: CYAN, border: `1.5px dashed rgba(0,200,150,0.4)`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}>
            + Add Task
          </button>
        )}
      </SectionCard>

      {hasVerdict && (
        <SectionCard title="End of Trial Verdict">
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            {[['yes', 'Advance — Yes', '#22c55e', '#f0fdf4', '#166534'], ['no', 'Do Not Advance — No', '#ef4444', 'rgba(239,68,68,0.1)', '#ef4444']].map(([val, label, color, bg, textColor]) => (
              <button key={val} onClick={() => setMeta('verdict', val)} style={{
                flex: 1, padding: '10px', borderRadius: 9,
                border: `2px solid ${shift.verdict === val ? color : BORDER}`,
                background: shift.verdict === val ? bg : SURFACE2,
                color: shift.verdict === val ? textColor : TEXT2,
                fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}>{label}</button>
            ))}
          </div>
          <label style={{ fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>End of Trial Summary</label>
          <textarea value={shift.summary || ''} onChange={e => setMeta('summary', e.target.value)} placeholder="Write a summary of the trial here…" rows={4}
            style={{ width: '100%', boxSizing: 'border-box', background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', fontSize: 14, color: TEXT1, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
        </SectionCard>
      )}
    </div>
  );
}

function SignaturePad({ label, value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function move(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#0a1628';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }

  function stop(e) {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL());
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div style={{ border: `2px solid ${value ? CYAN : BORDER}`, borderRadius: 10, padding: 16, background: value ? CYAN_LIGHT : SURFACE2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
        {value && <button onClick={clear} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>}
      </div>
      <canvas
        ref={canvasRef}
        width={400} height={120}
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
        style={{ width: '100%', height: 120, background: '#fff', borderRadius: 7, cursor: 'crosshair', display: 'block', touchAction: 'none' }}
      />
      {!value && <p style={{ fontSize: 12, color: TEXT2, margin: '8px 0 0', textAlign: 'center' }}>Draw your signature above</p>}
      {value && <p style={{ fontSize: 12, color: CYAN, margin: '8px 0 0', textAlign: 'center', fontWeight: 600 }}>✓ Signed</p>}
    </div>
  );
}

function SignOffPage({ state, set }) {
  const so = state.signOff;
  const setField = (key, val) => set(s => ({ ...s, signOff: { ...s.signOff, [key]: val } }));
  const allDone = so.supervisorName && so.company && so.employeePrint && so.trainerPrint && so.supervisorSig && so.employeeSig && so.trainerSig;

  return (
    <div>
      <SectionCard title="Training Sign-Off Sheet" accent>
        <p style={{ color: '#0a1628', fontSize: 13, lineHeight: 1.6, margin: 0, fontWeight: 600 }}>Complete this section once all 7 shifts and onboarding modules are finished.</p>
      </SectionCard>

      <SectionCard title="Details">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[['supervisorName', 'Supervisor / Manager Name', "Supervisor's full name"], ['company', 'Company / On behalf of', 'Company name'], ['employeePrint', 'Employee Name (Print)', "Employee's full name"], ['trainerPrint', 'Trainer Name (Print)', "Trainer's full name"]].map(([key, label, placeholder]) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
              <input value={so[key] || ''} onChange={e => setField(key, e.target.value)} placeholder={placeholder} style={INPUT} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Declaration">
        <p style={{ fontSize: 13.5, color: TEXT2, lineHeight: 1.75, margin: 0 }}>
          I <strong style={{ color: TEXT1 }}>{so.supervisorName || '_______________'}</strong> (Supervisor) on behalf of <strong style={{ color: TEXT1 }}>{so.company || '_______________'}</strong>, have trained and observed <strong style={{ color: TEXT1 }}>{state.employeeName || '_______________'}</strong> (Employee) during their training as Cleaning Team Member and have walked through all necessary processes, guidelines, policies, and expectations to be upheld during their employment.
          <br /><br />
          Based on my observation and assessment, I certify that the employee has demonstrated adequate understanding of their responsibilities and the skills necessary to perform their role competently.
        </p>
      </SectionCard>

      <SectionCard title="Acknowledgment of Training by Employee">
        <p style={{ fontSize: 13, color: TEXT2, lineHeight: 1.7, fontStyle: 'italic', margin: '0 0 16px' }}>
          "I, the undersigned employee, acknowledge that I have received thorough training in my role as a Cleaning Team Member. This training has equipped me with the necessary knowledge, skills, and understanding to fulfill the duties and responsibilities associated with this position."
        </p>
      </SectionCard>

      <SectionCard title="Signatures">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SignaturePad label="Manager / Supervisor Signature" value={so.supervisorSig} onChange={v => setField('supervisorSig', v)} />
          <SignaturePad label="Trainer Signature" value={so.trainerSig} onChange={v => setField('trainerSig', v)} />
          <SignaturePad label="Employee Signature" value={so.employeeSig} onChange={v => setField('employeeSig', v)} />
        </div>
      </SectionCard>

      {allDone && (
        <div style={{ background: '#22c55e', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 18, margin: 0 }}>Training Complete!</p>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0' }}>{state.employeeName} is officially signed off.</p>
        </div>
      )}
    </div>
  );
}

// ─── Nav ───────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',   label: 'Overview' },
  { id: 'processes',  label: 'Processes & Systems' },
  { id: 'values',     label: 'Values & Guidelines' },
  { id: 'shift1',     label: 'Shift 1' },
  { id: 'shift2',     label: 'Shift 2' },
  { id: 'shift3',     label: 'Shift 3' },
  { id: 'shift4',     label: 'Shift 4' },
  { id: 'shift5',     label: 'Shift 5' },
  { id: 'shift6',     label: 'Shift 6' },
  { id: 'shift7',     label: 'Shift 7' },
  { id: 'signoff',    label: 'Sign-Off' },
];

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function InductionTraining() {
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [state, setState] = useState(initState);
  const [page, setPage] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { api.get('/staff').then(r => setStaffList(r.data)); }, []);

  useEffect(() => {
    if (selectedStaffId) {
      localStorage.setItem('lca-induction-' + selectedStaffId, JSON.stringify(state));
    }
  }, [state, selectedStaffId]);

  function handleSelectStaff(id) {
    setSelectedStaffId(id);
    if (!id) return;
    const saved = localStorage.getItem('lca-induction-' + id);
    if (saved) { try { setState(JSON.parse(saved)); return; } catch {} }
    const member = staffList.find(s => String(s.id) === id);
    const fresh = initState();
    if (member) fresh.employeeName = member.name;
    setState(fresh);
    setPage('overview');
  }

  function getProgress(id) {
    if (id === 'overview') {
      const ov = state.overview;
      const items = [ov.contractSigned, ov.policiesSigned, ...ov.shifts, ov.processesAndSystems, ov.valuesAndGuidelines, ov.signOff];
      return { done: items.filter(Boolean).length, total: items.length };
    }
    if (id === 'processes') {
      const d = state.processes.filter(t => t.checked).length + Object.values(state.cleaningAreas).filter(Boolean).length;
      return { done: d, total: PROCESSES_TASKS.length + CLEANING_AREAS.length };
    }
    if (id === 'values') {
      return { done: state.values.filter(t => t.checked).length, total: VALUES_TASKS.length };
    }
    if (id.startsWith('shift')) {
      const n = parseInt(id.replace('shift', ''));
      const sh = state.shifts[n];
      const fd = (sh.tasks || []).filter(t => t.checked).length;
      const cd = (sh.custom || []).filter(t => t.checked).length;
      return { done: fd + cd, total: (sh.tasks || []).length + (sh.custom || []).length };
    }
    if (id === 'signoff') {
      const so = state.signOff;
      const d = [so.supervisorName, so.company, so.employeePrint, so.trainerPrint].filter(Boolean).length + (so.employeeSigned ? 1 : 0) + (so.trainerSigned ? 1 : 0);
      return { done: d, total: 6 };
    }
    return { done: 0, total: 0 };
  }

  const pageIdx = NAV.findIndex(n => n.id === page);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Induction Training Plan</h1>
        <p>Cornerstone 7-shift training programme</p>
      </div>

      {/* Staff selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: TEXT2, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Select Employee</label>
        <select value={selectedStaffId} onChange={e => handleSelectStaff(e.target.value)}
          style={{ background: SURFACE, border: `1.5px solid rgba(255,255,255,0.12)`, borderRadius: 8, padding: '10px 14px', color: selectedStaffId ? TEXT1 : TEXT2, fontSize: 14, width: '100%', maxWidth: 360, outline: 'none', fontFamily: 'inherit' }}>
          <option value="">Choose a team member to begin…</option>
          {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {!selectedStaffId ? (
        <div style={{ color: TEXT2, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Select a team member above to start or continue their induction.</div>
      ) : (
        <>
          {/* Section nav */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
            {NAV.map(n => {
              const { done, total } = getProgress(n.id);
              const active = page === n.id;
              const complete = total > 0 && done === total;
              return (
                <button key={n.id} onClick={() => setPage(n.id)} style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
                  border: `1.5px solid ${active ? CYAN : complete ? 'rgba(34,197,94,0.4)' : BORDER}`,
                  background: active ? CYAN_LIGHT : complete ? 'rgba(34,197,94,0.08)' : 'transparent',
                  color: active ? CYAN : complete ? '#22c55e' : TEXT2,
                  fontFamily: 'inherit',
                }}>
                  {n.label}{total > 0 && ` (${done}/${total})`}
                </button>
              );
            })}
          </div>

          {/* Page content */}
          {page === 'overview'  && <Overview      state={state} set={setState} />}
          {page === 'processes' && <ProcessesPage state={state} set={setState} />}
          {page === 'values'    && <ValuesPage    state={state} set={setState} />}
          {page === 'shift1'    && <ShiftPage shiftNum={1} state={state} set={setState} />}
          {page === 'shift2'    && <ShiftPage shiftNum={2} state={state} set={setState} />}
          {page === 'shift3'    && <ShiftPage shiftNum={3} state={state} set={setState} />}
          {page === 'shift4'    && <ShiftPage shiftNum={4} state={state} set={setState} />}
          {page === 'shift5'    && <ShiftPage shiftNum={5} state={state} set={setState} />}
          {page === 'shift6'    && <ShiftPage shiftNum={6} state={state} set={setState} />}
          {page === 'shift7'    && <ShiftPage shiftNum={7} state={state} set={setState} />}
          {page === 'signoff'   && <SignOffPage   state={state} set={setState} />}

          {/* Prev / Next */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            {pageIdx > 0
              ? <button onClick={() => setPage(NAV[pageIdx - 1].id)} style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: TEXT2, cursor: 'pointer', fontFamily: 'inherit' }}>← {NAV[pageIdx - 1].label}</button>
              : <div />}
            {pageIdx < NAV.length - 1
              ? <button onClick={() => setPage(NAV[pageIdx + 1].id)} style={{ background: CYAN, border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#0a1628', cursor: 'pointer', fontFamily: 'inherit' }}>{NAV[pageIdx + 1].label} →</button>
              : <div />}
          </div>
        </>
      )}
    </div>
  );
}
