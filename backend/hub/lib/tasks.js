const { badgeFor } = require('./dates');
const { competencyStatus } = require('./competency');

const BADGE_ORDER = { overdue: 0, today: 1, this_week: 2 };

// Staff ids this manager trains: active onboardings they lead, or active/draft plans they own.
function myTraineeIds(db, managerId) {
  const ids = new Set();
  for (const r of db.prepare(`SELECT o.staff_id FROM onboardings o JOIN staff s ON s.id = o.staff_id
    WHERE o.trainer_id = ? AND o.status = 'active' AND o.is_baseline = 0 AND s.archived = 0`).all(managerId)) ids.add(r.staff_id);
  for (const r of db.prepare(`SELECT p.staff_id FROM plans p JOIN staff s ON s.id = p.staff_id
    WHERE p.trainer_id = ? AND p.is_template = 0 AND p.status IN ('active', 'draft') AND s.archived = 0`).all(managerId)) ids.add(r.staff_id);
  return [...ids];
}

function trainerTasks(db, managerId, today) {
  const tasks = [];
  const push = (t) => { const badge = badgeFor(t.due_date, today); if (badge !== 'later') tasks.push({ ...t, badge }); };

  const mine = myTraineeIds(db, managerId);
  if (mine.length) {
    const ph = mine.map(() => '?').join(',');
    const comps = db.prepare(`SELECT c.*, s.name AS staff_name, k.name AS skill_name FROM competencies c
      JOIN staff s ON s.id = c.staff_id JOIN skills k ON k.id = c.skill_id
      WHERE c.staff_id IN (${ph}) AND c.due_date IS NOT NULL`).all(...mine);
    for (const c of comps) {
      const status = competencyStatus(c, today);
      if (status === 'competent') continue;
      push({ kind: 'assessment', id: c.id, title: `${status === 'reassess' ? 'Reassess' : 'Assess'} ${c.skill_name} — ${c.staff_name}`,
        due_date: c.due_date, link: `/training-hub/competencies?focus=${c.id}` });
    }
  }

  for (const s of db.prepare(`SELECT sh.*, st.name AS staff_name, sp.id AS period_id FROM shadow_shifts sh
    JOIN shadow_periods sp ON sp.id = sh.shadow_period_id JOIN staff st ON st.id = sp.staff_id
    WHERE sh.mentor_id = ? AND sh.reviewed = 0 AND sh.date IS NOT NULL AND sh.date <= ? AND sp.status != 'signed_off' AND st.archived = 0`)
    .all(managerId, today)) {
    push({ kind: 'shadow_review', id: s.id, title: `Review shadow shift ${s.shift_number} — ${s.staff_name}`,
      due_date: s.date, link: `/training-hub/shadow?period=${s.period_id}&shift=${s.id}` });
  }

  for (const s of db.prepare(`SELECT ps.*, p.title AS plan_title, st.name AS staff_name FROM plan_sessions ps
    JOIN plans p ON p.id = ps.plan_id LEFT JOIN staff st ON st.id = p.staff_id
    WHERE COALESCE(ps.trainer_id, p.trainer_id) = ? AND ps.delivered = 0 AND p.status = 'active' AND p.is_template = 0`).all(managerId)) {
    push({ kind: 'session', id: s.id, plan_id: s.plan_id, title: `Training session${s.time ? ` ${s.time}` : ''} — ${s.staff_name || s.plan_title}`,
      due_date: s.date, link: `/training-hub/plans/${s.plan_id}` });
  }

  for (const o of db.prepare(`SELECT o.*, s.name AS staff_name,
      (SELECT COUNT(*) FROM onboarding_checklist_items i WHERE i.onboarding_id = o.id AND i.done = 0) AS outstanding
    FROM onboardings o JOIN staff s ON s.id = o.staff_id
    WHERE o.trainer_id = ? AND o.status = 'active' AND o.is_baseline = 0 AND s.archived = 0`).all(managerId)) {
    if (!o.outstanding || !o.start_date) continue;
    push({ kind: 'checklist', id: o.id, title: `${o.outstanding} setup items outstanding — ${o.staff_name}`,
      due_date: o.start_date, link: `/training-hub/onboarding?focus=${o.id}` });
  }

  return tasks.sort((a, b) => (BADGE_ORDER[a.badge] - BADGE_ORDER[b.badge]) || a.due_date.localeCompare(b.due_date));
}

module.exports = { trainerTasks, myTraineeIds };
