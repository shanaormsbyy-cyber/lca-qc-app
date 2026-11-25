const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Database } = require('node-sqlite3-wasm');
const { POINTS, adjustScore, complaintDeduction, deductionsByStaff, periodStart } = require('../lib/complaintScore');

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-cs-'));
  const db = new Database(path.join(dir, 't.db'));
  const _prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const s = _prepare(sql);
    const wrap = (fn) => (...a) => fn((a.length === 1 && Array.isArray(a[0])) ? a[0] : a);
    s.run = wrap(s.run.bind(s)); s.get = wrap(s.get.bind(s)); s.all = wrap(s.all.bind(s));
    return s;
  };
  db.exec(`CREATE TABLE complaints (id INTEGER PRIMARY KEY, staff_id INTEGER, severity TEXT, date TEXT, resolution TEXT)`);
  return db;
}

test('points per severity', () => {
  assert.deepEqual(POINTS, { minor: 0.5, moderate: 1, serious: 4 });
});

test('adjustScore subtracts points, floors at 0, keeps null', () => {
  assert.equal(adjustScore(92, 4), 88);
  assert.equal(adjustScore(91.5, 0.5), 91);
  assert.equal(adjustScore(2, 4), 0);
  assert.equal(adjustScore(null, 4), null);
  assert.equal(adjustScore(83.333, 1), 82.3);
});

test('periodStart maps period keys to dates', () => {
  assert.equal(periodStart('90d', '2026-11-25'), '2026-08-27');
  assert.equal(periodStart('30d', '2026-11-25'), '2026-10-26');
  assert.equal(periodStart('12m', '2026-11-25'), '2025-11-25');
  assert.equal(periodStart('all', '2026-11-25'), null);
});

test('complaintDeduction counts only complaints inside the window, addressed or not', () => {
  const db = makeDb();
  const ins = db.prepare('INSERT INTO complaints (staff_id, severity, date, resolution) VALUES (?, ?, ?, ?)');
  ins.run(1, 'serious', '2026-11-20', 'Coached');      // addressed still counts
  ins.run(1, 'minor', '2026-11-01', null);
  ins.run(1, 'moderate', '2026-06-01', null);          // outside 90 days
  ins.run(2, 'moderate', '2026-11-10', null);
  const d = complaintDeduction(db, 1, { from: '2026-08-27', to: '2026-11-25' });
  assert.deepEqual(d, { points: 4.5, minor: 1, moderate: 0, serious: 1, count: 2 });
  assert.equal(complaintDeduction(db, 3, { from: '2026-08-27', to: '2026-11-25' }).points, 0);
  const all = deductionsByStaff(db, { from: '2026-08-27', to: '2026-11-25' });
  assert.equal(all[1].points, 4.5);
  assert.equal(all[2].points, 1);
  assert.equal(all[3], undefined);
  assert.equal(complaintDeduction(db, 1, { from: null, to: '2026-11-25' }).points, 5.5);
});

test('round1 is stable for floating-point averages', () => {
  const { round1 } = require('../lib/complaintScore');
  assert.equal(round1(79.04999999999998), 79.1);
  assert.equal(round1(79.05), 79.1);
  assert.equal(adjustScore(79.04999999999998, 4.5), 74.6);
});
