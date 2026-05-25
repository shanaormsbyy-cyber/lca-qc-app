const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/coaching — all sessions, optional ?staff_id=
router.get('/', (req, res) => {
  const { staff_id } = req.query;
  const rows = db.prepare(`
    SELECT cs.*, s.name as staff_name, m.name as manager_name
    FROM coaching_sessions cs
    JOIN staff s ON s.id = cs.staff_id
    JOIN managers m ON m.id = cs.manager_id
    ${staff_id ? 'WHERE cs.staff_id = ?' : ''}
    ORDER BY cs.date DESC, cs.created_at DESC
  `).all(...(staff_id ? [staff_id] : []));
  res.json(rows);
});

// GET /api/coaching/:id — single session
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT cs.*, s.name as staff_name, m.name as manager_name
    FROM coaching_sessions cs
    JOIN staff s ON s.id = cs.staff_id
    JOIN managers m ON m.id = cs.manager_id
    WHERE cs.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/coaching — create session
router.post('/', (req, res) => {
  const { staff_id, date, topic, problem_type, how_coached, outcome, followup_date, sessions_required, status } = req.body;
  const manager_id = req.manager.id;
  const result = db.prepare(`
    INSERT INTO coaching_sessions
      (staff_id, manager_id, date, topic, problem_type, how_coached, outcome, followup_date, sessions_required, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    staff_id, manager_id, date, topic, problem_type,
    how_coached, outcome, followup_date || null,
    sessions_required || 1, status || 'open'
  );
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/coaching/:id — update session
router.put('/:id', (req, res) => {
  const { date, topic, problem_type, how_coached, outcome, followup_date, sessions_required, status } = req.body;
  db.prepare(`
    UPDATE coaching_sessions
    SET date=?, topic=?, problem_type=?, how_coached=?, outcome=?,
        followup_date=?, sessions_required=?, status=?
    WHERE id=?
  `).run(
    date, topic, problem_type, how_coached, outcome,
    followup_date || null, sessions_required, status,
    req.params.id
  );
  res.json({ ok: true });
});

// DELETE /api/coaching/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM coaching_sessions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
