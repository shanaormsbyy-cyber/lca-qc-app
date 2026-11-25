// Training Hub in the QC app starts with no content (skills, checklist, prompts, systems,
// caddy items are all added by the owner). Only default settings are created.
function seedSettings(db) {
  const setDefault = (key, value) => db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  setDefault('shadow_shift_count', '5');
  setDefault('competency_due_days', '21');
  setDefault('shadow_method_system_ids', '[]');
  setDefault('caddy_photo', null);
}

module.exports = { seedSettings };
