const express = require('express');
const { emit } = require('../emitter');
const { today } = require('../lib/dates');
const { LEVELS, competencyStatus, ensureCompetency } = require('../lib/competency');
const { makeUpload, handleUpload, cleanupFiles, uploadedFiles } = require('../middleware/upload');

// Assessments are recorded by level only; progress (used for sorting suggestions) follows the level.
const LEVEL_PROGRESS = { introduced: 33, practicing: 66, competent: 100 };

const LIST_SQL = `
  SELECT c.*, s.name AS staff_name, k.name AS skill_name, k.icon AS skill_icon, k.sort_order AS skill_sort,
         (SELECT MAX(a.date) FROM assessments a WHERE a.competency_id = c.id) AS last_assessed,
         EXISTS (SELECT 1 FROM plan_modules pm JOIN plans p ON p.id = pm.plan_id
                 WHERE p.staff_id = c.staff_id AND p.is_template = 0 AND p.status IN ('draft', 'active')
                   AND pm.skill_id = c.skill_id AND pm.title NOT LIKE 'Foundations — %') AS in_plan
  FROM competencies c
  JOIN staff s ON s.id = c.staff_id
  JOIN skills k ON k.id = c.skill_id
  WHERE s.archived = 0`;

function withStatus(rows, t) {
  return rows.map(r => ({ ...r, status: competencyStatus(r, t) }));
}

function photosFor(db, ownerType, ownerId) {
  return db.prepare('SELECT id, file_path, original_name, mime FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id')
    .all(ownerType, ownerId)
    .map(p => ({ id: p.id, url: `/uploads/${p.file_path}`, original_name: p.original_name, mime: p.mime }));
}

function saveAttachments(db, ownerType, ownerId, files) {
  const ins = db.prepare('INSERT INTO attachments (owner_type, owner_id, file_path, original_name, mime, size) VALUES (?, ?, ?, ?, ?, ?)');
  for (const f of files) ins.run(ownerType, ownerId, f.filename, f.originalname, f.mimetype, f.size);
}

module.exports = (db, { uploadsDir }) => {
  const router = express.Router();
  const upload = makeUpload(uploadsDir);

  router.get('/', (req, res) => {
    const params = [];
    let sql = LIST_SQL;
    if (req.query.staff_id) { sql += ' AND c.staff_id = ?'; params.push(Number(req.query.staff_id)); }
    if (req.query.skill_id) { sql += ' AND c.skill_id = ?'; params.push(Number(req.query.skill_id)); }
    sql += ' ORDER BY k.sort_order, s.name';
    res.json(withStatus(db.prepare(sql).all(...params), today()));
  });

  // "Assign Assessment": create (or update) the trainee×skill record.
  router.post('/', (req, res) => {
    const { staff_id, skill_id, due_date, required } = req.body || {};
    if (!staff_id || !skill_id) return res.status(400).json({ error: 'Trainee and skill are required' });
    const existing = db.prepare('SELECT * FROM competencies WHERE staff_id = ? AND skill_id = ?').get(staff_id, skill_id);
    const id = ensureCompetency(db, staff_id, skill_id, { required, due_date });
    // Un-requiring needs a reason (PUT /:id); assigning again can only add the requirement.
    const keepRequired = existing && existing.required ? 1 : (required ? 1 : 0);
    db.prepare('UPDATE competencies SET due_date = ?, required = ? WHERE id = ?').run(due_date || null, keepRequired, id);
    emit();
    res.json({ id });
  });

  router.post('/new-skill', (req, res) => {
    const { staff_id, name, category, required = true, due_date } = req.body || {};
    if (!staff_id || !name || !String(name).trim()) return res.status(400).json({ error: 'Trainee and skill name are required' });
    const id = db.tx(() => {
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM skills').get().m;
      const skillId = db.prepare('INSERT INTO skills (name, icon, category, required, sort_order) VALUES (?, ?, ?, 0, ?)')
        .run(String(name).trim(), 'badge-check', category || null, max + 1).lastInsertRowid;
      return ensureCompetency(db, staff_id, Number(skillId), { required, due_date });
    });
    emit();
    res.json({ id });
  });

  // Full breakdown of one trainee × skill: status, criteria, how it's taught, assessment history.
  router.get('/:id', (req, res) => {
    const c = db.prepare(LIST_SQL.replace('WHERE s.archived = 0', 'WHERE c.id = ?')).get(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Not found' });
    const parse = (s) => { try { return JSON.parse(s || '[]'); } catch (_) { return []; } };
    const assessments = db.prepare(`SELECT a.*, m.name AS manager_name FROM assessments a
      LEFT JOIN managers m ON m.id = a.manager_id WHERE a.competency_id = ? ORDER BY a.date DESC, a.id DESC`).all(c.id)
      .map(a => ({ ...a, criteria: parse(a.criteria_json), photos: photosFor(db, 'assessment', a.id) }));
    const ob = db.prepare("SELECT id FROM onboardings WHERE staff_id = ? ORDER BY id DESC LIMIT 1").get(c.staff_id);
    res.json({
      ...c,
      status: competencyStatus(c, today()),
      criteria: db.prepare('SELECT id, text FROM skill_criteria WHERE skill_id = ? ORDER BY sort_order, id').all(c.skill_id),
      default_modules: db.prepare('SELECT id, title, notes FROM skill_default_modules WHERE skill_id = ? ORDER BY sort_order, id').all(c.skill_id),
      foundation_prompts: db.prepare('SELECT id, text, details FROM foundation_prompts WHERE skill_id = ? ORDER BY sort_order, id').all(c.skill_id),
      assessments,
      onboarding_id: ob ? ob.id : null,
    });
  });

  router.put('/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM competencies WHERE id = ?').get(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const required = b.required !== undefined ? (b.required ? 1 : 0) : c.required;
    let reason = c.unrequired_reason;
    if (c.required && !required) {
      if (!b.unrequired_reason || !String(b.unrequired_reason).trim()) {
        return res.status(400).json({ error: 'A reason is required to remove a required skill' });
      }
      reason = String(b.unrequired_reason).trim();
    }
    if (required) reason = null;
    db.prepare('UPDATE competencies SET due_date = ?, required = ?, unrequired_reason = ? WHERE id = ?')
      .run(b.due_date !== undefined ? b.due_date : c.due_date, required, reason, c.id);
    emit();
    res.json({ ok: true });
  });

  // Add this skill's default modules (or one generic module) to the trainee's open training plan.
  router.post('/:id/add-to-plan', (req, res) => {
    const c = db.prepare('SELECT c.*, k.name AS skill_name FROM competencies c JOIN skills k ON k.id = c.skill_id WHERE c.id = ?').get(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Not found' });
    const { ensurePlanFor } = require('./foundations');
    const plan = { id: ensurePlanFor(db, c.staff_id, req.manager.id) };
    const defaults = db.prepare('SELECT title, notes FROM skill_default_modules WHERE skill_id = ? ORDER BY sort_order, id').all(c.skill_id);
    const wanted = defaults.length ? defaults : [{ title: `${c.skill_name} — practice`, notes: null }];
    const exists = db.prepare('SELECT 1 FROM plan_modules WHERE plan_id = ? AND title = ?');
    const fresh = wanted.filter(m => !exists.get(plan.id, m.title));
    if (!fresh.length) return res.status(409).json({ error: 'Already in their training plan' });
    db.tx(() => {
      let order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM plan_modules WHERE plan_id = ?').get(plan.id).m;
      const ins = db.prepare('INSERT INTO plan_modules (plan_id, title, notes, skill_id, sort_order) VALUES (?, ?, ?, ?, ?)');
      for (const m of fresh) ins.run(plan.id, m.title, m.notes || null, c.skill_id, ++order);
    });
    emit();
    res.json({ ok: true, plan_id: plan.id, added: fresh.length });
  });

  router.post('/:id/reassess', (req, res) => {
    const c = db.prepare('SELECT * FROM competencies WHERE id = ?').get(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (c.level !== 'competent') return res.status(400).json({ error: 'Only a competent skill can be flagged for reassessment' });
    const { reason, due_date } = req.body || {};
    db.prepare('UPDATE competencies SET reassess_flag = 1, reassess_reason = ?, due_date = ? WHERE id = ?')
      .run(reason || null, due_date || c.due_date, c.id);
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/assessments', handleUpload(upload.array('photos', 10)), (req, res) => {
    const files = uploadedFiles(req);
    const c = db.prepare('SELECT * FROM competencies WHERE id = ?').get(Number(req.params.id));
    const fail = (status, error) => { cleanupFiles(req); res.status(status).json({ error }); };
    if (!c) return fail(404, 'Not found');
    const b = req.body || {};
    const score = b.score === undefined || b.score === '' ? null : Number(b.score);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return fail(400, 'Score must be 0–100');
    if (!LEVELS.includes(b.level) || b.level === 'not_started') return fail(400, 'Level must be introduced, practicing or competent');
    const date = b.date || today();
    let id;
    try { id = db.tx(() => {
      const aid = Number(db.prepare(`INSERT INTO assessments (competency_id, manager_id, date, score, level, notes, criteria_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(c.id, req.manager.id, date, score, b.level, b.notes || null, b.criteria_json || null).lastInsertRowid);
      saveAttachments(db, 'assessment', aid, files);
      db.prepare('UPDATE competencies SET level = ?, progress = ?, reassess_flag = 0, reassess_reason = NULL WHERE id = ?')
        .run(b.level, score === null ? LEVEL_PROGRESS[b.level] : score, c.id);
      return aid;
    }); } catch (e) { cleanupFiles(req); throw e; }
    emit();
    res.json({ id });
  });

  router.get('/:id/assessments', (req, res) => {
    const rows = db.prepare(`SELECT a.*, m.name AS manager_name FROM assessments a
      LEFT JOIN managers m ON m.id = a.manager_id WHERE a.competency_id = ? ORDER BY a.date DESC, a.id DESC`).all(Number(req.params.id));
    res.json(rows.map(a => ({ ...a, photos: photosFor(db, 'assessment', a.id) })));
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM competencies WHERE id = ?').run(Number(req.params.id));
    emit();
    res.json({ ok: true });
  });

  return router;
};

module.exports.photosFor = photosFor;
module.exports.saveAttachments = saveAttachments;
