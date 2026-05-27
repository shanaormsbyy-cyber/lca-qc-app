const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ─── Checklists ───────────────────────────────────────────────────────────────

router.get('/checklists', (req, res) => {
  const checklists = db.prepare('SELECT * FROM training_checklists ORDER BY name').all();
  checklists.forEach(cl => {
    const sections = db.prepare('SELECT * FROM training_checklist_sections WHERE checklist_id=? ORDER BY order_idx').all(cl.id);
    sections.forEach(s => {
      s.items = db.prepare('SELECT * FROM training_checklist_items WHERE section_id=? ORDER BY order_idx').all(s.id);
    });
    cl.sections = sections;
  });
  res.json(checklists);
});

router.get('/checklists/:id', (req, res) => {
  const cl = db.prepare('SELECT * FROM training_checklists WHERE id=?').get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'Not found' });
  const sections = db.prepare('SELECT * FROM training_checklist_sections WHERE checklist_id=? ORDER BY order_idx').all(cl.id);
  sections.forEach(s => {
    s.items = db.prepare('SELECT * FROM training_checklist_items WHERE section_id=? ORDER BY order_idx').all(s.id);
  });
  cl.sections = sections;
  res.json(cl);
});

router.post('/checklists', (req, res) => {
  const { name, description, sections } = req.body;
  let clId;
  db.exec('BEGIN');
  try {
    const result = db.prepare('INSERT INTO training_checklists (name, description) VALUES (?, ?)').run(name, description || '');
    clId = result.lastInsertRowid;
    (sections || []).forEach((sec, si) => {
      const sResult = db.prepare('INSERT INTO training_checklist_sections (checklist_id, name, description, shift_label, order_idx) VALUES (?, ?, ?, ?, ?)').run(clId, sec.name, sec.description || '', sec.shift_label || '', si);
      const sId = sResult.lastInsertRowid;
      (sec.items || []).forEach((item, ii) => {
        db.prepare('INSERT INTO training_checklist_items (section_id, text, order_idx) VALUES (?, ?, ?)').run(sId, item.text, ii);
      });
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ id: clId });
});

router.put('/checklists/:id', (req, res) => {
  const { name, description, sections } = req.body;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE training_checklists SET name=?, description=? WHERE id=?').run(name, description || '', req.params.id);
    db.prepare('DELETE FROM training_checklist_sections WHERE checklist_id=?').run(req.params.id);
    (sections || []).forEach((sec, si) => {
      const sResult = db.prepare('INSERT INTO training_checklist_sections (checklist_id, name, description, shift_label, order_idx) VALUES (?, ?, ?, ?, ?)').run(req.params.id, sec.name, sec.description || '', sec.shift_label || null, si);
      const sId = sResult.lastInsertRowid;
      (sec.items || []).forEach((item, ii) => {
        db.prepare('INSERT INTO training_checklist_items (section_id, text, order_idx) VALUES (?, ?, ?)').run(sId, item.text, ii);
      });
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.delete('/checklists/:id', (req, res) => {
  db.prepare('DELETE FROM training_checklists WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT ts.*,
      s.name as trainee_name,
      tc.name as checklist_name,
      m1.name as scheduled_by_name,
      m2.name as assigned_to_name
    FROM training_sessions ts
    JOIN staff s ON s.id = ts.trainee_id
    JOIN training_checklists tc ON tc.id = ts.checklist_id
    JOIN managers m1 ON m1.id = ts.scheduled_by_id
    JOIN managers m2 ON m2.id = ts.assigned_to_id
    ORDER BY ts.date DESC
  `).all();
  res.json(sessions);
});

router.get('/sessions/:id', (req, res) => {
  const session = db.prepare(`
    SELECT ts.*,
      s.name as trainee_name,
      tc.name as checklist_name,
      m1.name as scheduled_by_name,
      m2.name as assigned_to_name
    FROM training_sessions ts
    JOIN staff s ON s.id = ts.trainee_id
    JOIN training_checklists tc ON tc.id = ts.checklist_id
    JOIN managers m1 ON m1.id = ts.scheduled_by_id
    JOIN managers m2 ON m2.id = ts.assigned_to_id
    WHERE ts.id = ?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(`
    SELECT tsi.*, tci.text, tci.order_idx,
      tcs.name as section_name, tcs.id as section_id, tcs.order_idx as section_order,
      tcs.shift_label as section_shift_label, tcs.description as section_description
    FROM training_session_items tsi
    JOIN training_checklist_items tci ON tci.id = tsi.item_id
    JOIN training_checklist_sections tcs ON tcs.id = tci.section_id
    WHERE tsi.session_id = ?
    ORDER BY tcs.order_idx, tci.order_idx
  `).all(req.params.id);
  session.items = items;
  res.json(session);
});

router.post('/sessions', (req, res) => {
  const { trainee_id, checklist_id, assigned_to_id, date, notes } = req.body;
  let sessionId;
  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO training_sessions (trainee_id, checklist_id, scheduled_by_id, assigned_to_id, date, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(trainee_id, checklist_id, req.manager.id, assigned_to_id, date, notes || '');
    sessionId = result.lastInsertRowid;

    const items = db.prepare(`
      SELECT tci.id FROM training_checklist_items tci
      JOIN training_checklist_sections tcs ON tcs.id = tci.section_id
      WHERE tcs.checklist_id = ?
    `).all(checklist_id);
    items.forEach(item => {
      db.prepare('INSERT INTO training_session_items (session_id, item_id) VALUES (?, ?)').run(sessionId, item.id);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ id: sessionId });
});

router.put('/sessions/:id', (req, res) => {
  const { assigned_to_id, date, notes, status, signed_off_by, items } = req.body;
  db.exec('BEGIN');
  try {
    if (items) {
      items.forEach(item => {
        db.prepare('UPDATE training_session_items SET completed=?, notes=? WHERE id=?')
          .run(item.completed ? 1 : 0, item.notes || '', item.id);
      });
      const all = db.prepare('SELECT * FROM training_session_items WHERE session_id=?').all(req.params.id);
      const pct = all.length ? (all.filter(i => i.completed).length / all.length) * 100 : 0;
      db.prepare('UPDATE training_sessions SET completion_pct=? WHERE id=?').run(pct, req.params.id);
    }

    const updates = [];
    const params = [];
    if (assigned_to_id !== undefined) { updates.push('assigned_to_id=?'); params.push(assigned_to_id); }
    if (date !== undefined) { updates.push('date=?'); params.push(date); }
    if (notes !== undefined) { updates.push('notes=?'); params.push(notes); }
    if (status !== undefined) { updates.push('status=?'); params.push(status); }
    if (signed_off_by !== undefined) {
      updates.push('signed_off_by=?', 'signed_off_at=?');
      params.push(signed_off_by, new Date().toISOString());
    }
    if (updates.length) {
      params.push(req.params.id);
      db.prepare(`UPDATE training_sessions SET ${updates.join(',')} WHERE id=?`).run(...params);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.delete('/sessions/:id', (req, res) => {
  db.prepare('DELETE FROM training_sessions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Find or create an induction session for a staff member
router.post('/sessions/induction/ensure', (req, res) => {
  const { trainee_id, checklist_id } = req.body;
  if (!trainee_id) return res.status(400).json({ error: 'trainee_id required' });

  // Use provided checklist_id, or fall back to finding by name
  const checklist = checklist_id
    ? db.prepare('SELECT id FROM training_checklists WHERE id = ?').get(checklist_id)
    : db.prepare("SELECT id FROM training_checklists WHERE name LIKE '%nduction%' ORDER BY id LIMIT 1").get();
  if (!checklist) return res.status(404).json({ error: 'Onboarding checklist not found' });

  // Check for existing induction session for this trainee
  const existing = db.prepare(`
    SELECT id, completion_pct, status FROM training_sessions
    WHERE trainee_id = ? AND checklist_id = ?
    ORDER BY date DESC LIMIT 1
  `).get(trainee_id, checklist.id);

  if (existing) return res.json({ id: existing.id, completion_pct: existing.completion_pct, status: existing.status, created: false });

  // Create new session
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    INSERT INTO training_sessions (trainee_id, checklist_id, scheduled_by_id, assigned_to_id, date, notes)
    VALUES (?, ?, ?, ?, ?, '')
  `).run(trainee_id, checklist.id, req.manager.id, req.manager.id, today);

  res.json({ id: result.lastInsertRowid, completion_pct: 0, status: 'pending', created: true });
});

// Update induction session completion %
router.patch('/sessions/:id/progress', (req, res) => {
  const { completion_pct, status } = req.body;
  const updates = [];
  const params = [];
  if (completion_pct !== undefined) { updates.push('completion_pct=?'); params.push(completion_pct); }
  if (status) { updates.push('status=?'); params.push(status); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE training_sessions SET ${updates.join(',')} WHERE id=?`).run(...params);
  res.json({ ok: true });
});

// ─── Shadow Period Rubric ─────────────────────────────────────────────────────

// GET all dimensions (ordered)
router.get('/rubric/dimensions', (req, res) => {
  res.json(db.prepare('SELECT * FROM shadow_rubric_dimensions ORDER BY order_idx').all());
});

// PUT replace all dimensions (editor save)
router.put('/rubric/dimensions', (req, res) => {
  const { dimensions } = req.body;
  if (!Array.isArray(dimensions)) return res.status(400).json({ error: 'dimensions array required' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM shadow_rubric_dimensions').run();
    const ins = db.prepare('INSERT INTO shadow_rubric_dimensions (name, pass_desc, fail_desc, order_idx) VALUES (?, ?, ?, ?)');
    dimensions.forEach((d, i) => ins.run(d.name || '', d.pass_desc || '', d.fail_desc || '', i));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

// GET rubric scores for a session (all dimensions × cleans)
router.get('/sessions/:id/rubric', (req, res) => {
  const dims = db.prepare('SELECT * FROM shadow_rubric_dimensions ORDER BY order_idx').all();
  const scores = db.prepare('SELECT * FROM shadow_rubric_scores WHERE session_id=?').all(req.params.id);
  // Index scores by dimension_id + clean_number for easy lookup
  const scoreMap = {};
  scores.forEach(s => { scoreMap[`${s.dimension_id}_${s.clean_number}`] = s; });
  res.json({ dimensions: dims, scoreMap });
});

// PUT upsert a single rubric score cell
router.put('/sessions/:id/rubric/:dimensionId/:cleanNumber', (req, res) => {
  const { score, notes } = req.body;
  const { id, dimensionId, cleanNumber } = req.params;
  if (score && !['pass', 'mixed', 'fail'].includes(score)) {
    return res.status(400).json({ error: 'score must be pass, mixed, or fail' });
  }
  db.prepare(`
    INSERT INTO shadow_rubric_scores (session_id, dimension_id, clean_number, score, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, dimension_id, clean_number)
    DO UPDATE SET score=excluded.score, notes=excluded.notes
  `).run(id, dimensionId, cleanNumber, score || null, notes || '');
  res.json({ ok: true });
});

// ─── Rubric Sign-off ──────────────────────────────────────────────────────────

// PUT update the pre-signoff note (the blue info box text)
router.put('/sessions/:id/rubric-note', (req, res) => {
  const { note } = req.body;
  db.prepare('UPDATE training_sessions SET rubric_signoff_note=? WHERE id=?').run(note || '', req.params.id);
  res.json({ ok: true });
});

// POST sign off (or decline) the shadow period rubric
router.post('/sessions/:id/rubric-signoff', (req, res) => {
  const { status } = req.body;
  if (!['approved', 'declined'].includes(status)) return res.status(400).json({ error: 'status must be approved or declined' });
  db.prepare('UPDATE training_sessions SET rubric_signoff_status=?, rubric_signoff_by=?, rubric_signoff_at=? WHERE id=?')
    .run(status, req.manager.name, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

// DELETE undo a rubric sign-off
router.delete('/sessions/:id/rubric-signoff', (req, res) => {
  db.prepare('UPDATE training_sessions SET rubric_signoff_status=NULL, rubric_signoff_by=NULL, rubric_signoff_at=NULL WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Staff Briefs ─────────────────────────────────────────────────────────────

// GET all briefs for a staff member (newest first)
router.get('/briefs/:staffId', (req, res) => {
  const briefs = db.prepare(
    'SELECT * FROM staff_briefs WHERE staff_id=? ORDER BY created_at DESC'
  ).all(req.params.staffId);
  res.json(briefs);
});

// POST add a new brief entry
router.post('/briefs/:staffId', (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Brief body required' });
  const result = db.prepare(
    'INSERT INTO staff_briefs (staff_id, author_name, body) VALUES (?, ?, ?)'
  ).run(req.params.staffId, req.manager.name, body.trim());
  res.json({ id: result.lastInsertRowid });
});

// DELETE a brief entry (author or any manager)
router.delete('/briefs/entry/:id', (req, res) => {
  db.prepare('DELETE FROM staff_briefs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
