const express = require('express');
const { emit } = require('../emitter');
const { today, addDays } = require('../lib/dates');
const { ensureCompetency } = require('../lib/competency');
const { STAGES, onboardingProgress, onboardingDisplayStatus, onboardingParts, linkedShadowPeriod } = require('../lib/progress');
const { createPlanFromTemplate } = require('./plans');

function decorate(db, ob, t) {
  return {
    ...ob,
    stage_name: STAGES[ob.stage - 1],
    progress: onboardingProgress(ob, onboardingParts(db, ob)),
    status: onboardingDisplayStatus(ob, t),
    record_status: ob.status,
  };
}

function setting(db, key, fallback) {
  const v = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return v && v.value != null ? v.value : fallback;
}

module.exports = (db) => {
  const router = express.Router();
  const baseSql = `SELECT o.*, s.name AS staff_name, m.name AS trainer_name FROM onboardings o
    JOIN staff s ON s.id = o.staff_id LEFT JOIN managers m ON m.id = o.trainer_id`;

  // ── Checklist template ──
  router.get('/checklist-template', (req, res) => {
    const items = db.prepare('SELECT id, text, details FROM checklist_template_items WHERE group_id = ? ORDER BY sort_order, id');
    res.json(db.prepare('SELECT * FROM checklist_template_groups ORDER BY sort_order, id').all()
      .map(g => ({ ...g, items: items.all(g.id) })));
  });

  router.put('/checklist-template', (req, res) => {
    const groups = (req.body && req.body.groups) || [];
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups must be a list' });
    db.tx(() => {
      db.prepare('DELETE FROM checklist_template_groups').run();
      const g = db.prepare('INSERT INTO checklist_template_groups (name, description, source, sort_order) VALUES (?, ?, ?, ?)');
      const it = db.prepare('INSERT INTO checklist_template_items (group_id, text, details, sort_order) VALUES (?, ?, ?, ?)');
      groups.filter(x => x && x.name && String(x.name).trim()).forEach((grp, i) => {
        const source = grp.source === 'caddy' ? 'caddy' : null;
        const gid = g.run(String(grp.name).trim(), grp.description || null, source, i).lastInsertRowid;
        if (source) return; // caddy groups take their items from the caddy list at setup time
        (grp.items || []).map(x => (typeof x === 'string' ? { text: x } : x || {})).filter(x => x.text && String(x.text).trim())
          .forEach((x, j) => it.run(gid, String(x.text).trim(), x.details && String(x.details).trim() ? String(x.details).trim() : null, j));
      });
    });
    emit();
    res.json({ ok: true });
  });

  // ── New hire setup ──
  router.post('/new-hire', (req, res) => {
    const { staff_id, new_staff, start_date, trainer_id } = req.body || {};
    if (!staff_id && !(new_staff && new_staff.name && String(new_staff.name).trim())) {
      return res.status(400).json({ error: 'Choose a staff member or enter a name' });
    }
    const start = start_date || today();
    if (staff_id && db.prepare('SELECT id FROM onboardings WHERE staff_id = ?').get(staff_id)) {
      return res.status(409).json({ error: 'This person already has an onboarding' });
    }
    const out = db.tx(() => {
      const sid = staff_id || Number(db.prepare('INSERT INTO staff (name, role, start_date) VALUES (?, ?, ?)')
        .run(String(new_staff.name).trim(), new_staff.role || 'Cleaner', start).lastInsertRowid);
      const oid = Number(db.prepare('INSERT INTO onboardings (staff_id, trainer_id, start_date, stage, status) VALUES (?, ?, ?, 1, ?)')
        .run(sid, trainer_id || req.manager.id, start, 'active').lastInsertRowid);

      const ins = db.prepare(`INSERT INTO onboarding_checklist_items (onboarding_id, group_name, group_sort, text, details, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)`);
      const items = db.prepare('SELECT text, details, sort_order FROM checklist_template_items WHERE group_id = ? ORDER BY sort_order, id');
      const caddy = db.prepare('SELECT text, sort_order FROM caddy_items ORDER BY sort_order, id');
      for (const g of db.prepare('SELECT * FROM checklist_template_groups ORDER BY sort_order, id').all()) {
        const rows = g.source === 'caddy' ? caddy.all().map(c => ({ ...c, details: null })) : items.all(g.id);
        for (const it of rows) ins.run(oid, g.name, g.sort_order, it.text, it.details, it.sort_order);
      }

      const due = addDays(start, Number(setting(db, 'competency_due_days', '21')) || 21);
      for (const sk of db.prepare('SELECT id FROM skills WHERE required = 1 AND archived = 0 ORDER BY sort_order').all()) {
        ensureCompetency(db, sid, sk.id, { required: 1, due_date: due });
      }

      const tmpl = db.prepare("SELECT id FROM plans WHERE is_template = 1 AND type = 'new_hire' ORDER BY id LIMIT 1").get();
      let planId = null;
      if (tmpl) {
        const name = db.prepare('SELECT name FROM staff WHERE id = ?').get(sid).name;
        planId = createPlanFromTemplate(db, tmpl.id, { staff_id: sid, trainer_id: trainer_id || req.manager.id, title: `New Hire Induction — ${name}` });
        db.prepare('UPDATE plans SET start_date = ? WHERE id = ?').run(start, planId);
      }
      return { onboarding_id: oid, staff_id: sid, plan_id: planId };
    });
    emit();
    res.json(out);
  });

  // ── Already trained (baseline for existing cleaners) ──
  router.post('/already-trained', (req, res) => {
    const { staff_ids = [], signed_off_at, trainer_id, skill_ids } = req.body || {};
    if (!Array.isArray(staff_ids) || !staff_ids.length) return res.status(400).json({ error: 'Choose at least one person' });
    const date = signed_off_at || today();
    // An explicit list (even empty) is respected; only a missing list means "all required skills".
    const skills = Array.isArray(skill_ids)
      ? (skill_ids.length ? db.prepare(`SELECT id, required FROM skills WHERE id IN (${skill_ids.map(() => '?').join(',')})`).all(...skill_ids.map(Number)) : [])
      : db.prepare('SELECT id, required FROM skills WHERE required = 1 AND archived = 0').all();
    const created = [];
    const skipped = [];
    db.tx(() => {
      for (const sidRaw of staff_ids) {
        const sid = Number(sidRaw);
        if (db.prepare('SELECT id FROM onboardings WHERE staff_id = ?').get(sid)) { skipped.push(sid); continue; }
        db.prepare(`INSERT INTO onboardings (staff_id, trainer_id, start_date, stage, status, is_baseline, signed_off_at, signed_off_by)
          VALUES (?, ?, ?, 5, 'completed', 1, ?, ?)`).run(sid, trainer_id || null, date, date, req.manager.id);
        for (const sk of skills) {
          const cid = ensureCompetency(db, sid, sk.id, { required: sk.required });
          db.prepare(`UPDATE competencies SET level = 'competent', progress = 100, is_baseline = 1, reassess_flag = 0 WHERE id = ?`).run(cid);
          db.prepare(`INSERT INTO assessments (competency_id, manager_id, date, score, level, notes, is_baseline)
            VALUES (?, ?, ?, NULL, 'competent', 'Marked as already trained', 1)`).run(cid, req.manager.id, date);
        }
        created.push(sid);
      }
    });
    emit();
    res.json({ created, skipped });
  });

  // ── Onboardings ──
  router.get('/', (req, res) => {
    const t = today();
    let sql = baseSql + ' WHERE s.archived = 0';
    const params = [];
    if (req.query.include_baseline !== '1') sql += ' AND o.is_baseline = 0';
    if (req.query.stage) { sql += ' AND o.stage = ?'; params.push(Number(req.query.stage)); }
    if (req.query.q) { sql += ' AND s.name LIKE ?'; params.push(`%${req.query.q}%`); }
    sql += ' ORDER BY o.start_date DESC, o.id DESC';
    let rows = db.prepare(sql).all(...params).map(o => decorate(db, o, t));
    if (req.query.status) rows = rows.filter(r => r.status === req.query.status);
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const o = db.prepare(baseSql + ' WHERE o.id = ?').get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Not found' });
    const items = db.prepare('SELECT * FROM onboarding_checklist_items WHERE onboarding_id = ? ORDER BY group_sort, sort_order, id').all(o.id);
    const groups = [];
    for (const it of items) {
      let g = groups.find(x => x.group_name === it.group_name);
      if (!g) { g = { group_name: it.group_name, done: 0, total: 0, items: [] }; groups.push(g); }
      g.items.push({ id: it.id, text: it.text, details: it.details, done: it.done, done_at: it.done_at });
      g.total++;
      if (it.done) g.done++;
    }
    const events = db.prepare(`SELECT e.*, m.name AS manager_name FROM onboarding_events e LEFT JOIN managers m ON m.id = e.manager_id
      WHERE e.onboarding_id = ? ORDER BY e.id DESC`).all(o.id);
    const sp = linkedShadowPeriod(db, o);
    const plan = db.prepare(`SELECT id FROM plans WHERE staff_id = ? AND type = 'new_hire' AND is_template = 0 AND status != 'archived'
      ORDER BY id DESC LIMIT 1`).get(o.staff_id);
    res.json({ ...decorate(db, o, today()), checklist: groups, events, shadow_period_id: sp ? sp.id : null, plan_id: plan ? plan.id : null });
  });

  router.put('/:id', (req, res) => {
    const o = db.prepare('SELECT * FROM onboardings WHERE id = ?').get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    db.prepare('UPDATE onboardings SET trainer_id = ?, start_date = ? WHERE id = ?')
      .run(b.trainer_id !== undefined ? b.trainer_id : o.trainer_id, b.start_date || o.start_date, o.id);
    emit();
    res.json({ ok: true });
  });

  router.put('/:id/checklist/:itemId', (req, res) => {
    const done = !!(req.body && req.body.done);
    db.prepare('UPDATE onboarding_checklist_items SET done = ?, done_at = ?, done_by = ? WHERE id = ? AND onboarding_id = ?')
      .run(done ? 1 : 0, done ? today() : null, done ? req.manager.id : null, Number(req.params.itemId), Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/stage', (req, res) => {
    const o = db.prepare('SELECT * FROM onboardings WHERE id = ?').get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Not found' });
    if (o.status === 'completed') return res.status(400).json({ error: 'This trainee is already signed off' });
    const to = Number(req.body && req.body.to_stage);
    const reason = req.body && req.body.override_reason ? String(req.body.override_reason).trim() : '';
    if (!Number.isInteger(to) || to < 1 || to > 5) return res.status(400).json({ error: 'Stage must be 1–5' });
    if (to > o.stage + 1) return res.status(400).json({ error: 'Move forward one stage at a time' });
    if (to === o.stage) return res.json({ ok: true });

    if (to === 4 && o.stage === 3 && !reason) {
      const blocking = db.prepare(`SELECT k.name FROM competencies c JOIN skills k ON k.id = c.skill_id
        WHERE c.staff_id = ? AND c.required = 1 AND NOT (c.level = 'competent' AND c.reassess_flag = 0) ORDER BY k.sort_order`).all(o.staff_id).map(r => r.name);
      if (blocking.length) return res.status(409).json({ error: 'Required skills are not all competent yet', blocking });
    }
    if (to === 5 && o.stage === 4 && !reason) {
      const sp = linkedShadowPeriod(db, o);
      if (!sp || sp.status !== 'signed_off') return res.status(409).json({ error: 'The shadow period must be signed off first', blocking: ['Shadow period'] });
    }
    db.tx(() => {
      db.prepare('UPDATE onboardings SET stage = ? WHERE id = ?').run(to, o.id);
      db.prepare('INSERT INTO onboarding_events (onboarding_id, from_stage, to_stage, manager_id, override_reason) VALUES (?, ?, ?, ?, ?)')
        .run(o.id, o.stage, to, req.manager.id, reason || null);
    });
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/signoff', (req, res) => {
    const o = db.prepare('SELECT * FROM onboardings WHERE id = ?').get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Not found' });
    if (o.stage !== 5) return res.status(400).json({ error: 'Trainee must be at Final Assessment & Sign Off' });
    db.prepare("UPDATE onboardings SET status = 'completed', signed_off_at = ?, signed_off_by = ? WHERE id = ?").run(today(), req.manager.id, o.id);
    emit();
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM onboardings WHERE id = ?').run(Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  return router;
};
