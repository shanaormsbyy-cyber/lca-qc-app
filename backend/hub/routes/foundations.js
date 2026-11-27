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

// Foundations rooms are their own list (set up on the Foundations page), separate from competency skills.
function rooms(db) {
  const prompts = db.prepare('SELECT id, text, details FROM foundation_room_prompts WHERE room_id = ? ORDER BY sort_order, id');
  return db.prepare('SELECT id, name, icon FROM foundation_rooms ORDER BY sort_order, id').all()
    .map(r => ({ ...r, icon: r.icon || 'door-open', prompts: prompts.all(r.id) }));
}

const cleanName = n => (n == null ? '' : String(n).trim());

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => res.json(rooms(db)));

  // ── Room list ──
  router.post('/rooms', (req, res) => {
    const name = cleanName(req.body && req.body.name);
    if (!name) return res.status(400).json({ error: 'Enter a room name' });
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM foundation_rooms').get().m;
    const id = Number(db.prepare('INSERT INTO foundation_rooms (name, sort_order) VALUES (?, ?)').run(name, max + 1).lastInsertRowid);
    emit();
    res.json({ id });
  });

  router.put('/rooms/order', (req, res) => {
    const ids = (req.body && req.body.ids) || [];
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be a list' });
    db.tx(() => {
      const up = db.prepare('UPDATE foundation_rooms SET sort_order = ? WHERE id = ?');
      ids.forEach((id, i) => up.run(i, Number(id)));
    });
    emit();
    res.json({ ok: true });
  });

  router.put('/rooms/:id', (req, res) => {
    const name = cleanName(req.body && req.body.name);
    if (!name) return res.status(400).json({ error: 'Enter a room name' });
    const r = db.prepare('UPDATE foundation_rooms SET name = ? WHERE id = ?').run(name, Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'Room not found' });
    emit();
    res.json({ ok: true });
  });

  router.delete('/rooms/:id', (req, res) => {
    const id = Number(req.params.id);
    db.tx(() => {
      db.prepare('DELETE FROM foundation_room_prompts WHERE room_id = ?').run(id);
      db.prepare('DELETE FROM foundation_room_progress WHERE room_id = ?').run(id);
      db.prepare('DELETE FROM foundation_rooms WHERE id = ?').run(id);
    });
    emit();
    res.json({ ok: true });
  });

  // ── Trainee progress ──
  router.get('/trainee/:staffId', (req, res) => {
    const sid = Number(req.params.staffId);
    const plan = openPlanFor(db, sid);
    const taught = db.prepare('SELECT * FROM foundation_room_progress WHERE staff_id = ? AND room_id = ?');
    const inPlan = db.prepare(`SELECT 1 FROM plan_modules pm JOIN plans p ON p.id = pm.plan_id
      WHERE p.staff_id = ? AND p.is_template = 0 AND p.status != 'archived' AND pm.title = ?`);
    const list = rooms(db).filter(r => r.prompts.length > 0).map(r => {
      const t = taught.get(sid, r.id);
      return { ...r, taught: !!t, taught_at: t ? t.taught_at : null, in_plan: !!inPlan.get(sid, moduleTitle(r.name)) };
    });
    res.json({ plan_id: plan ? plan.id : null, rooms: list, taught: list.filter(r => r.taught).length, total: list.length });
  });

  router.put('/trainee/:staffId/:roomId', (req, res) => {
    const sid = Number(req.params.staffId);
    const rid = Number(req.params.roomId);
    if (req.body && req.body.taught) {
      db.prepare(`INSERT INTO foundation_room_progress (staff_id, room_id, taught_at, taught_by) VALUES (?, ?, ?, ?)
        ON CONFLICT(staff_id, room_id) DO UPDATE SET taught_at = excluded.taught_at, taught_by = excluded.taught_by`).run(sid, rid, today(), req.manager.id);
    } else {
      db.prepare('DELETE FROM foundation_room_progress WHERE staff_id = ? AND room_id = ?').run(sid, rid);
    }
    emit();
    res.json({ ok: true });
  });

  router.post('/trainee/:staffId/:roomId/add-to-plan', (req, res) => {
    const sid = Number(req.params.staffId);
    const room = db.prepare('SELECT * FROM foundation_rooms WHERE id = ?').get(Number(req.params.roomId));
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const planId = ensurePlanFor(db, sid, req.manager.id);
    if (!planId) return res.status(404).json({ error: 'Trainee not found' });
    const title = moduleTitle(room.name);
    if (db.prepare('SELECT 1 FROM plan_modules WHERE plan_id = ? AND title = ?').get(planId, title)) {
      return res.status(409).json({ error: 'Already in their training plan' });
    }
    const notes = db.prepare('SELECT text FROM foundation_room_prompts WHERE room_id = ? ORDER BY sort_order, id').all(room.id)
      .map(p => `• ${p.text}`).join('\n');
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM plan_modules WHERE plan_id = ?').get(planId).m;
    db.prepare('INSERT INTO plan_modules (plan_id, title, notes, sort_order) VALUES (?, ?, ?, ?)').run(planId, title, notes || null, max + 1);
    emit();
    res.json({ ok: true, plan_id: planId });
  });

  // ── Prompts for one room ──
  router.put('/:roomId', (req, res) => {
    const rid = Number(req.params.roomId);
    if (!db.prepare('SELECT id FROM foundation_rooms WHERE id = ?').get(rid)) return res.status(404).json({ error: 'Room not found' });
    const prompts = (req.body && req.body.prompts) || [];
    if (!Array.isArray(prompts)) return res.status(400).json({ error: 'prompts must be a list' });
    db.tx(() => {
      db.prepare('DELETE FROM foundation_room_prompts WHERE room_id = ?').run(rid);
      const ins = db.prepare('INSERT INTO foundation_room_prompts (room_id, text, details, sort_order) VALUES (?, ?, ?, ?)');
      prompts.map(p => (typeof p === 'string' ? { text: p } : p || {})).filter(p => p.text && String(p.text).trim())
        .forEach((p, i) => ins.run(rid, String(p.text).trim(), p.details && String(p.details).trim() ? String(p.details).trim() : null, i));
    });
    emit();
    res.json({ ok: true });
  });

  return router;
};

module.exports.openPlanFor = openPlanFor;
module.exports.ensurePlanFor = ensurePlanFor;
