const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM properties ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, address, airbnb_id } = req.body;
  const result = db.prepare('INSERT INTO properties (name, address, airbnb_id) VALUES (?, ?, ?)').run(name, address, airbnb_id);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, address, airbnb_id } = req.body;
  db.prepare('UPDATE properties SET name=?, address=?, airbnb_id=? WHERE id=?').run(name, address, airbnb_id, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
