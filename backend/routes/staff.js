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
  db.prepare('DELETE FROM staff WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
