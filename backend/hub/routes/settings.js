const express = require('express');
const { emit } = require('../emitter');

function readSettings(db) {
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
  let methods = [];
  try { methods = JSON.parse(get('shadow_method_system_ids') || '[]'); } catch (_) { methods = []; }
  return {
    shadow_shift_count: Number(get('shadow_shift_count')) || 5,
    shadow_method_system_ids: methods,
    competency_due_days: Number(get('competency_due_days')) || 21,
  };
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => res.json(readSettings(db)));

  router.put('/', (req, res) => {
    const b = req.body || {};
    const isInt = (v, lo, hi) => Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi;
    if (b.shadow_shift_count !== undefined && !isInt(b.shadow_shift_count, 1, 20)) return res.status(400).json({ error: 'Shadow shifts must be 1–20' });
    if (b.competency_due_days !== undefined && !isInt(b.competency_due_days, 1, 365)) return res.status(400).json({ error: 'Due days must be 1–365' });
    if (b.shadow_method_system_ids !== undefined && !Array.isArray(b.shadow_method_system_ids)) return res.status(400).json({ error: 'Methods must be a list' });
    const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    db.tx(() => {
      if (b.shadow_shift_count !== undefined) set.run('shadow_shift_count', String(Number(b.shadow_shift_count)));
      if (b.competency_due_days !== undefined) set.run('competency_due_days', String(Number(b.competency_due_days)));
      if (b.shadow_method_system_ids !== undefined) set.run('shadow_method_system_ids', JSON.stringify(b.shadow_method_system_ids.map(Number)));
    });
    emit();
    res.json({ ok: true });
  });

  return router;
};

module.exports.readSettings = readSettings;
