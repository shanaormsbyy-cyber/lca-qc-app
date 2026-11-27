const STAGES = ['Setup & Induction', 'Foundations Training', 'Room Competencies', 'Shadow Period', 'Final Assessment & Sign Off'];

// Shadow period status: 'signed_off' | 'ready' | 'review_due' | 'in_progress'
function shadowStatus(period, shifts, today) {
  if (period.status === 'signed_off') return 'signed_off';
  const reviewed = shifts.filter(s => s.reviewed).length;
  if (reviewed >= period.shift_count) return 'ready';
  if (shifts.some(s => s.date && s.date <= today && !s.reviewed)) return 'review_due';
  return 'in_progress';
}

const frac = (done, total) => (total > 0 ? Math.min(done / total, 1) : 0);

// Journey-weighted: each stage is 20%; the current stage earns partial credit from its own measure.
function onboardingProgress(ob, p) {
  if (ob.status === 'completed') return 100;
  const stage = Math.min(Math.max(ob.stage || 1, 1), 5);
  const fractions = {
    1: frac(p.checklistDone, p.checklistTotal),
    2: frac(p.modulesDone, p.modulesTotal),
    3: frac(p.requiredCompetent, p.requiredTotal),
    4: frac(p.shiftsReviewed, p.shiftCount),
    5: 0,
  };
  return (stage - 1) * 20 + Math.round(20 * fractions[stage]);
}

function onboardingDisplayStatus(ob, today) {
  if (ob.status === 'completed') return 'completed';
  if (ob.start_date && ob.start_date > today) return 'starting_soon';
  return 'in_progress';
}

// The shadow period that counts for an onboarding: linked one first, else the trainee's latest.
function linkedShadowPeriod(db, ob) {
  return db.prepare('SELECT * FROM shadow_periods WHERE onboarding_id = ? ORDER BY id DESC LIMIT 1').get(ob.id)
    || db.prepare('SELECT * FROM shadow_periods WHERE staff_id = ? ORDER BY id DESC LIMIT 1').get(ob.staff_id)
    || null;
}

function onboardingParts(db, ob) {
  const cl = db.prepare('SELECT COUNT(*) total, COALESCE(SUM(done), 0) done FROM onboarding_checklist_items WHERE onboarding_id = ?').get(ob.id);
  // Stage 2 (Foundations): rooms that have teaching prompts vs rooms gone through with this trainee.
  const mods = db.prepare(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM foundation_room_progress fp WHERE fp.staff_id = ? AND fp.room_id = r.id) THEN 1 ELSE 0 END), 0) done
    FROM foundation_rooms r WHERE EXISTS (SELECT 1 FROM foundation_room_prompts f WHERE f.room_id = r.id)`).get(ob.staff_id);
  const req = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN level = 'competent' AND reassess_flag = 0 THEN 1 ELSE 0 END), 0) done
    FROM competencies WHERE staff_id = ? AND required = 1`).get(ob.staff_id);
  const sp = linkedShadowPeriod(db, ob);
  const reviewed = sp ? db.prepare('SELECT COUNT(*) n FROM shadow_shifts WHERE shadow_period_id = ? AND reviewed = 1').get(sp.id).n : 0;
  return {
    checklistDone: cl.done, checklistTotal: cl.total,
    modulesDone: mods.done, modulesTotal: mods.total,
    requiredCompetent: req.done, requiredTotal: req.total,
    shiftsReviewed: reviewed, shiftCount: sp ? sp.shift_count : 0,
  };
}

module.exports = { STAGES, shadowStatus, onboardingProgress, onboardingDisplayStatus, onboardingParts, linkedShadowPeriod };
