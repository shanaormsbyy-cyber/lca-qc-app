const express = require('express');
const { emit } = require('../emitter');
const { today } = require('../lib/dates');
const { usageCounts } = require('../lib/usage');

module.exports = (db) => {
  const router = express.Router();

  const trainersOf = db.prepare(`SELECT m.id, m.name FROM system_trainers st JOIN managers m ON m.id = st.manager_id
    WHERE st.system_id = ? ORDER BY m.name`);

  function listSystems(includeArchived = false) {
    const usage = usageCounts(db, today());
    return db.prepare(`
      SELECT ts.*, c.name AS category_name, c.color AS category_color,
        (SELECT COUNT(*) FROM system_modules sm WHERE sm.system_id = ts.id) AS module_count
      FROM training_systems ts LEFT JOIN system_categories c ON c.id = ts.category_id
      ${includeArchived ? '' : 'WHERE ts.archived = 0'} ORDER BY ts.sort_order, ts.id
    `).all().map(s => ({ ...s, trainers: trainersOf.all(s.id), uses: usage.bySystem[s.id] || 0 }));
  }

  // ── Categories ──
  router.get('/categories', (req, res) => {
    res.json(db.prepare('SELECT * FROM system_categories ORDER BY sort_order, id').all());
  });
  router.post('/categories', (req, res) => {
    const { name, color } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    try {
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM system_categories').get().m;
      const id = db.prepare('INSERT INTO system_categories (name, color, sort_order) VALUES (?, ?, ?)').run(String(name).trim(), color || '#3AB5D9', max + 1).lastInsertRowid;
      emit();
      res.json({ id: Number(id) });
    } catch (e) {
      res.status(409).json({ error: 'A category with that name already exists' });
    }
  });
  router.put('/categories/:id', (req, res) => {
    const { name, color } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    db.prepare('UPDATE system_categories SET name = ?, color = ? WHERE id = ?').run(String(name).trim(), color || '#3AB5D9', Number(req.params.id));
    emit();
    res.json({ ok: true });
  });
  router.delete('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    if (db.prepare('SELECT COUNT(*) n FROM training_systems WHERE category_id = ?').get(id).n > 0) {
      return res.status(409).json({ error: 'Category is in use by a training system' });
    }
    db.prepare('DELETE FROM system_categories WHERE id = ?').run(id);
    emit();
    res.json({ ok: true });
  });

  router.get('/usage', (req, res) => res.json(usageCounts(db, today())));

  // ── Systems ──
  router.get('/', (req, res) => res.json(listSystems(req.query.include_archived === '1')));

  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const s = db.prepare(`SELECT ts.*, c.name AS category_name, c.color AS category_color FROM training_systems ts
      LEFT JOIN system_categories c ON c.id = ts.category_id WHERE ts.id = ?`).get(id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const usage = usageCounts(db, today());
    res.json({
      ...s,
      uses: usage.bySystem[id] || 0,
      trainers: trainersOf.all(id),
      modules: db.prepare('SELECT id, title, content FROM system_modules WHERE system_id = ? ORDER BY sort_order, id').all(id),
      resources: db.prepare(`SELECT id, title, type, url, file_path FROM resources WHERE system_id = ? ORDER BY title`).all(id)
        .map(r => ({ ...r, url: r.url || (r.file_path ? `/uploads/${r.file_path}` : null) })),
    });
  });

  function writeChildren(id, b) {
    if (Array.isArray(b.modules)) {
      db.prepare('DELETE FROM system_modules WHERE system_id = ?').run(id);
      const ins = db.prepare('INSERT INTO system_modules (system_id, title, content, sort_order) VALUES (?, ?, ?, ?)');
      // A blurb needs a heading or some text (the heading is optional).
      b.modules
        .map(m => ({ title: String((m && m.title) || '').trim(), content: String((m && m.content) || '').trim() }))
        .filter(m => m.title || m.content)
        .forEach((m, i) => ins.run(id, m.title, m.content || null, i));
    }
    if (Array.isArray(b.trainer_ids)) {
      db.prepare('DELETE FROM system_trainers WHERE system_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO system_trainers (system_id, manager_id) VALUES (?, ?)');
      b.trainer_ids.forEach(mid => ins.run(id, mid));
    }
  }

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Name is required' });
    const id = db.tx(() => {
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM training_systems').get().m;
      const sid = Number(db.prepare(`INSERT INTO training_systems (name, description, icon, category_id, sort_order) VALUES (?, ?, ?, ?, ?)`)
        .run(String(b.name).trim(), b.description || null, b.icon || 'book-open', b.category_id || null, max + 1).lastInsertRowid);
      writeChildren(sid, b);
      return sid;
    });
    emit();
    res.json({ id });
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const s = db.prepare('SELECT * FROM training_systems WHERE id = ?').get(id);
    if (!s) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'Name is required' });
    db.tx(() => {
      db.prepare(`UPDATE training_systems SET name = ?, description = ?, icon = ?, category_id = ?, archived = ?, updated_at = datetime('now') WHERE id = ?`).run(
        b.name !== undefined ? String(b.name).trim() : s.name,
        b.description !== undefined ? b.description : s.description,
        b.icon !== undefined ? b.icon : s.icon,
        b.category_id !== undefined ? b.category_id : s.category_id,
        b.archived !== undefined ? (b.archived ? 1 : 0) : s.archived,
        id,
      );
      writeChildren(id, b);
    });
    emit();
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const used = db.prepare('SELECT COUNT(*) n FROM plan_modules WHERE system_id = ?').get(id).n
      + db.prepare('SELECT COUNT(*) n FROM shadow_shift_methods WHERE system_id = ?').get(id).n;
    if (used > 0) return res.status(409).json({ error: 'Training system is in use — archive it instead' });
    db.prepare('DELETE FROM training_systems WHERE id = ?').run(id);
    emit();
    res.json({ ok: true });
  });

  return router;
};
