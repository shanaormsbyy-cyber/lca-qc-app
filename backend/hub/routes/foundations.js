const express = require('express');
const { emit } = require('../emitter');
const { today } = require('../lib/dates');

const moduleTitle = (room) => `Foundations — ${room}`;

// The trainee's plan that foundations get added to: newest open new-hire plan, else newest open plan.
function openPlanFor(db, staffId) {
  return db.prepare(`SELECT id FROM plans WHERE staff_id = ? AND is_template = 0 AND status IN ('draft', 'active')
    ORDER BY (type = 'new_hire') DESC, id DESC LIMIT 1`).get(staffId) || null;
}

// Open plan, or a new draft one: New Hire Induction (from the template) for someone in onboarding,
// otherwise a blank Development plan. The logged-in manager becomes the trainer.
function ensurePlanFor(db, staffId, managerId) {
  const open = openPlanFor(db, staffId);
  if (open) return open.id;
  const staff = db.prepare('SELECT name FROM staff WHERE id = ?').get(staffId);
  if (!staff) return null;
  const onboarding = db.prepare("SELECT id FROM onboardings WHERE staff_id = ? AND status = 'active'").get(staffId);
  const tmpl = db.prepare("SELECT id FROM plans WHERE is_template = 1 AND type = 'new_hire' ORDER BY id LIMIT 1").get();
  if (onboarding && tmpl) {
    const { createPlanFromTemplate } = require('./plans');
    return createPlanFromTemplate(db, tmpl.id, { staff_id: staffId, trainer_id: managerId, title: `New Hire Induction — ${staff.name}` });
  }
  if (onboarding) {
    return Number(db.prepare(`INSERT INTO plans (staff_id, title, type, trainer_id, status, start_date) VALUES (?, ?, 'new_hire', ?, 'draft', ?)`)
      .run(staffId, `New Hire Induction — ${staff.name}`, managerId, today()).lastInsertRowid);
  }
  return Number(db.prepare(`INSERT INTO plans (staff_id, title, type, trainer_id, status, start_date) VALUES (?, ?, 'development', ?, 'draft', ?)`)
    .run(staffId, `Development — ${staff.name}`, managerId, today()).lastInsertRowid);
}

function rooms(db) {
  const prompts = db.prepare('SELECT id, text, details FROM foundation_prompts WHERE skill_id = ? ORDER BY sort_order, id');
  return db.prepare('SELECT id, name, icon, category, required FROM skills WHERE archived = 0 ORDER BY sort_order, id').all()
    .map(s => ({ ...s, prompts: prompts.all(s.id) }));
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => res.json(rooms(db)));

  router.get('/trainee/:staffId', (req, res) => {
    const sid = Number(req.params.staffId);
    const plan = openPlanFor(db, sid);
    const taught = db.prepare('SELECT * FROM foundation_progress WHERE staff_id = ? AND skill_id = ?');
    const inPlan = db.prepare(`SELECT 1 FROM plan_modules pm JOIN plans p ON p.id = pm.plan_id
      WHERE p.staff_id = ? AND p.is_template = 0 AND p.status != 'archived' AND pm.title = ?`);
    const list = rooms(db).filter(r => r.prompts.length > 0).map(r => {
      const t = taught.get(sid, r.id);
      return { ...r, taught: !!t, taught_at: t ? t.taught_at : null, in_plan: !!inPlan.get(sid, moduleTitle(r.name)) };
    });
    res.json({ plan_id: plan ? plan.id : null, rooms: list, taught: list.filter(r => r.taught).length, total: list.length });
  });

  router.put('/trainee/:staffId/:skillId', (req, res) => {
    const sid = Number(req.params.staffId);
    const kid = Number(req.params.skillId);
    if (req.body && req.body.taught) {
      db.prepare(`INSERT INTO foundation_progress (staff_id, skill_id, taught_at, taught_by) VALUES (?, ?, ?, ?)
        ON CONFLICT(staff_id, skill_id) DO UPDATE SET taught_at = excluded.taught_at, taught_by = excluded.taught_by`).run(sid, kid, today(), req.manager.id);
    } else {
      db.prepare('DELETE FROM foundation_progress WHERE staff_id = ? AND skill_id = ?').run(sid, kid);
    }
    emit();
    res.json({ ok: true });
  });

  router.post('/trainee/:staffId/:skillId/add-to-plan', (req, res) => {
    const sid = Number(req.params.staffId);
    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(Number(req.params.skillId));
    if (!skill) return res.status(404).json({ error: 'Room not found' });
    const planId = ensurePlanFor(db, sid, req.manager.id);
    if (!planId) return res.status(404).json({ error: 'Trainee not found' });
    const plan = { id: planId };
    const title = moduleTitle(skill.name);
    if (db.prepare('SELECT 1 FROM plan_modules WHERE plan_id = ? AND title = ?').get(plan.id, title)) {
      return res.status(409).json({ error: 'Already in their training plan' });
    }
    const notes = db.prepare('SELECT text FROM foundation_prompts WHERE skill_id = ? ORDER BY sort_order, id').all(skill.id).map(p => `• ${p.text}`).join('\n');
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM plan_modules WHERE plan_id = ?').get(plan.id).m;
    db.prepare('INSERT INTO plan_modules (plan_id, title, notes, skill_id, sort_order) VALUES (?, ?, ?, ?, ?)').run(plan.id, title, notes || null, skill.id, max + 1);
    emit();
    res.json({ ok: true, plan_id: plan.id });
  });

  router.put('/:skillId', (req, res) => {
    const kid = Number(req.params.skillId);
    if (!db.prepare('SELECT id FROM skills WHERE id = ?').get(kid)) return res.status(404).json({ error: 'Room not found' });
    const prompts = (req.body && req.body.prompts) || [];
    if (!Array.isArray(prompts)) return res.status(400).json({ error: 'prompts must be a list' });
    db.tx(() => {
      db.prepare('DELETE FROM foundation_prompts WHERE skill_id = ?').run(kid);
      const ins = db.prepare('INSERT INTO foundation_prompts (skill_id, text, details, sort_order) VALUES (?, ?, ?, ?)');
      prompts.map(p => (typeof p === 'string' ? { text: p } : p || {})).filter(p => p.text && String(p.text).trim())
        .forEach((p, i) => ins.run(kid, String(p.text).trim(), p.details && String(p.details).trim() ? String(p.details).trim() : null, i));
    });
    emit();
    res.json({ ok: true });
  });

  return router;
};

module.exports.openPlanFor = openPlanFor;
module.exports.ensurePlanFor = ensurePlanFor;
