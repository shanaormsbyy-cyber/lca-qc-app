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

router.put('/:id/password', (req, res) => {
  const { password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE managers SET password_hash=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const all = db.prepare('SELECT COUNT(*) as cnt FROM managers').get();
  if (all.cnt <= 1) return res.status(400).json({ error: 'Cannot delete the last manager account' });
  db.prepare('DELETE FROM managers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
