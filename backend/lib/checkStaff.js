// A QC check counts for every team member listed on it (qc_check_staff), not just qc_checks.staff_id.
// Use in place of `staff_id = ?` when filtering qc_checks for one cleaner. `alias` is the qc_checks alias.
function forStaff(alias = 'qc_checks') {
  return `${alias}.id IN (SELECT check_id FROM qc_check_staff WHERE staff_id = ?)`;
}

// Same, but matched against a column (e.g. 's.id') instead of a bound parameter.
function forStaffColumn(alias, column) {
  return `${alias}.id IN (SELECT check_id FROM qc_check_staff WHERE staff_id = ${column})`;
}

// Replace a check's team members: the first id is also kept in qc_checks.staff_id.
function setCheckStaff(db, checkId, staffIds) {
  const ids = [...new Set((staffIds || []).map(Number).filter(Boolean))];
  db.prepare('DELETE FROM qc_check_staff WHERE check_id = ?').run(checkId);
  const ins = db.prepare('INSERT OR IGNORE INTO qc_check_staff (check_id, staff_id) VALUES (?, ?)');
  ids.forEach(id => ins.run(checkId, id));
  db.prepare('UPDATE qc_checks SET staff_id = ? WHERE id = ?').run(ids[0] || null, checkId);
  return ids;
}

module.exports = { forStaff, forStaffColumn, setCheckStaff };
