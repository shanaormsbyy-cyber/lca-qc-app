const { addDays } = require('./dates');
const { competencyStatus } = require('./competency');
const { onboardingProgress, onboardingDisplayStatus, onboardingParts, shadowStatus } = require('./progress');

const ACTIVE_OB_SQL = `SELECT o.* FROM onboardings o JOIN staff s ON s.id = o.staff_id
  WHERE o.is_baseline = 0 AND o.status = 'active' AND s.archived = 0`;

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

function activeOnboardings(db) {
  return db.prepare(ACTIVE_OB_SQL).all();
}

function overviewStats(db, today) {
  const active = activeOnboardings(db);
  const activeStaff = active.map(o => o.staff_id);
  const newHires = active.filter(o => o.stage === 1).length;
  const planOnly = db.prepare(`SELECT COUNT(DISTINCT p.staff_id) n FROM plans p JOIN staff s ON s.id = p.staff_id
    WHERE p.is_template = 0 AND p.status = 'active' AND s.archived = 0
      AND p.staff_id NOT IN (SELECT staff_id FROM onboardings WHERE status = 'active' AND is_baseline = 0)`).get().n;
  const inTraining = active.filter(o => o.stage >= 2).length + planOnly;
  const signedOff = db.prepare(`SELECT COUNT(*) n FROM onboardings WHERE is_baseline = 0 AND status = 'completed' AND signed_off_at > ?`)
    .get(addDays(today, -90)).n;
  const progresses = active.map(o => onboardingProgress(o, onboardingParts(db, o)));
  const trainingCompletionPct = progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : 0;
  const reassessmentsDue = db.prepare(`SELECT COUNT(*) n FROM competencies c JOIN staff s ON s.id = c.staff_id
    WHERE c.reassess_flag = 1 AND s.archived = 0`).get().n;

  let ringDone = 0, ringTotal = 0;
  const skillProgress = [];
  if (activeStaff.length) {
    const ph = activeStaff.map(() => '?').join(',');
    const comps = db.prepare(`SELECT * FROM competencies WHERE required = 1 AND staff_id IN (${ph})`).all(...activeStaff);
    ringTotal = comps.length;
    ringDone = comps.filter(c => c.level === 'competent' && !c.reassess_flag).length;
    for (const sk of db.prepare('SELECT id, name, icon FROM skills WHERE required = 1 AND archived = 0 ORDER BY sort_order').all()) {
      const rows = comps.filter(c => c.skill_id === sk.id);
      const competent = rows.filter(c => c.level === 'competent' && !c.reassess_flag).length;
      skillProgress.push({ skill_id: sk.id, name: sk.name, icon: sk.icon, competent, total: rows.length, pct: pct(competent, rows.length) });
    }
  } else {
    for (const sk of db.prepare('SELECT id, name, icon FROM skills WHERE required = 1 AND archived = 0 ORDER BY sort_order').all()) {
      skillProgress.push({ skill_id: sk.id, name: sk.name, icon: sk.icon, competent: 0, total: 0, pct: 0 });
    }
  }

  return { newHires, inTraining, signedOff, trainingCompletionPct, reassessmentsDue, competencyRingPct: pct(ringDone, ringTotal), skillProgress };
}

function competencyStats(db, today) {
  const rows = db.prepare('SELECT c.* FROM competencies c JOIN staff s ON s.id = c.staff_id WHERE s.archived = 0').all();
  const counts = { competent: 0, in_progress: 0, reassess: 0, overdue: 0 };
  for (const r of rows) counts[competencyStatus(r, today)]++;
  const competentChangeWeek = db.prepare(`SELECT COUNT(*) n FROM assessments WHERE level = 'competent' AND is_baseline = 0 AND date > ? AND date <= ?`)
    .get(addDays(today, -7), today).n;
  return { competent: counts.competent, competentChangeWeek, inProgress: counts.in_progress, needsReassessment: counts.reassess, overdue: counts.overdue };
}

function completionRateFor(db, from, to) {
  const r = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) done
    FROM plans WHERE is_template = 0 AND end_date > ? AND end_date <= ?`).get(from, to);
  return r.total ? Math.round((r.done / r.total) * 100) : null;
}

function planStats(db, today) {
  const count = (status) => db.prepare('SELECT COUNT(*) n FROM plans WHERE is_template = 0 AND status = ?').get(status).n;
  const week = addDays(today, 7);
  const sessions = db.prepare(`SELECT COUNT(*) n FROM plan_sessions ps JOIN plans p ON p.id = ps.plan_id
    WHERE p.status = 'active' AND ps.delivered = 0 AND ps.date >= ? AND ps.date <= ?`).get(today, week).n;
  const comps = db.prepare(`SELECT c.* FROM competencies c JOIN staff s ON s.id = c.staff_id
    WHERE s.archived = 0 AND c.due_date >= ? AND c.due_date <= ?`).all(today, week)
    .filter(c => competencyStatus(c, today) !== 'competent').length;
  const completionRate = completionRateFor(db, addDays(today, -30), today);
  const prev = completionRateFor(db, addDays(today, -60), addDays(today, -30));
  return {
    active: count('active'),
    activeNewThisWeek: db.prepare("SELECT COUNT(*) n FROM plans WHERE is_template = 0 AND status = 'active' AND published_at > ?").get(addDays(today, -7)).n,
    drafts: count('draft'),
    dueThisWeek: sessions + comps,
    completionRate,
    completionRateChange: completionRate !== null && prev !== null ? completionRate - prev : null,
  };
}

function onboardingStats(db, today) {
  const active = activeOnboardings(db);
  return {
    newStarters: active.filter(o => o.stage === 1).length,
    inProgress: active.filter(o => onboardingDisplayStatus(o, today) === 'in_progress').length,
    completed: db.prepare("SELECT COUNT(*) n FROM onboardings WHERE is_baseline = 0 AND status = 'completed'").get().n,
    startingSoon: active.filter(o => o.start_date > today && o.start_date <= addDays(today, 7)).length,
  };
}

function shadowStats(db, today) {
  const periods = db.prepare(`SELECT sp.* FROM shadow_periods sp JOIN staff s ON s.id = sp.staff_id WHERE s.archived = 0`).all();
  const shiftsOf = db.prepare('SELECT * FROM shadow_shifts WHERE shadow_period_id = ?');
  let active = 0, shiftsCompleted = 0, reviewsDue = 0, readyForSignoff = 0;
  for (const p of periods) {
    const shifts = shiftsOf.all(p.id);
    shiftsCompleted += shifts.filter(s => s.reviewed).length;
    if (p.status === 'signed_off') continue;
    active++;
    reviewsDue += shifts.filter(s => s.date && s.date <= today && !s.reviewed).length;
    if (shadowStatus(p, shifts, today) === 'ready') readyForSignoff++;
  }
  return { active, shiftsCompleted, reviewsDue, readyForSignoff };
}

module.exports = { overviewStats, competencyStats, planStats, onboardingStats, shadowStats };
