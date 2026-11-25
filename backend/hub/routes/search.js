const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const like = `%${q}%`;
    const out = [];
    for (const r of db.prepare('SELECT id, name FROM staff WHERE archived = 0 AND name LIKE ? ORDER BY name LIMIT 10').all(like)) {
      out.push({ type: 'trainee', id: r.id, label: r.name, link: `/training-hub/trainees/${r.id}` });
    }
    for (const r of db.prepare('SELECT id, title FROM plans WHERE is_template = 0 AND title LIKE ? ORDER BY updated_at DESC LIMIT 10').all(like)) {
      out.push({ type: 'plan', id: r.id, label: r.title, link: `/training-hub/plans/${r.id}` });
    }
    for (const r of db.prepare('SELECT id, name FROM skills WHERE archived = 0 AND name LIKE ? ORDER BY sort_order LIMIT 10').all(like)) {
      out.push({ type: 'skill', id: r.id, label: r.name, link: `/training-hub/competencies?skill_id=${r.id}` });
    }
    for (const r of db.prepare('SELECT id, name FROM training_systems WHERE archived = 0 AND name LIKE ? ORDER BY sort_order LIMIT 10').all(like)) {
      out.push({ type: 'system', id: r.id, label: r.name, link: `/training-hub/systems/${r.id}` });
    }
    res.json(out.slice(0, 10));
  });

  return router;
};
