const LEVELS = ['not_started', 'introduced', 'practicing', 'competent'];

// 'competent' | 'reassess' | 'overdue' | 'in_progress'
function competencyStatus(c, today) {
  if (c.reassess_flag) return 'reassess';
  if (c.level === 'competent') return 'competent';
  if (c.due_date && c.due_date < today) return 'overdue';
  return 'in_progress';
}

// Insert the trainee×skill competency if missing; return its id either way.
function ensureCompetency(db, staffId, skillId, { required = 0, due_date = null } = {}) {
  const existing = db.prepare('SELECT id FROM competencies WHERE staff_id = ? AND skill_id = ?').get(staffId, skillId);
  if (existing) return existing.id;
  return Number(db.prepare('INSERT INTO competencies (staff_id, skill_id, required, due_date) VALUES (?, ?, ?, ?)')
    .run(staffId, skillId, required ? 1 : 0, due_date).lastInsertRowid);
}

module.exports = { LEVELS, competencyStatus, ensureCompetency };
