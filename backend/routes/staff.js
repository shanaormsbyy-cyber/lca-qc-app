const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { archived } = req.query;
  if (archived === 'true') {
    res.json(db.prepare('SELECT * FROM staff WHERE archived=1 ORDER BY name').all());
  } else {
    res.json(db.prepare('SELECT * FROM staff WHERE archived=0 OR archived IS NULL ORDER BY name').all());
  }
});

router.post('/:id/archive', (req, res) => {
  db.prepare('UPDATE staff SET archived=1, archived_at=datetime("now") WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE staff SET archived=0, archived_at=NULL WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { name, role, start_date } = req.body;
  const result = db.prepare('INSERT INTO staff (name, role, start_date) VALUES (?, ?, ?)').run(name, role, start_date);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, role, start_date, inactive_until, slack_email } = req.body;
  if (name !== undefined) db.prepare('UPDATE staff SET name=?, role=?, start_date=? WHERE id=?').run(name, role, start_date, req.params.id);
  if (inactive_until !== undefined) db.prepare('UPDATE staff SET inactive_until=? WHERE id=?').run(inactive_until || null, req.params.id);
  if (slack_email !== undefined) db.prepare('UPDATE staff SET slack_email=? WHERE id=?').run(slack_email || null, req.params.id);
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
