const express = require('express');
const { today } = require('../lib/dates');
const { overviewStats, competencyStats, planStats, onboardingStats, shadowStats } = require('../lib/stats');
const { trainerTasks } = require('../lib/tasks');
const { competencyStatus } = require('../lib/competency');
const { STAGES, onboardingProgress, onboardingDisplayStatus, onboardingParts, shadowStatus } = require('../lib/progress');
const { caddyData } = require('./caddy');

function decorateOnboarding(db, o, t) {
  if (!o) return null;
  return { ...o, stage_name: STAGES[o.stage - 1], progress: onboardingProgress(o, onboardingParts(db, o)),
    status: onboardingDisplayStatus(o, t), record_status: o.status };
}

// Everyone currently being trained: active (non-baseline) onboarding or an active/draft plan. One row each.
function listTrainees(db, t) {
  const rows = db.prepare(`
    SELECT s.id AS staff_id, s.name FROM staff s WHERE s.archived = 0 AND (
      EXISTS (SELECT 1 FROM onboardings o WHERE o.staff_id = s.id AND o.status = 'active' AND o.is_baseline = 0)
      OR EXISTS (SELECT 1 FROM plans p WHERE p.staff_id = s.id AND p.is_template = 0 AND p.status IN ('active', 'draft')))
    ORDER BY s.name`).all();
  const ob = db.prepare(`SELECT o.*, m.name AS trainer_name FROM onboardings o LEFT JOIN managers m ON m.id = o.trainer_id
    WHERE o.staff_id = ? AND o.status = 'active' AND o.is_baseline = 0`);
  const plans = db.prepare(`SELECT p.trainer_id, m.name AS trainer_name FROM plans p LEFT JOIN managers m ON m.id = p.trainer_id
    WHERE p.staff_id = ? AND p.is_template = 0 AND p.status IN ('active', 'draft') ORDER BY p.updated_at DESC, p.id DESC`);
  return rows.map(r => {
    const o = ob.get(r.staff_id);
    const ps = plans.all(r.staff_id);
    const trainer = o ? { id: o.trainer_id, name: o.trainer_name } : { id: ps[0]?.trainer_id ?? null, name: ps[0]?.trainer_name ?? null };
    const d = decorateOnboarding(db, o, t);
    return {
      staff_id: r.staff_id, name: r.name,
      onboarding_id: o ? o.id : null,
      stage: o ? o.stage : null,
      stage_name: d ? d.stage_name : '—',
      progress: d ? d.progress : null,
      trainer_id: trainer.id, trainer_name: trainer.name,
      status: d ? d.status : 'in_training',
      active_plans: ps.length,
    };
  });
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const t = today();
    const me = req.manager.id;
    res.json({
      stats: overviewStats(db, t),
      myTrainees: listTrainees(db, t).filter(x => x.trainer_id === me),
      tasks: trainerTasks(db, me, t),
      caddy: caddyData(db),
    });
  });
  router.get('/competencies', (req, res) => res.json(competencyStats(db, today())));
  router.get('/plans', (req, res) => res.json(planStats(db, today())));
  router.get('/onboarding', (req, res) => res.json(onboardingStats(db, today())));
  router.get('/shadow', (req, res) => res.json(shadowStats(db, today())));

  return router;
};

module.exports.listTrainees = listTrainees;
module.exports.traineesRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => res.json(listTrainees(db, today())));

  router.get('/:staffId', (req, res) => {
    const t = today();
    const sid = Number(req.params.staffId);
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(sid);
    if (!staff) return res.status(404).json({ error: 'Not found' });
    const o = db.prepare(`SELECT o.*, m.name AS trainer_name FROM onboardings o LEFT JOIN managers m ON m.id = o.trainer_id
      WHERE o.staff_id = ?`).get(sid);
    const competencies = db.prepare(`SELECT c.*, k.name AS skill_name, k.icon AS skill_icon,
        (SELECT MAX(a.date) FROM assessments a WHERE a.competency_id = c.id) AS last_assessed,
        EXISTS (SELECT 1 FROM plan_modules pm JOIN plans p ON p.id = pm.plan_id
                WHERE p.staff_id = c.staff_id AND p.is_template = 0 AND p.status IN ('draft', 'active')
                  AND pm.skill_id = c.skill_id AND pm.title NOT LIKE 'Foundations — %') AS in_plan
      FROM competencies c JOIN skills k ON k.id = c.skill_id WHERE c.staff_id = ? ORDER BY k.sort_order, k.id`).all(sid)
      .map(c => ({ ...c, status: competencyStatus(c, t) }));
    const plans = db.prepare(`SELECT p.*, m.name AS trainer_name,
        (SELECT COUNT(*) FROM plan_modules pm WHERE pm.plan_id = p.id) AS modules_total,
        (SELECT COUNT(*) FROM plan_modules pm WHERE pm.plan_id = p.id AND pm.completed = 1) AS modules_done
      FROM plans p LEFT JOIN managers m ON m.id = p.trainer_id WHERE p.staff_id = ? AND p.is_template = 0
      ORDER BY p.created_at DESC, p.id DESC`).all(sid);
    const shifts = db.prepare('SELECT * FROM shadow_shifts WHERE shadow_period_id = ?');
    const shadow_periods = db.prepare(`SELECT sp.*, m.name AS mentor_name FROM shadow_periods sp LEFT JOIN managers m ON m.id = sp.mentor_id
      WHERE sp.staff_id = ? ORDER BY sp.id DESC`).all(sid).map(p => {
      const sh = shifts.all(p.id);
      return { ...p, shifts_reviewed: sh.filter(s => s.reviewed).length, status: shadowStatus(p, sh, t) };
    });
    const assessments = db.prepare(`SELECT a.*, k.name AS skill_name, m.name AS manager_name FROM assessments a
      JOIN competencies c ON c.id = a.competency_id JOIN skills k ON k.id = c.skill_id LEFT JOIN managers m ON m.id = a.manager_id
      WHERE c.staff_id = ? ORDER BY a.date DESC, a.id DESC`).all(sid);
    res.json({ staff, onboarding: decorateOnboarding(db, o, t), competencies, plans, shadow_periods, assessments });
  });

  return router;
};
