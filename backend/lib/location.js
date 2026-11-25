// Location (area) filter. The browser sends the chosen area, e.g. "Hamilton", in the
// X-Location header; no header = all areas. Staff and properties each have a `location`.
// A QC check / complaint belongs to an area if its property OR any of its cleaners is there.

function getLoc(req) {
  const h = req.get('x-location');
  if (!h) return null;
  try { return decodeURIComponent(h).trim() || null; } catch { return null; }
}

const lit = loc => `'${String(loc).replace(/'/g, "''")}'`;

// SQL fragments (safe literal) for use inside WHERE clauses.
const staffInLoc = (col, loc) => `${col} IN (SELECT id FROM staff WHERE location = ${lit(loc)})`;
const propInLoc = (col, loc) => `${col} IN (SELECT id FROM properties WHERE location = ${lit(loc)})`;
const checkInLoc = (alias, loc) =>
  `(${propInLoc(`${alias}.property_id`, loc)} OR ${alias}.id IN (SELECT cs.check_id FROM qc_check_staff cs JOIN staff s ON s.id = cs.staff_id WHERE s.location = ${lit(loc)}))`;

// " AND <clause>" or "" when no location chosen.
const and = (loc, clause) => (loc ? ` AND ${clause}` : '');

function idSet(db, sql) { return new Set(db.prepare(sql).all().map(r => r.id)); }
const staffIdSet = (db, loc) => idSet(db, `SELECT id FROM staff WHERE location = ${lit(loc)}`);
const propIdSet = (db, loc) => idSet(db, `SELECT id FROM properties WHERE location = ${lit(loc)}`);

// All area names in use, plus the defaults.
function listLocations(db) {
  const rows = db.prepare(`
    SELECT location FROM staff WHERE location IS NOT NULL AND location <> ''
    UNION SELECT location FROM properties WHERE location IS NOT NULL AND location <> ''
  `).all().map(r => r.location);
  return [...new Set(['Hamilton', 'Tauranga', ...rows])].sort();
}

module.exports = { getLoc, staffInLoc, propInLoc, checkInLoc, and, staffIdSet, propIdSet, listLocations };
