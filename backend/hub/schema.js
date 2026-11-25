// Training Hub tables inside the QC database. Uses QC's own managers, staff, properties and settings tables.
// Idempotent: CREATE TABLE IF NOT EXISTS only.
function applySchema(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    category TEXT,
    required INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS skill_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS skill_default_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS competencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id),
    level TEXT NOT NULL DEFAULT 'not_started',
    progress INTEGER DEFAULT 0,
    due_date TEXT,
    required INTEGER DEFAULT 0,
    unrequired_reason TEXT,
    reassess_flag INTEGER DEFAULT 0,
    reassess_reason TEXT,
    is_baseline INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(staff_id, skill_id)
  );
  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competency_id INTEGER NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
    manager_id INTEGER REFERENCES managers(id),
    date TEXT NOT NULL,
    score INTEGER,
    level TEXT NOT NULL,
    notes TEXT,
    criteria_json TEXT,
    is_baseline INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT,
    mime TEXT,
    size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS system_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS training_systems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    category_id INTEGER REFERENCES system_categories(id),
    archived INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS system_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id INTEGER NOT NULL REFERENCES training_systems(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS system_trainers (
    system_id INTEGER NOT NULL REFERENCES training_systems(id) ON DELETE CASCADE,
    manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
    PRIMARY KEY (system_id, manager_id)
  );
  CREATE TABLE IF NOT EXISTS system_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id INTEGER NOT NULL REFERENCES training_systems(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    used_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'development',
    trainer_id INTEGER REFERENCES managers(id),
    status TEXT NOT NULL DEFAULT 'draft',
    start_date TEXT,
    end_date TEXT,
    is_template INTEGER DEFAULT 0,
    competency_snapshot TEXT,
    published_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS plan_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT,
    skill_id INTEGER REFERENCES skills(id),
    system_id INTEGER REFERENCES training_systems(id),
    sort_order INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    completed_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS plan_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    time TEXT,
    trainer_id INTEGER REFERENCES managers(id),
    notes TEXT,
    module_ids TEXT DEFAULT '[]',
    delivered INTEGER DEFAULT 0,
    delivered_at TEXT
  );

  CREATE TABLE IF NOT EXISTS onboardings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL UNIQUE REFERENCES staff(id) ON DELETE CASCADE,
    trainer_id INTEGER REFERENCES managers(id),
    start_date TEXT,
    stage INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    is_baseline INTEGER DEFAULT 0,
    signed_off_at TEXT,
    signed_off_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS onboarding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onboarding_id INTEGER NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
    from_stage INTEGER,
    to_stage INTEGER,
    manager_id INTEGER,
    override_reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS checklist_template_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS checklist_template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES checklist_template_groups(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    onboarding_id INTEGER NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
    group_name TEXT NOT NULL,
    group_sort INTEGER DEFAULT 0,
    text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    done INTEGER DEFAULT 0,
    done_at TEXT,
    done_by INTEGER
  );

  CREATE TABLE IF NOT EXISTS shadow_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    mentor_id INTEGER REFERENCES managers(id),
    onboarding_id INTEGER REFERENCES onboardings(id) ON DELETE SET NULL,
    shift_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    signed_off_at TEXT,
    signed_off_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shadow_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shadow_period_id INTEGER NOT NULL REFERENCES shadow_periods(id) ON DELETE CASCADE,
    shift_number INTEGER NOT NULL,
    date TEXT,
    property_id INTEGER REFERENCES properties(id),
    mentor_id INTEGER REFERENCES managers(id),
    reviewed INTEGER DEFAULT 0,
    review_notes TEXT,
    reviewed_at TEXT,
    reviewed_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS shadow_shift_methods (
    shift_id INTEGER NOT NULL REFERENCES shadow_shifts(id) ON DELETE CASCADE,
    system_id INTEGER NOT NULL REFERENCES training_systems(id) ON DELETE CASCADE,
    PRIMARY KEY (shift_id, system_id)
  );

  CREATE TABLE IF NOT EXISTS resource_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    category_id INTEGER REFERENCES resource_categories(id),
    system_id INTEGER REFERENCES training_systems(id) ON DELETE SET NULL,
    file_path TEXT,
    url TEXT,
    original_name TEXT,
    size INTEGER,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS foundation_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    details TEXT,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS foundation_progress (
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    taught_at TEXT,
    taught_by INTEGER,
    PRIMARY KEY (staff_id, skill_id)
  );

  CREATE TABLE IF NOT EXISTS caddy_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
  `);

  // Columns added after first release (no-op if present).
  for (const sql of [
    'ALTER TABLE checklist_template_groups ADD COLUMN source TEXT',          // 'caddy' = items come from the caddy list
    'ALTER TABLE checklist_template_items ADD COLUMN details TEXT',
    'ALTER TABLE onboarding_checklist_items ADD COLUMN details TEXT',
  ]) {
    try { db.exec(sql); } catch (_) { /* already exists */ }
  }
}

module.exports = { applySchema };
