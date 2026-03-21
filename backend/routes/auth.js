const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const manager = db.prepare('SELECT * FROM managers WHERE username = ?').get(username);
  if (!manager || !bcrypt.compareSync(password, manager.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: manager.id, username: manager.username, name: manager.name },
    SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, manager: { id: manager.id, username: manager.username, name: manager.name } });
});

router.get('/me', requireAuth, (req, res) => {
  const manager = db.prepare('SELECT id, username, name FROM managers WHERE id = ?').get(req.manager.id);
  res.json(manager);
});

module.exports = router;
