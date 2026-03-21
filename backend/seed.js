const bcrypt = require('bcryptjs');
const db = require('./db');

console.log('Seeding database...');

// Clear existing data
db.exec(`
  DELETE FROM qc_check_items;
  DELETE FROM qc_checks;
  DELETE FROM qc_checklist_items;
  DELETE FROM qc_checklists;
  DELETE FROM training_session_items;
  DELETE FROM training_sessions;
  DELETE FROM training_checklist_items;
  DELETE FROM training_checklist_sections;
  DELETE FROM training_checklists;
  DELETE FROM staff;
  DELETE FROM properties;
  DELETE FROM managers;
`);

// ─── Managers ─────────────────────────────────────────────────────────────────
const insertManager = db.prepare('INSERT INTO managers (username, password_hash, name) VALUES (?, ?, ?)');
const m1 = insertManager.run('admin',  bcrypt.hashSync('admin123', 10), 'Admin').lastInsertRowid;
const m2 = insertManager.run('sarah',  bcrypt.hashSync('sarah123', 10), 'Sarah Mitchell').lastInsertRowid;
const m3 = insertManager.run('james',  bcrypt.hashSync('james123', 10), 'James Carter').lastInsertRowid;

// ─── Staff ────────────────────────────────────────────────────────────────────
const insertStaff = db.prepare('INSERT INTO staff (name, role, start_date) VALUES (?, ?, ?)');
const s1 = insertStaff.run('Maria Santos',   'Cleaner',        '2025-07-01').lastInsertRowid;
const s2 = insertStaff.run('Josh Williams',  'Cleaner',        '2025-09-15').lastInsertRowid;
const s3 = insertStaff.run('Emma Taylor',    'Senior Cleaner', '2025-03-01').lastInsertRowid;

// ─── Properties ───────────────────────────────────────────────────────────────
const insertProp = db.prepare('INSERT INTO properties (name, address, airbnb_id) VALUES (?, ?, ?)');
const p1 = insertProp.run('Harbour View Apartment', '23 Alma St, Hamilton', 'AIRBNB-HV001').lastInsertRowid;
const p2 = insertProp.run('Garden Terrace House',   '45 Peachgrove Rd, Hamilton', 'AIRBNB-GT002').lastInsertRowid;
const p3 = insertProp.run('City Centre Studio',     '8 Victoria St, Hamilton', 'AIRBNB-CC003').lastInsertRowid;

// ─── Training Checklists ──────────────────────────────────────────────────────
const insertCL = db.prepare('INSERT INTO training_checklists (name, description) VALUES (?, ?)');
const insertSec = db.prepare('INSERT INTO training_checklist_sections (checklist_id, name, order_idx) VALUES (?, ?, ?)');
const insertItem = db.prepare('INSERT INTO training_checklist_items (section_id, text, order_idx) VALUES (?, ?, ?)');

// Checklist 1 — New Hire Induction
const cl1 = insertCL.run('New Hire Induction', 'Standard onboarding checklist for all new cleaning staff').lastInsertRowid;

const cl1s1 = insertSec.run(cl1, 'Safety & Equipment', 0).lastInsertRowid;
insertItem.run(cl1s1, 'Understands correct PPE usage (gloves, apron, footwear)', 0);
insertItem.run(cl1s1, 'Can identify and correctly use all cleaning chemicals', 1);
insertItem.run(cl1s1, 'Knows emergency procedures and first aid kit location', 2);
insertItem.run(cl1s1, 'Has been shown safe lifting and handling techniques', 3);

const cl1s2 = insertSec.run(cl1, 'Arrival & Property Protocol', 1).lastInsertRowid;
insertItem.run(cl1s2, 'Knows how to access lockboxes and key handling procedure', 0);
insertItem.run(cl1s2, 'Understands punctuality expectations and check-in process', 1);
insertItem.run(cl1s2, 'Can correctly assess property condition on arrival', 2);
insertItem.run(cl1s2, 'Knows how to report maintenance issues', 3);

const cl1s3 = insertSec.run(cl1, 'Bedroom Standards', 2).lastInsertRowid;
insertItem.run(cl1s3, 'Demonstrated correct bed-making technique (hospital corners)', 0);
insertItem.run(cl1s3, 'Knows pillow and linen placement standards', 1);
insertItem.run(cl1s3, 'Can identify and report damaged/stained linen', 2);
insertItem.run(cl1s3, 'Dusting order correct (top to bottom)', 3);
insertItem.run(cl1s3, 'Vacuuming technique and coverage understood', 4);

const cl1s4 = insertSec.run(cl1, 'Bathroom Standards', 3).lastInsertRowid;
insertItem.run(cl1s4, 'Correct toilet cleaning sequence demonstrated', 0);
insertItem.run(cl1s4, 'Shower/bath scrubbing technique and products used correctly', 1);
insertItem.run(cl1s4, 'Mirror and glass streak-free cleaning demonstrated', 2);
insertItem.run(cl1s4, 'Knows towel folding and presentation standards', 3);
insertItem.run(cl1s4, 'Correct restocking of amenities (soap, TP, shampoo)', 4);

const cl1s5 = insertSec.run(cl1, 'Kitchen Standards', 4).lastInsertRowid;
insertItem.run(cl1s5, 'Bench wipe-down order and technique correct', 0);
insertItem.run(cl1s5, 'Appliance cleaning (microwave, stovetop, oven exterior)', 1);
insertItem.run(cl1s5, 'Sink and tap polishing technique demonstrated', 2);
insertItem.run(cl1s5, 'Correct dishwasher and rubbish bin procedures', 3);
insertItem.run(cl1s5, 'Knows which consumables to restock (coffee, tea, oil, etc.)', 4);

const cl1s6 = insertSec.run(cl1, 'Final Checks & Sign-off', 5).lastInsertRowid;
insertItem.run(cl1s6, 'Completes self-check walkthrough before leaving', 0);
insertItem.run(cl1s6, 'Knows photo documentation requirements', 1);
insertItem.run(cl1s6, 'Can complete the digital job sign-off correctly', 2);
insertItem.run(cl1s6, 'Understands what to do if running over time', 3);

// Checklist 2 — Deep Clean Certification
const cl2 = insertCL.run('Deep Clean Certification', 'Advanced certification for deep cleaning procedures').lastInsertRowid;

const cl2s1 = insertSec.run(cl2, 'Pre-Clean Assessment', 0).lastInsertRowid;
insertItem.run(cl2s1, 'Can identify areas requiring special attention or chemicals', 0);
insertItem.run(cl2s1, 'Creates a cleaning priority plan before starting', 1);
insertItem.run(cl2s1, 'Documents pre-existing damage accurately', 2);

const cl2s2 = insertSec.run(cl2, 'Deep Clean Methodology', 1).lastInsertRowid;
insertItem.run(cl2s2, 'Knows soaking/dwell time for heavy soiling products', 0);
insertItem.run(cl2s2, 'Correct tile and grout scrubbing technique', 1);
insertItem.run(cl2s2, 'Limescale removal on taps and showerheads', 2);
insertItem.run(cl2s2, 'Oven interior deep clean (racks, glass, cavity)', 3);
insertItem.run(cl2s2, 'Fridge interior and seal cleaning', 4);

const cl2s3 = insertSec.run(cl2, 'Specialty Areas', 2).lastInsertRowid;
insertItem.run(cl2s3, 'Balcony and outdoor furniture cleaning standards', 0);
insertItem.run(cl2s3, 'Window interior and track cleaning', 1);
insertItem.run(cl2s3, 'Washing machine drum and filter cleaning', 2);
insertItem.run(cl2s3, 'Mattress vacuuming and spot treatment', 3);

const cl2s4 = insertSec.run(cl2, 'Quality Verification', 3).lastInsertRowid;
insertItem.run(cl2s4, 'Passes white-glove test in all areas', 0);
insertItem.run(cl2s4, 'Photo documentation of before/after completed', 1);
insertItem.run(cl2s4, 'Completes deep clean report form accurately', 2);

// ─── QC Checklists ────────────────────────────────────────────────────────────
const insertQCCL = db.prepare('INSERT INTO qc_checklists (name, description) VALUES (?, ?)');
const insertQCItem = db.prepare('INSERT INTO qc_checklist_items (checklist_id, text, category, score_type, weight, order_idx) VALUES (?, ?, ?, ?, ?, ?)');

// QC Checklist 1 — Standard Property Check
const qcl1 = insertQCCL.run('Standard Property Check', 'Routine inspection after a standard clean').lastInsertRowid;
let qi = 0;
insertQCItem.run(qcl1, 'Entry and hallway clean and tidy',           'Entry & Common Areas', 'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Living area vacuumed and surfaces dusted',   'Entry & Common Areas', '1_to_5',   2, qi++);
insertQCItem.run(qcl1, 'No visible marks or fingerprints on surfaces','Entry & Common Areas', 'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Bed made to standard (hospital corners)',    'Bedrooms',             '1_to_5',   2, qi++);
insertQCItem.run(qcl1, 'Linen fresh and free of stains',             'Bedrooms',             'pass_fail', 2, qi++);
insertQCItem.run(qcl1, 'Wardrobes/drawers wiped, hangers straight',  'Bedrooms',             'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Toilet clean inside and outside',            'Bathrooms',            '1_to_5',   2, qi++);
insertQCItem.run(qcl1, 'Shower/bath scrubbed, no soap scum',         'Bathrooms',            '1_to_5',   2, qi++);
insertQCItem.run(qcl1, 'Mirrors streak-free',                        'Bathrooms',            'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Amenities restocked correctly',              'Bathrooms',            'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Benchtops wiped and clear',                  'Kitchen & Living',     '1_to_5',   2, qi++);
insertQCItem.run(qcl1, 'Sink and taps polished',                     'Kitchen & Living',     'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Stovetop and microwave clean',               'Kitchen & Living',     '1_to_5',   2, qi++);
insertQCItem.run(qcl1, 'Appliances correctly positioned',            'Kitchen & Living',     'pass_fail', 1, qi++);
insertQCItem.run(qcl1, 'Overall presentation guest-ready',           'Final Presentation',   '1_to_5',   3, qi++);
insertQCItem.run(qcl1, 'No cleaning products or equipment left behind','Final Presentation', 'pass_fail', 2, qi++);

// QC Checklist 2 — Deep Clean Audit
const qcl2 = insertQCCL.run('Deep Clean Audit', 'Thorough audit following a deep clean session').lastInsertRowid;
qi = 0;
insertQCItem.run(qcl2, 'Grout and tile lines clean',                 'Bathroom Deep Clean',  '1_to_5',   3, qi++);
insertQCItem.run(qcl2, 'Limescale removed from taps and showerhead', 'Bathroom Deep Clean',  '1_to_5',   2, qi++);
insertQCItem.run(qcl2, 'Toilet base and behind toilet cleaned',      'Bathroom Deep Clean',  'pass_fail', 2, qi++);
insertQCItem.run(qcl2, 'Oven interior spotless (racks, glass, cavity)', 'Kitchen Deep Clean','1_to_5',   3, qi++);
insertQCItem.run(qcl2, 'Fridge interior and door seals cleaned',     'Kitchen Deep Clean',   '1_to_5',   2, qi++);
insertQCItem.run(qcl2, 'Range hood filter cleaned or replaced',      'Kitchen Deep Clean',   'pass_fail', 2, qi++);
insertQCItem.run(qcl2, 'Windows and tracks cleaned',                 'Specialty Areas',      '1_to_5',   2, qi++);
insertQCItem.run(qcl2, 'Balcony/outdoor area cleaned',               'Specialty Areas',      'pass_fail', 1, qi++);
insertQCItem.run(qcl2, 'Mattresses vacuumed',                        'Specialty Areas',      'pass_fail', 2, qi++);
insertQCItem.run(qcl2, 'White-glove test passed across all surfaces','Completion Standards', '1_to_5',   3, qi++);
insertQCItem.run(qcl2, 'Before/after photos completed',              'Completion Standards', 'pass_fail', 1, qi++);

// ─── Helper: generate date N days ago ─────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function randScore(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

// ─── Historical QC Checks (6 months) ─────────────────────────────────────────
const insertCheck = db.prepare(`
  INSERT INTO qc_checks (property_id, staff_id, checklist_id, scheduled_by_id, assigned_to_id, date, status, total_score, max_score, score_pct, signed_off_by, signed_off_at, notes)
  VALUES (?, ?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, '')
`);
const insertCheckItem = db.prepare('INSERT INTO qc_check_items (check_id, item_id, score, notes) VALUES (?, ?, ?, ?)');

function createQCCheck(propId, staffId, clId, managerId, date, targetPct) {
  const items = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(clId);
  const variance = 8;
  const pct = Math.min(100, Math.max(55, targetPct + (Math.random() * variance * 2 - variance)));

  // Estimate scores to hit target
  let totalScore = 0, maxScore = 0;
  const scores = items.map(item => {
    if (item.score_type === 'pass_fail') {
      const pass = Math.random() * 100 < pct ? 1 : 0;
      totalScore += pass * item.weight;
      maxScore += item.weight;
      return pass;
    } else {
      const s = Math.max(1, Math.min(5, Math.round(pct / 20 + (Math.random() - 0.5))));
      totalScore += s * item.weight;
      maxScore += 5 * item.weight;
      return s;
    }
  });

  const realPct = maxScore ? (totalScore / maxScore) * 100 : 0;
  const managerName = db.prepare('SELECT name FROM managers WHERE id=?').get(managerId).name;
  const checkId = insertCheck.run(propId, staffId, clId, managerId, managerId, date,
    Math.round(totalScore * 10) / 10, Math.round(maxScore * 10) / 10,
    Math.round(realPct * 10) / 10, managerName, date + 'T10:00:00'
  ).lastInsertRowid;

  items.forEach((item, i) => {
    insertCheckItem.run(checkId, item.id, scores[i], '');
  });
  return checkId;
}

// Emma — experienced, high scores (82-95%)
createQCCheck(p1, s3, qcl1, m1, daysAgo(168), 92);
createQCCheck(p2, s3, qcl1, m2, daysAgo(155), 89);
createQCCheck(p3, s3, qcl1, m3, daysAgo(140), 94);
createQCCheck(p1, s3, qcl2, m1, daysAgo(125), 88);
createQCCheck(p2, s3, qcl1, m2, daysAgo(112), 91);
createQCCheck(p3, s3, qcl1, m3, daysAgo(98),  90);
createQCCheck(p1, s3, qcl1, m1, daysAgo(84),  93);
createQCCheck(p2, s3, qcl2, m2, daysAgo(70),  87);
createQCCheck(p3, s3, qcl1, m3, daysAgo(56),  95);
createQCCheck(p1, s3, qcl1, m1, daysAgo(42),  91);
createQCCheck(p2, s3, qcl1, m2, daysAgo(28),  94);
createQCCheck(p3, s3, qcl1, m3, daysAgo(14),  92);

// Maria — hired July, improving scores (68-85%)
createQCCheck(p1, s1, qcl1, m2, daysAgo(150), 70);
createQCCheck(p2, s1, qcl1, m3, daysAgo(135), 73);
createQCCheck(p3, s1, qcl1, m1, daysAgo(120), 75);
createQCCheck(p1, s1, qcl1, m2, daysAgo(105), 78);
createQCCheck(p2, s1, qcl1, m3, daysAgo(90),  80);
createQCCheck(p3, s1, qcl2, m1, daysAgo(75),  77);
createQCCheck(p1, s1, qcl1, m2, daysAgo(60),  82);
createQCCheck(p2, s1, qcl1, m3, daysAgo(45),  83);
createQCCheck(p3, s1, qcl1, m1, daysAgo(30),  85);
createQCCheck(p1, s1, qcl1, m2, daysAgo(12),  85);

// Josh — newer hire, more variable (62-80%)
createQCCheck(p2, s2, qcl1, m3, daysAgo(130), 65);
createQCCheck(p3, s2, qcl1, m1, daysAgo(115), 68);
createQCCheck(p1, s2, qcl1, m2, daysAgo(100), 63);
createQCCheck(p2, s2, qcl1, m3, daysAgo(85),  72);
createQCCheck(p3, s2, qcl1, m1, daysAgo(70),  70);
createQCCheck(p1, s2, qcl2, m2, daysAgo(55),  74);
createQCCheck(p2, s2, qcl1, m3, daysAgo(40),  76);
createQCCheck(p3, s2, qcl1, m1, daysAgo(25),  78);
createQCCheck(p1, s2, qcl1, m2, daysAgo(10),  80);

// ─── Training Sessions ────────────────────────────────────────────────────────
const insertSession = db.prepare(`
  INSERT INTO training_sessions
    (trainee_id, checklist_id, scheduled_by_id, assigned_to_id, date, status, completion_pct, signed_off_by, signed_off_at, notes)
  VALUES (?, ?, ?, ?, ?, 'complete', 100, ?, ?, ?)
`);
const insertSessionItem = db.prepare('INSERT INTO training_session_items (session_id, item_id, completed, notes) VALUES (?, ?, ?, ?)');

function createTrainingSession(traineeId, clId, schedulerId, assignedId, date) {
  const managerName = db.prepare('SELECT name FROM managers WHERE id=?').get(assignedId).name;
  const sessionId = insertSession.run(traineeId, clId, schedulerId, assignedId, date, managerName, date + 'T14:00:00', '').lastInsertRowid;
  const items = db.prepare(`
    SELECT tci.id FROM training_checklist_items tci
    JOIN training_checklist_sections tcs ON tcs.id=tci.section_id
    WHERE tcs.checklist_id=?
  `).all(clId);
  items.forEach(item => {
    insertSessionItem.run(sessionId, item.id, 1, '');
  });
  return sessionId;
}

// Maria — New Hire Induction (completed by Sarah, month 1)
createTrainingSession(s1, cl1, m1, m2, daysAgo(145));
// Maria — Deep Clean Cert (completed by James, month 3)
createTrainingSession(s1, cl2, m1, m3, daysAgo(90));

// Josh — New Hire Induction (completed by Admin, recently hired)
createTrainingSession(s2, cl1, m1, m1, daysAgo(120));
// Josh — Deep Clean Cert pending (still in progress)
const pendingSession = db.prepare(`
  INSERT INTO training_sessions (trainee_id, checklist_id, scheduled_by_id, assigned_to_id, date, status, completion_pct, notes)
  VALUES (?, ?, ?, ?, ?, 'pending', 0, 'Scheduled for this month')
`).run(s2, cl2, m1, m3, daysAgo(-5));
const pendingItems = db.prepare(`
  SELECT tci.id FROM training_checklist_items tci
  JOIN training_checklist_sections tcs ON tcs.id=tci.section_id
  WHERE tcs.checklist_id=?
`).all(cl2);
pendingItems.forEach(item => {
  insertSessionItem.run(pendingSession.lastInsertRowid, item.id, 0, '');
});

// Emma — completed both before this seeded period
createTrainingSession(s3, cl1, m1, m2, daysAgo(200));
createTrainingSession(s3, cl2, m1, m3, daysAgo(170));

// Add some pending QC checks
db.prepare(`
  INSERT INTO qc_checks (property_id, staff_id, checklist_id, scheduled_by_id, assigned_to_id, date, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, 'pending', 'Routine monthly check')
`).run(p2, s1, qcl1, m1, m2, daysAgo(-3));
db.prepare(`
  INSERT INTO qc_checks (property_id, staff_id, checklist_id, scheduled_by_id, assigned_to_id, date, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, 'pending', '')
`).run(p3, s2, qcl1, m2, m3, daysAgo(-7));

const itemCount = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=?').all(qcl1);
[...db.prepare('SELECT id FROM qc_checks WHERE status=?').all('pending')].forEach(c => {
  itemCount.forEach(item => {
    db.prepare('INSERT OR IGNORE INTO qc_check_items (check_id, item_id) VALUES (?, ?)').run(c.id, item.id);
  });
});

console.log('✅ Seed complete!');
console.log(`   Managers: 3 (admin/admin123, sarah/sarah123, james/james123)`);
console.log(`   Staff: 3, Properties: 3`);
console.log(`   QC Checks: ${db.prepare('SELECT COUNT(*) as c FROM qc_checks').get().c} (historical + pending)`);
console.log(`   Training Sessions: ${db.prepare('SELECT COUNT(*) as c FROM training_sessions').get().c}`);
