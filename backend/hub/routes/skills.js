const express = require('express');
const { emit } = require('../emitter');

function loadSkills(db, includeArchived) {
  const skills = db.prepare(`SELECT * FROM skills ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY sort_order, id`).all();
  const crit = db.prepare('SELECT id, text FROM skill_criteria WHERE skill_id = ? ORDER BY sort_order, id');
  const mods = db.prepare('SELECT id, title, notes FROM skill_default_modules WHERE skill_id = ? ORDER BY sort_order, id');
  return skills.map(s => ({ ...s, criteria: crit.all(s.id), default_modules: mods.all(s.id) }));
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => res.json(loadSkills(db, req.query.include_archived === '1')));

  router.post('/', (req, res) => {
    const { name, icon, category, required } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM skills').get().m;
    const id = db.prepare('INSERT INTO skills (name, icon, category, required, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(String(name).trim(), icon || 'badge-check', category || null, required ? 1 : 0, max + 1).lastInsertRowid;
    emit();
    res.json({ id: Number(id) });
  });

  router.put('/order', (req, res) => {
    const ids = (req.body && req.body.ids) || [];
    db.tx(() => {
      const upd = db.prepare('UPDATE skills SET sort_order = ? WHERE id = ?');
      ids.forEach((id, i) => upd.run(i, id));
    });
    emit();
    res.json({ ok: true });
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Skill not found' });
    const b = req.body || {};
    if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'Name is required' });
    db.tx(() => {
      db.prepare('UPDATE skills SET name=?, icon=?, category=?, required=?, archived=? WHERE id=?').run(
        b.name !== undefined ? String(b.name).trim() : existing.name,
        b.icon !== undefined ? b.icon : existing.icon,
        b.category !== undefined ? b.category : existing.category,
        b.required !== undefined ? (b.required ? 1 : 0) : existing.required,
        b.archived !== undefined ? (b.archived ? 1 : 0) : existing.archived,
        id,
      );
      if (Array.isArray(b.criteria)) {
        db.prepare('DELETE FROM skill_criteria WHERE skill_id = ?').run(id);
        const ins = db.prepare('INSERT INTO skill_criteria (skill_id, text, sort_order) VALUES (?, ?, ?)');
        b.criteria.filter(t => t && String(t).trim()).forEach((t, i) => ins.run(id, String(t).trim(), i));
      }
      if (Array.isArray(b.default_modules)) {
        db.prepare('DELETE FROM skill_default_modules WHERE skill_id = ?').run(id);
        const ins = db.prepare('INSERT INTO skill_default_modules (skill_id, title, notes, sort_order) VALUES (?, ?, ?, ?)');
        b.default_modules.filter(m => m && m.title && String(m.title).trim())
          .forEach((m, i) => ins.run(id, String(m.title).trim(), m.notes || null, i));
      }
    });
    emit();
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const used = db.prepare('SELECT COUNT(*) n FROM competencies WHERE skill_id = ?').get(id).n
      + db.prepare('SELECT COUNT(*) n FROM plan_modules WHERE skill_id = ?').get(id).n;
    if (used > 0) return res.status(409).json({ error: 'Skill is in use — archive it instead' });
    db.prepare('DELETE FROM skills WHERE id = ?').run(id);
    emit();
    res.json({ ok: true });
  });

  return router;
};
