const express = require('express');
const { emit } = require('../emitter');
const { today } = require('../lib/dates');

module.exports = (db) => {
  const router = express.Router();

  router.get('/managers', (req, res) => {
    res.json(db.prepare('SELECT id, name FROM managers ORDER BY name').all());
  });

  router.get('/staff', (req, res) => {
    const all = req.query.include_archived === '1';
    res.json(db.prepare(`SELECT id, name, role, start_date, archived FROM staff ${all ? '' : 'WHERE archived = 0'} ORDER BY name`).all());
  });

  router.post('/staff', (req, res) => {
    const { name, start_date, role } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const id = db.prepare('INSERT INTO staff (name, role, start_date) VALUES (?, ?, ?)')
      .run(String(name).trim(), role || 'Cleaner', start_date || today()).lastInsertRowid;
    emit();
    res.json({ id: Number(id) });
  });

  router.get('/properties', (req, res) => {
    res.json(db.prepare('SELECT id, name, address FROM properties ORDER BY name').all());
  });

  return router;
};
