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
      const sResult = db.prepare('INSERT INTO training_checklist_sections (checklist_id, name, order_idx) VALUES (?, ?, ?)').run(clId, sec.name, si);
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
      const sResult = db.prepare('INSERT INTO training_checklist_sections (checklist_id, name, order_idx) VALUES (?, ?, ?)').run(req.params.id, sec.name, si);
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
      tcs.name as section_name, tcs.id as section_id, tcs.order_idx as section_order
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

module.exports = router;
