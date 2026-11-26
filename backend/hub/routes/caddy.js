const express = require('express');
const fs = require('fs');
const path = require('path');
const { emit } = require('../emitter');
const { makeUpload, handleUpload } = require('../middleware/upload');

// Caddy items are grouped: Chemicals, then Tools, then Equipment.
const CATEGORIES = ['chemicals', 'tools', 'equipment'];
const catOf = c => (CATEGORIES.includes(c) ? c : 'chemicals');

function caddyData(db) {
  const photo = db.prepare("SELECT value FROM settings WHERE key = 'caddy_photo'").get();
  return {
    items: db.prepare(`SELECT id, text, COALESCE(category, 'chemicals') AS category FROM caddy_items
      ORDER BY CASE COALESCE(category, 'chemicals') WHEN 'chemicals' THEN 0 WHEN 'tools' THEN 1 ELSE 2 END, sort_order, id`).all(),
    photo_url: photo && photo.value ? `/uploads/${photo.value}` : null,
  };
}

module.exports = (db, { uploadsDir }) => {
  const router = express.Router();
  const upload = makeUpload(uploadsDir);

  router.get('/', (req, res) => res.json(caddyData(db)));

  router.put('/', (req, res) => {
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be a list' });
    db.tx(() => {
      db.prepare('DELETE FROM caddy_items').run();
      const ins = db.prepare('INSERT INTO caddy_items (text, sort_order, category) VALUES (?, ?, ?)');
      items
        .map(x => (typeof x === 'string' ? { text: x, category: 'chemicals' } : { text: x && x.text, category: catOf(x && x.category) }))
        .filter(x => x.text && String(x.text).trim())
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)) // stable: keeps order within a group
        .forEach((x, i) => ins.run(String(x.text).trim(), i, x.category));
    });
    emit();
    res.json({ ok: true });
  });

  router.post('/photo', handleUpload(upload.single('photo')), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a photo' });
    const old = db.prepare("SELECT value FROM settings WHERE key = 'caddy_photo'").get();
    if (old && old.value) { try { fs.unlinkSync(path.join(uploadsDir, old.value)); } catch (_) {} }
    db.prepare("INSERT INTO settings (key, value) VALUES ('caddy_photo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(req.file.filename);
    emit();
    res.json({ ok: true });
  });

  return router;
};

module.exports.caddyData = caddyData;
