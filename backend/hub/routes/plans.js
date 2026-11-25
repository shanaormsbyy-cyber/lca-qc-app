const express = require('express');
const { emit } = require('../emitter');
const { today } = require('../lib/dates');
const { recordUse, removeUses } = require('../lib/usage');
const { planSuggestions, competencySnapshot } = require('../lib/suggestions');

const TYPES = ['new_hire', 'development', 'pip', 'cross_training', 'reassessment'];

// Copy a template's modules into a new draft plan for a trainee.
function createPlanFromTemplate(db, templateId, { staff_id, trainer_id, title } = {}) {
  const t = db.prepare('SELECT * FROM plans WHERE id = ? AND is_template = 1').get(templateId);
  if (!t) throw Object.assign(new Error('Template not found'), { status: 404 });
  return db.tx(() => {
    const staff = staff_id ? db.prepare('SELECT name FROM staff WHERE id = ?').get(staff_id) : null;
    const id = Number(db.prepare(`INSERT INTO plans (staff_id, title, description, type, trainer_id, status)
      VALUES (?, ?, ?, ?, ?, 'draft')`).run(staff_id || null, title || (staff ? `${t.title} — ${staff.name}` : t.title),
      t.description, t.type, trainer_id || null).lastInsertRowid);
    const ins = db.prepare('INSERT INTO plan_modules (plan_id, title, notes, skill_id, system_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    db.prepare('SELECT * FROM plan_modules WHERE plan_id = ? ORDER BY sort_order, id').all(templateId)
      .forEach((m, i) => ins.run(id, m.title, m.notes, m.skill_id, m.system_id, i));
    return id;
  });
}

module.exports = (db) => {
  const router = express.Router();

  const modulesOf = db.prepare('SELECT * FROM plan_modules WHERE plan_id = ? ORDER BY sort_order, id');
  const sessionsOf = db.prepare(`SELECT ps.*, m.name AS trainer_name FROM plan_sessions ps JOIN plans p ON p.id = ps.plan_id
    LEFT JOIN managers m ON m.id = COALESCE(ps.trainer_id, p.trainer_id) WHERE ps.plan_id = ? ORDER BY ps.date, ps.time`);

  function listPlans({ status, type } = {}) {
    const t = today();
    let sql = `SELECT p.*, s.name AS staff_name, m.name AS trainer_name,
        (SELECT COUNT(*) FROM plan_modules pm WHERE pm.plan_id = p.id) AS modules_total,
        (SELECT COUNT(*) FROM plan_modules pm WHERE pm.plan_id = p.id AND pm.completed = 1) AS modules_done
      FROM plans p LEFT JOIN staff s ON s.id = p.staff_id LEFT JOIN managers m ON m.id = p.trainer_id
      WHERE p.is_template = 0`;
    const params = [];
    if (status) { sql += ' AND p.status = ?'; params.push(status === 'in_training' ? 'active' : status); }
    if (type) { sql += ' AND p.type = ?'; params.push(type); }
    const nextSession = db.prepare(`SELECT date, time FROM plan_sessions WHERE plan_id = ? AND delivered = 0 AND date >= ?
      ORDER BY date, time LIMIT 1`);
    return db.prepare(sql).all(...params).map(p => ({
      ...p,
      progress: p.modules_total ? Math.round((p.modules_done / p.modules_total) * 100) : 0,
      next_session: nextSession.get(p.id, t) || null,
    }));
  }

  function writeModules(planId, modules) {
    const existing = modulesOf.all(planId);
    const keepIds = new Set(modules.filter(m => m.id).map(m => Number(m.id)));
    for (const e of existing) {
      if (!keepIds.has(e.id)) { removeUses(db, 'plan_module', e.id); db.prepare('DELETE FROM plan_modules WHERE id = ?').run(e.id); }
    }
    const upd = db.prepare('UPDATE plan_modules SET title = ?, notes = ?, skill_id = ?, system_id = ?, sort_order = ? WHERE id = ? AND plan_id = ?');
    const ins = db.prepare('INSERT INTO plan_modules (plan_id, title, notes, skill_id, system_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    const ids = [];
    modules.forEach((m, i) => {
      const title = String(m.title || '').trim() || 'Untitled module';
      if (m.id && existing.some(e => e.id === Number(m.id))) {
        upd.run(title, m.notes || null, m.skill_id || null, m.system_id || null, i, Number(m.id), planId);
        ids.push(Number(m.id));
      } else {
        ids.push(Number(ins.run(planId, title, m.notes || null, m.skill_id || null, m.system_id || null, i).lastInsertRowid));
      }
    });
    return ids;
  }

  function writeSessions(planId, sessions, moduleIds) {
    const existing = db.prepare('SELECT * FROM plan_sessions WHERE plan_id = ?').all(planId);
    const keep = new Set(sessions.filter(s => s.id).map(s => Number(s.id)));
    for (const e of existing) if (!keep.has(e.id)) db.prepare('DELETE FROM plan_sessions WHERE id = ?').run(e.id);
    const upd = db.prepare('UPDATE plan_sessions SET date = ?, time = ?, trainer_id = ?, notes = ?, module_ids = ? WHERE id = ? AND plan_id = ?');
    const ins = db.prepare('INSERT INTO plan_sessions (plan_id, date, time, trainer_id, notes, module_ids) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of sessions) {
      if (!s.date) continue;
      let mids = Array.isArray(s.module_ids) ? s.module_ids : [];
      if (Array.isArray(s.module_indexes) && moduleIds) mids = s.module_indexes.map(i => moduleIds[i]).filter(Boolean);
      const json = JSON.stringify(mids);
      if (s.id && existing.some(e => e.id === Number(s.id))) upd.run(s.date, s.time || null, s.trainer_id || null, s.notes || null, json, Number(s.id), planId);
      else ins.run(planId, s.date, s.time || null, s.trainer_id || null, s.notes || null, json);
    }
  }

  // ── Literal sub-paths first ──
  router.get('/suggestions', (req, res) => {
    if (!req.query.staff_id) return res.status(400).json({ error: 'staff_id is required' });
    res.json(planSuggestions(db, Number(req.query.staff_id), today()));
  });

  router.get('/sessions/upcoming', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 500);
    res.json(db.prepare(`SELECT ps.id, ps.plan_id, p.title AS plan_title, s.name AS staff_name, ps.date, ps.time, m.name AS trainer_name
      FROM plan_sessions ps JOIN plans p ON p.id = ps.plan_id LEFT JOIN staff s ON s.id = p.staff_id
      LEFT JOIN managers m ON m.id = COALESCE(ps.trainer_id, p.trainer_id)
      WHERE ps.delivered = 0 AND ps.date >= ? AND p.status = 'active' AND p.is_template = 0
      ORDER BY ps.date, ps.time LIMIT ?`).all(today(), limit));
  });

  router.get('/templates', (req, res) => {
    res.json(db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM plan_modules pm WHERE pm.plan_id = p.id) AS module_count
      FROM plans p WHERE p.is_template = 1 ORDER BY p.title`).all());
  });

  router.put('/templates/:id', (req, res) => {
    const id = Number(req.params.id);
    const t = db.prepare('SELECT * FROM plans WHERE id = ? AND is_template = 1').get(id);
    if (!t) return res.status(404).json({ error: 'Template not found' });
    const b = req.body || {};
    db.tx(() => {
      db.prepare("UPDATE plans SET title = ?, description = ?, type = ?, updated_at = datetime('now') WHERE id = ?")
        .run(b.title || t.title, b.description !== undefined ? b.description : t.description, TYPES.includes(b.type) ? b.type : t.type, id);
      if (Array.isArray(b.modules)) writeModules(id, b.modules);
    });
    emit();
    res.json({ ok: true });
  });

  router.delete('/templates/:id', (req, res) => {
    db.prepare('DELETE FROM plans WHERE id = ? AND is_template = 1').run(Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  router.post('/from-template', (req, res) => {
    const { template_id, staff_id, trainer_id } = req.body || {};
    const id = createPlanFromTemplate(db, Number(template_id), { staff_id, trainer_id });
    emit();
    res.json({ id });
  });

  router.post('/bulk', (req, res) => {
    const { template_id, staff_ids = [], trainer_id } = req.body || {};
    if (!staff_ids.length) return res.status(400).json({ error: 'Choose at least one trainee' });
    const ids = staff_ids.map(sid => createPlanFromTemplate(db, Number(template_id), { staff_id: sid, trainer_id }));
    emit();
    res.json({ ids });
  });

  // ── Plans ──
  router.get('/', (req, res) => {
    let rows = listPlans({ status: req.query.status, type: req.query.type });
    if (req.query.sort === 'next_session') {
      rows = rows.sort((a, b) => {
        const ka = a.next_session ? a.next_session.date + (a.next_session.time || '') : '9999';
        const kb = b.next_session ? b.next_session.date + (b.next_session.time || '') : '9999';
        return ka.localeCompare(kb);
      });
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const p = db.prepare(`SELECT p.*, s.name AS staff_name, m.name AS trainer_name FROM plans p
      LEFT JOIN staff s ON s.id = p.staff_id LEFT JOIN managers m ON m.id = p.trainer_id WHERE p.id = ?`).get(id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    let competency_changed = false;
    if (p.staff_id && p.competency_snapshot) {
      competency_changed = JSON.stringify(competencySnapshot(db, p.staff_id)) !== p.competency_snapshot;
    }
    const modules = modulesOf.all(id);
    const done = modules.filter(m => m.completed).length;
    res.json({
      ...p, modules, sessions: sessionsOf.all(id), competency_changed,
      modules_total: modules.length, modules_done: done,
      progress: modules.length ? Math.round((done / modules.length) * 100) : 0,
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
    const type = TYPES.includes(b.type) ? b.type : 'development';
    const status = b.status === 'active' ? 'active' : 'draft';
    const id = db.tx(() => {
      const pid = Number(db.prepare(`INSERT INTO plans (staff_id, title, description, type, trainer_id, status, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`).run(b.staff_id || null, String(b.title).trim(), b.description || null, type,
        b.trainer_id || null, b.start_date || null, b.end_date || null).lastInsertRowid);
      const mids = writeModules(pid, Array.isArray(b.modules) ? b.modules : []);
      writeSessions(pid, Array.isArray(b.sessions) ? b.sessions : [], mids);
      if (status === 'active') publish(pid);
      return pid;
    });
    emit();
    res.json({ id });
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    db.tx(() => {
      db.prepare(`UPDATE plans SET staff_id = ?, title = ?, description = ?, type = ?, trainer_id = ?, start_date = ?, end_date = ?,
        updated_at = datetime('now') WHERE id = ?`).run(
        b.staff_id !== undefined ? b.staff_id : p.staff_id,
        b.title !== undefined && String(b.title).trim() ? String(b.title).trim() : p.title,
        b.description !== undefined ? b.description : p.description,
        TYPES.includes(b.type) ? b.type : p.type,
        b.trainer_id !== undefined ? b.trainer_id : p.trainer_id,
        b.start_date !== undefined ? b.start_date : p.start_date,
        b.end_date !== undefined ? b.end_date : p.end_date,
        id,
      );
      const mids = Array.isArray(b.modules) ? writeModules(id, b.modules) : modulesOf.all(id).map(m => m.id);
      if (Array.isArray(b.sessions)) writeSessions(id, b.sessions, mids);
    });
    emit();
    res.json({ ok: true });
  });

  function publish(id) {
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    const snap = p.staff_id ? JSON.stringify(competencySnapshot(db, p.staff_id)) : null;
    db.prepare("UPDATE plans SET status = 'active', published_at = ?, competency_snapshot = ?, updated_at = datetime('now') WHERE id = ?")
      .run(today(), snap, id);
  }

  router.post('/:id/publish', (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM plans WHERE id = ? AND is_template = 0').get(id)) return res.status(404).json({ error: 'Not found' });
    publish(id);
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/complete', (req, res) => {
    db.prepare("UPDATE plans SET status = 'completed', completed_at = ?, updated_at = datetime('now') WHERE id = ?").run(today(), Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/archive', (req, res) => {
    db.prepare("UPDATE plans SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/save-as-template', (req, res) => {
    const id = Number(req.params.id);
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const title = (req.body && req.body.title && String(req.body.title).trim()) || p.title;
    const tid = db.tx(() => {
      const t = Number(db.prepare(`INSERT INTO plans (title, description, type, status, is_template) VALUES (?, ?, ?, 'draft', 1)`)
        .run(title, p.description, p.type).lastInsertRowid);
      const ins = db.prepare('INSERT INTO plan_modules (plan_id, title, notes, skill_id, system_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      modulesOf.all(id).forEach((m, i) => ins.run(t, m.title, m.notes, m.skill_id, m.system_id, i));
      return t;
    });
    emit();
    res.json({ id: tid });
  });

  router.put('/:id/modules/:moduleId', (req, res) => {
    const m = db.prepare('SELECT * FROM plan_modules WHERE id = ? AND plan_id = ?').get(Number(req.params.moduleId), Number(req.params.id));
    if (!m) return res.status(404).json({ error: 'Not found' });
    const completed = !!(req.body && req.body.completed);
    db.tx(() => {
      db.prepare('UPDATE plan_modules SET completed = ?, completed_at = ?, completed_by = ? WHERE id = ?')
        .run(completed ? 1 : 0, completed ? today() : null, completed ? req.manager.id : null, m.id);
      removeUses(db, 'plan_module', m.id);
      if (completed && m.system_id) recordUse(db, m.system_id, 'plan_module', m.id);
    });
    emit();
    res.json({ ok: true });
  });

  router.put('/:id/sessions/:sessionId', (req, res) => {
    const delivered = !!(req.body && req.body.delivered);
    db.prepare('UPDATE plan_sessions SET delivered = ?, delivered_at = ? WHERE id = ? AND plan_id = ?')
      .run(delivered ? 1 : 0, delivered ? today() : null, Number(req.params.sessionId), Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    for (const m of modulesOf.all(id)) removeUses(db, 'plan_module', m.id);
    db.prepare('DELETE FROM plans WHERE id = ?').run(id);
    emit();
    res.json({ ok: true });
  });

  return router;
};

module.exports.createPlanFromTemplate = createPlanFromTemplate;
