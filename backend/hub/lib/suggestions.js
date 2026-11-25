const { competencyStatus } = require('./competency');

// The trainee's competency picture plus suggested modules for every skill
// that is not yet competent (incl. flagged for reassessment), weakest first.
function planSuggestions(db, staffId, today) {
  const comps = db.prepare(`
    SELECT c.*, k.name AS skill_name, k.sort_order AS skill_sort,
      (SELECT a.notes FROM assessments a WHERE a.competency_id = c.id ORDER BY a.date DESC, a.id DESC LIMIT 1) AS last_notes
    FROM competencies c JOIN skills k ON k.id = c.skill_id
    WHERE c.staff_id = ? ORDER BY k.sort_order, k.id
  `).all(staffId).map(c => ({ ...c, status: competencyStatus(c, today) }));

  const competencies = comps.map(c => ({
    competency_id: c.id, skill_id: c.skill_id, skill_name: c.skill_name, level: c.level,
    progress: c.progress, status: c.status, required: c.required, last_notes: c.last_notes,
  }));

  const weak = comps.filter(c => c.status !== 'competent')
    .sort((a, b) => (a.progress - b.progress) || (a.skill_sort - b.skill_sort));
  const mods = db.prepare('SELECT title, notes FROM skill_default_modules WHERE skill_id = ? ORDER BY sort_order, id');
  const suggestions = [];
  for (const c of weak) {
    for (const m of mods.all(c.skill_id)) {
      suggestions.push({ skill_id: c.skill_id, skill_name: c.skill_name, progress: c.progress, status: c.status, title: m.title, notes: m.notes });
    }
  }
  return { competencies, suggestions };
}

// Snapshot of a trainee's competencies, used to detect changes after a plan is published.
function competencySnapshot(db, staffId) {
  const snap = {};
  for (const c of db.prepare('SELECT skill_id, level, progress FROM competencies WHERE staff_id = ?').all(staffId)) {
    snap[c.skill_id] = `${c.level}:${c.progress}`;
  }
  return snap;
}

module.exports = { planSuggestions, competencySnapshot };
