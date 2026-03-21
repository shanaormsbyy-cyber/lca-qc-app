const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM staff ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, role, start_date } = req.body;
  const result = db.prepare('INSERT INTO staff (name, role, start_date) VALUES (?, ?, ?)').run(name, role, start_date);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, role, start_date } = req.body;
  db.prepare('UPDATE staff SET name=?, role=?, start_date=? WHERE id=?').run(name, role, start_date, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.exec('BEGIN');
  try {
    // Delete QC check items for all QC checks belonging to this staff member
    const qcChecks = db.prepare('SELECT id FROM qc_checks WHERE staff_id=?').all(id);
    for (const c of qcChecks) {
      db.prepare('DELETE FROM qc_check_items WHERE check_id=?').run(c.id);
    }
    db.prepare('DELETE FROM qc_checks WHERE staff_id=?').run(id);

    // Delete training session items for all training sessions belonging to this staff member
    const trainSessions = db.prepare('SELECT id FROM training_sessions WHERE trainee_id=?').all(id);
    for (const s of trainSessions) {
      db.prepare('DELETE FROM training_session_items WHERE session_id=?').run(s.id);
    }
    db.prepare('DELETE FROM training_sessions WHERE trainee_id=?').run(id);

    db.prepare('DELETE FROM staff WHERE id=?').run(id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
