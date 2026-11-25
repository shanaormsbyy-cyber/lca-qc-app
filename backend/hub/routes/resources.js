const express = require('express');
const fs = require('fs');
const path = require('path');
const { emit } = require('../emitter');
const { makeUpload, handleUpload, cleanupFiles } = require('../middleware/upload');

const TYPES = ['video', 'guide', 'image', 'template'];

module.exports = (db, { uploadsDir }) => {
  const router = express.Router();
  const upload = makeUpload(uploadsDir);

  const withUrl = (r) => ({ ...r, url: r.url || (r.file_path ? `/uploads/${r.file_path}` : null), is_link: !!r.url });

  // ── Categories ──
  router.get('/categories', (req, res) => res.json(db.prepare('SELECT * FROM resource_categories ORDER BY sort_order, id').all()));
  router.post('/categories', (req, res) => {
    const name = req.body && req.body.name && String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM resource_categories').get().m;
      const id = db.prepare('INSERT INTO resource_categories (name, sort_order) VALUES (?, ?)').run(name, max + 1).lastInsertRowid;
      emit();
      res.json({ id: Number(id) });
    } catch (e) { res.status(409).json({ error: 'A category with that name already exists' }); }
  });
  router.put('/categories/:id', (req, res) => {
    const name = req.body && req.body.name && String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    db.prepare('UPDATE resource_categories SET name = ? WHERE id = ?').run(name, Number(req.params.id));
    emit();
    res.json({ ok: true });
  });
  router.delete('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    if (db.prepare('SELECT COUNT(*) n FROM resources WHERE category_id = ?').get(id).n > 0) {
      return res.status(409).json({ error: 'Category has resources — move or delete them first' });
    }
    db.prepare('DELETE FROM resource_categories WHERE id = ?').run(id);
    emit();
    res.json({ ok: true });
  });

  router.get('/summary', (req, res) => {
    const out = { video: 0, guide: 0, image: 0, template: 0 };
    for (const r of db.prepare('SELECT type, COUNT(*) n FROM resources GROUP BY type').all()) out[r.type] = r.n;
    out.categories = db.prepare(`SELECT c.id, c.name, (SELECT COUNT(*) FROM resources r WHERE r.category_id = c.id) AS count
      FROM resource_categories c ORDER BY c.sort_order, c.id`).all();
    res.json(out);
  });

  // ── Resources ──
  router.get('/', (req, res) => {
    let sql = `SELECT r.*, c.name AS category_name, s.name AS system_name FROM resources r
      LEFT JOIN resource_categories c ON c.id = r.category_id LEFT JOIN training_systems s ON s.id = r.system_id WHERE 1 = 1`;
    const params = [];
    if (req.query.type) { sql += ' AND r.type = ?'; params.push(req.query.type); }
    if (req.query.category_id) { sql += ' AND r.category_id = ?'; params.push(Number(req.query.category_id)); }
    if (req.query.system_id) { sql += ' AND r.system_id = ?'; params.push(Number(req.query.system_id)); }
    if (req.query.q) { sql += ' AND r.title LIKE ?'; params.push(`%${req.query.q}%`); }
    sql += ' ORDER BY r.created_at DESC, r.id DESC';
    res.json(db.prepare(sql).all(...params).map(withUrl));
  });

  router.post('/', handleUpload(upload.single('file')), (req, res) => {
    const b = req.body || {};
    const fail = (status, error) => { cleanupFiles(req); res.status(status).json({ error }); };
    if (!b.title || !String(b.title).trim()) return fail(400, 'Title is required');
    if (!TYPES.includes(b.type)) return fail(400, 'Type must be video, guide, image or template');
    const url = b.url && String(b.url).trim();
    if (!!url === !!req.file) return fail(400, 'Add either a file or a link');
    if (b.category_id && !db.prepare('SELECT id FROM resource_categories WHERE id = ?').get(Number(b.category_id))) return fail(400, 'Unknown category');
    if (b.system_id && !db.prepare('SELECT id FROM training_systems WHERE id = ?').get(Number(b.system_id))) return fail(400, 'Unknown training system');
    const id = db.prepare(`INSERT INTO resources (title, type, category_id, system_id, file_path, url, original_name, size, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      String(b.title).trim(), b.type, b.category_id ? Number(b.category_id) : null, b.system_id ? Number(b.system_id) : null,
      req.file ? req.file.filename : null, url || null, req.file ? req.file.originalname : null, req.file ? req.file.size : null, req.manager.id,
    ).lastInsertRowid;
    emit();
    res.json({ id: Number(id) });
  });

  router.put('/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM resources WHERE id = ?').get(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    if (b.type !== undefined && !TYPES.includes(b.type)) return res.status(400).json({ error: 'Invalid type' });
    db.prepare('UPDATE resources SET title = ?, type = ?, category_id = ?, system_id = ?, url = ? WHERE id = ?').run(
      b.title && String(b.title).trim() ? String(b.title).trim() : r.title,
      b.type || r.type,
      b.category_id !== undefined ? b.category_id : r.category_id,
      b.system_id !== undefined ? b.system_id : r.system_id,
      r.file_path ? null : (b.url !== undefined ? b.url : r.url),
      r.id,
    );
    emit();
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM resources WHERE id = ?').get(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.file_path) { try { fs.unlinkSync(path.join(uploadsDir, r.file_path)); } catch (_) {} }
    db.prepare('DELETE FROM resources WHERE id = ?').run(r.id);
    emit();
    res.json({ ok: true });
  });

  return router;
};
