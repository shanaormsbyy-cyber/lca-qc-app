const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/app/data/lca.db'
  : path.join(__dirname, 'lca.db');

// Ensure the directory exists (needed on Railway with mounted volumes)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

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

  CREATE TABLE IF NOT EXISTS staff_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL UNIQUE REFERENCES staff(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
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
    staff_id INTEGER REFERENCES staff(id),
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

  CREATE TABLE IF NOT EXISTS qc_check_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL REFERENCES qc_checks(id) ON DELETE CASCADE,
    category TEXT,
    filename TEXT NOT NULL,
    original_name TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  );

  -- Heat Pump Filter Tracker
  CREATE TABLE IF NOT EXISTS heatpump_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    due_date TEXT,
    last_completed TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS heatpump_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL REFERENCES heatpump_records(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migrations — safe ALTER TABLE (no-op if column already exists) ─────────────
const migrations = [
  "ALTER TABLE qc_checklists  ADD COLUMN repeatable_sections TEXT DEFAULT '[]'",
  "ALTER TABLE qc_check_items ADD COLUMN room_label TEXT DEFAULT NULL",
  "ALTER TABLE qc_check_items ADD COLUMN na INTEGER DEFAULT 0",
  "ALTER TABLE qc_checklists  ADD COLUMN archived INTEGER DEFAULT 0",
  "ALTER TABLE properties      ADD COLUMN access_code TEXT DEFAULT NULL",
  "ALTER TABLE properties      ADD COLUMN inactive_until TEXT DEFAULT NULL",
  "ALTER TABLE staff            ADD COLUMN inactive_until TEXT DEFAULT NULL",
  "ALTER TABLE properties      ADD COLUMN room_config TEXT DEFAULT NULL",
  "ALTER TABLE training_checklist_sections ADD COLUMN description TEXT DEFAULT NULL",
  "ALTER TABLE training_checklist_sections ADD COLUMN shift_label TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN rubric_signoff_status TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN rubric_signoff_by TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN rubric_signoff_at TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN rubric_signoff_note TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_start TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_end TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_qc_avg TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_trajectory TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_code_adherence TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_standing_notes TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_decision TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_signoff_by TEXT DEFAULT NULL",
  "ALTER TABLE training_sessions ADD COLUMN probation_signoff_at TEXT DEFAULT NULL",
];
migrations.forEach(sql => {
  try { db.exec(sql); } catch (_) { /* column already exists — skip */ }
});

// Shadow period rubric tables
db.exec(`
  CREATE TABLE IF NOT EXISTS shadow_rubric_dimensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pass_desc TEXT NOT NULL DEFAULT '',
    fail_desc TEXT NOT NULL DEFAULT '',
    order_idx INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS shadow_rubric_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    dimension_id INTEGER NOT NULL REFERENCES shadow_rubric_dimensions(id) ON DELETE CASCADE,
    clean_number INTEGER NOT NULL CHECK(clean_number BETWEEN 1 AND 5),
    score TEXT CHECK(score IN ('pass', 'mixed', 'fail')),
    notes TEXT DEFAULT '',
    UNIQUE(session_id, dimension_id, clean_number)
  )
`);

// Onboarding resources (shared across all sessions — not per-session)
db.exec(`
  CREATE TABLE IF NOT EXISTS onboarding_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Staff brief log
db.exec(`
  CREATE TABLE IF NOT EXISTS staff_briefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_watchlist_overrides (
    staff_id INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed the 12 default dimensions if none exist
{
  const count = db.prepare('SELECT COUNT(*) as c FROM shadow_rubric_dimensions').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO shadow_rubric_dimensions (name, pass_desc, fail_desc, order_idx) VALUES (?, ?, ?, ?)');
    const dims = [
      ['Technical competence',  'Hits QC standard at every category',          'Misses things consistently',              0],
      ['Improvement curve',     'Visible improvement clean-to-clean',           'Same mistakes repeating',                 1],
      ['Feedback integration',  'Applies feedback in next clean',               "Doesn't adjust, defensive",               2],
      ['Independence',          'Asks less, decides more as they progress',     'Still asking same questions at Clean 4',  3],
      ['Speed',                 'Steadily faster, quality holds',               'Slow throughout, or fast and sloppy',     4],
      ['Breezeway use',         'Checklist fully completed every clean',        'Skips items, half-completed',             5],
      ['Photo discipline',      'Full quality photos, every category',          'Sloppy, missing, blurry',                 6],
      ['Reporting',             'Found items, breakages, low supplies — all flagged', 'Misses, hides, forgets',            7],
      ['Property + furnishings','Careful, respectful',                          'Careless, rough',                         8],
      ['Stamina',               'Holds energy across all 5 cleans',            'Fades, gets sloppy late',                 9],
      ['Code adherence',        'Honest, reliable, no shortcuts',              'Cuts corners, hides mistakes',            10],
      ['Pleasant alongside',    'Easy to work with, professional',             'Cold, conflict-prone, distracting',       11],
    ];
    dims.forEach(d => ins.run(...d));
  }
}

// Default settings
const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
insertSetting.run('qc_freq_staff_days', '30');
insertSetting.run('qc_freq_property_days', '14');
insertSetting.run('watchlist_threshold', '90');
insertSetting.run('flag_min_count', '3');
insertSetting.run('flag_moderate_min', '3');
insertSetting.run('flag_moderate_max', '4');
insertSetting.run('flag_major_min', '5');
insertSetting.run('flag_major_max', '7');
insertSetting.run('flag_urgent_min', '8');
insertSetting.run('top_performers_threshold', '90');
insertSetting.run('top_performers_min_checks', '3');
insertSetting.run('heatpump_freq_days', '90');
insertSetting.run('voice_default_unmentioned', 'pass');
insertSetting.run('slack_webhook_url', '');
insertSetting.run('slack_bot_token', '');
insertSetting.run('slack_notify_check_complete', 'true');
insertSetting.run('slack_notify_below_threshold', 'true');
insertSetting.run('portal_base_url', '');
insertSetting.run('anthropic_api_key', '');
insertSetting.run('twilio_auth_token', '');

module.exports = db;
