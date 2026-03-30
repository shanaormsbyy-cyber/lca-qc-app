const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, username, name FROM managers ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { username, password, name } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO managers (username, password_hash, name) VALUES (?, ?, ?)').run(username, hash, name);
    res.json({ id: result.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Username already exists' });
  }
});

router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE managers SET name=? WHERE id=?').run(name.trim(), req.params.id);
  res.json({ ok: true });
});

router.put('/:id/password', (req, res) => {
  const { password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE managers SET password_hash=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const all = db.prepare('SELECT id FROM managers WHERE id != ?').all(req.params.id);
  if (all.length === 0) return res.status(400).json({ error: 'Cannot delete the last manager account' });

  // Reassign all records from deleted manager to the current logged-in manager
  const reassignTo = req.manager.id !== parseInt(req.params.id) ? req.manager.id : all[0].id;

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE qc_checks SET scheduled_by_id=? WHERE scheduled_by_id=?').run(reassignTo, req.params.id);
    db.prepare('UPDATE qc_checks SET assigned_to_id=? WHERE assigned_to_id=?').run(reassignTo, req.params.id);
    db.prepare('UPDATE training_sessions SET scheduled_by_id=? WHERE scheduled_by_id=?').run(reassignTo, req.params.id);
    db.prepare('UPDATE training_sessions SET assigned_to_id=? WHERE assigned_to_id=?').run(reassignTo, req.params.id);
    db.prepare('DELETE FROM managers WHERE id=?').run(req.params.id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
