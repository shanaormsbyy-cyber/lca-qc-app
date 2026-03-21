const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'lca.db');

// node-sqlite3-wasm leaves a stale lock dir on Windows when a process exits.
// Remove it before opening so we don't get "database is locked" on restart.
const LOCK_PATH = DB_PATH + '.lock';
if (fs.existsSync(LOCK_PATH)) {
  fs.rmSync(LOCK_PATH, { recursive: true, force: true });
}

const db = new Database(DB_PATH);

db.exec('PRAGMA foreign_keys=ON');

// Compatibility wrapper: node-sqlite3-wasm requires array params, but our code
// uses better-sqlite3-style spread args. This normalises both styles.
const _prepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const stmt = _prepare(sql);
  const wrap = (fn) => (...args) => {
    const params = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
    return fn(params);
  };
  stmt.run  = wrap(stmt.run.bind(stmt));
  stmt.get  = wrap(stmt.get.bind(stmt));
  stmt.all  = wrap(stmt.all.bind(stmt));
  return stmt;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    start_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    airbnb_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Training
  CREATE TABLE IF NOT EXISTS training_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS training_checklist_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL REFERENCES training_checklists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_idx INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS training_checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES training_checklist_sections(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    order_idx INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS training_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trainee_id INTEGER NOT NULL REFERENCES staff(id),
    checklist_id INTEGER NOT NULL REFERENCES training_checklists(id),
    scheduled_by_id INTEGER NOT NULL REFERENCES managers(id),
    assigned_to_id INTEGER NOT NULL REFERENCES managers(id),
    date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    completion_pct REAL DEFAULT 0,
    signed_off_by TEXT,
    signed_off_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS training_session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES training_checklist_items(id),
    completed INTEGER DEFAULT 0,
    notes TEXT
  );

  -- QC Checks
  CREATE TABLE IF NOT EXISTS qc_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS qc_checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL REFERENCES qc_checklists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    category TEXT,
    score_type TEXT DEFAULT 'pass_fail',
    weight REAL DEFAULT 1,
    order_idx INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS qc_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    checklist_id INTEGER NOT NULL REFERENCES qc_checklists(id),
    scheduled_by_id INTEGER NOT NULL REFERENCES managers(id),
    assigned_to_id INTEGER NOT NULL REFERENCES managers(id),
    date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    total_score REAL DEFAULT 0,
    max_score REAL DEFAULT 0,
    score_pct REAL DEFAULT 0,
    signed_off_by TEXT,
    signed_off_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS qc_check_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL REFERENCES qc_checks(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES qc_checklist_items(id),
    score REAL DEFAULT 0,
    notes TEXT
  );
`);

// Default settings
const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
insertSetting.run('qc_freq_staff_days', '30');
insertSetting.run('qc_freq_property_days', '14');

module.exports = db;
