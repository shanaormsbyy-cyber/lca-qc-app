import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function InductionTraining() {
  const navigate = useNavigate();

  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeShift, setActiveShift] = useState(0);

  // Start session modal
  const [staff, setStaff] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [starting, setStarting] = useState(false);

  const load = async () => {
    try {
      const [clRes, staffRes] = await Promise.all([
        api.get('/training/checklists'),
        api.get('/staff'),
      ]);
      const induction = clRes.data.find(c => c.name.toLowerCase().includes('induction')) || null;
      setChecklist(induction);
      setStaff(staffRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    const base = checklist
      ? JSON.parse(JSON.stringify(checklist))
      : { name: 'New Hire Induction', description: '', sections: [] };
    setDraft(base);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const saveTemplate = async () => {
    if (!draft.name.trim()) return alert('Template name required');
    setSaving(true);
    try {
      if (checklist) {
        await api.put(`/training/checklists/${checklist.id}`, draft);
      } else {
        await api.post('/training/checklists', draft);
      }
      await load();
      setEditing(false);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const startSession = async () => {
    if (!selectedStaff) return;
    setStarting(true);
    try {
      const r = await api.post('/training/sessions/induction/ensure', { trainee_id: selectedStaff });
      navigate(`/training/sessions/${r.data.id}`);
    } finally {
      setStarting(false);
    }
  };

  // ── Draft helpers ─────────────────────────────────────────────────────────

  const addShift = () => {
    const n = draft.sections.length + 1;
    setDraft(d => ({
      ...d,
      sections: [...d.sections, { name: `Shift ${n}`, description: '', items: [] }],
    }));
    setActiveShift(draft.sections.length);
  };

  const removeShift = (si) => {
    setDraft(d => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
    setActiveShift(s => Math.min(s, Math.max(0, draft.sections.length - 2)));
  };

  const updateShift = (si, field, val) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si ? { ...s, [field]: val } : s),
    }));
  };

  const addItem = (si) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si
        ? { ...s, items: [...s.items, { text: '' }] }
        : s),
    }));
  };

  const removeItem = (si, ii) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si
        ? { ...s, items: s.items.filter((_, j) => j !== ii) }
        : s),
    }));
  };

  const updateItem = (si, ii, val) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si
        ? { ...s, items: s.items.map((it, j) => j === ii ? { ...it, text: val } : it) }
        : s),
    }));
  };

  const moveItem = (si, ii, dir) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => {
        if (i !== si) return s;
        const items = [...s.items];
        const t = ii + dir;
        if (t < 0 || t >= items.length) return s;
        [items[ii], items[t]] = [items[t], items[ii]];
        return { ...s, items };
      }),
    }));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const sections = checklist?.sections || [];

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/training')}>← Back to Onboarding</button>

      {!editing ? (
        <>
          {/* Header */}
          <div className="section-header" style={{ marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
                {checklist?.name || 'New Hire Induction'}
              </h1>
              {checklist?.description && (
                <p style={{ color: 'var(--t3)', fontSize: 14 }}>{checklist.description}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={startEdit}>
                {checklist ? 'Edit Template' : 'Create Template'}
              </button>
              {checklist && sections.length > 0 && (
                <button className="btn btn-primary" onClick={() => setShowStart(true)}>
                  + Start Session
                </button>
              )}
            </div>
          </div>

          {!checklist || sections.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p style={{ color: 'var(--t2)', fontSize: 15, marginBottom: 16 }}>
                No induction template set up yet.
              </p>
              <button className="btn btn-primary" onClick={startEdit}>Create Template</button>
            </div>
          ) : (
            <>
              {/* Shift tabs */}
              <div className="tab-row" style={{ marginBottom: 0 }}>
                {sections.map((sec, si) => (
                  <button
                    key={si}
                    className={`tab-btn${activeShift === si ? ' active' : ''}`}
                    onClick={() => setActiveShift(si)}
                  >
                    {sec.name}
                  </button>
                ))}
              </div>

              {/* Active shift content */}
              {sections[activeShift] && (
                <div className="card" style={{ marginTop: 0, borderTopLeftRadius: activeShift === 0 ? 0 : undefined }}>
                  {sections[activeShift].description && (
                    <div style={{
                      background: 'rgba(58,181,217,0.08)',
                      border: '1px solid rgba(58,181,217,0.2)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      marginBottom: 20,
                      fontSize: 14,
                      color: 'var(--t2)',
                      lineHeight: 1.6,
                    }}>
                      {sections[activeShift].description}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {sections[activeShift].items?.map((item, ii) => (
                      <div key={ii} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '12px 0',
                        borderBottom: ii < sections[activeShift].items.length - 1
                          ? '1px solid var(--glass-border)' : 'none',
                      }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 4,
                          border: '2px solid var(--glass-border)',
                          flexShrink: 0, marginTop: 2,
                        }} />
                        <span style={{ fontSize: 14, color: 'var(--t1)', lineHeight: 1.6 }}>
                          {item.text}
                        </span>
                      </div>
                    ))}
                    {sections[activeShift].items?.length === 0 && (
                      <p style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>
                        No tasks in this shift yet. Click Edit Template to add some.
                      </p>
                    )}
                  </div>

                  <div style={{ marginTop: 16, fontSize: 12, color: 'var(--t3)' }}>
                    {sections[activeShift].items?.length || 0} tasks
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* ── Edit Mode ───────────────────────────────────────────────────── */
        <>
          <div className="section-header" style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Edit Onboarding Template</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>

          {/* Template name */}
          <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label className="form-label">Template Name</label>
              <input className="form-input" value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div style={{ flex: '2 1 300px' }}>
              <label className="form-label">Description (optional)</label>
              <input className="form-input" value={draft.description || ''}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
            </div>
          </div>

          {/* Shift tabs in edit mode */}
          {draft.sections.length > 0 && (
            <div className="tab-row" style={{ marginBottom: 0 }}>
              {draft.sections.map((sec, si) => (
                <button
                  key={si}
                  className={`tab-btn${activeShift === si ? ' active' : ''}`}
                  onClick={() => setActiveShift(si)}
                >
                  {sec.name || `Shift ${si + 1}`}
                </button>
              ))}
            </div>
          )}

          {draft.sections.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 16 }}>
              <p style={{ color: 'var(--t3)', marginBottom: 12 }}>No shifts yet. Add your first shift below.</p>
            </div>
          ) : draft.sections[activeShift] && (
            <div className="card" style={{ marginTop: 0, marginBottom: 16, borderTopLeftRadius: activeShift === 0 ? 0 : undefined }}>
              {/* Shift name + description */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Shift Name</label>
                  <input
                    className="form-input"
                    value={draft.sections[activeShift].name}
                    onChange={e => updateShift(activeShift, 'name', e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  style={{ flexShrink: 0, marginBottom: 2 }}
                  onClick={() => removeShift(activeShift)}
                >
                  Remove Shift
                </button>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Trainer Notes / Shift Intro (optional)</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 72, resize: 'vertical' }}
                  placeholder="Add context or instructions for this shift…"
                  value={draft.sections[activeShift].description || ''}
                  onChange={e => updateShift(activeShift, 'description', e.target.value)}
                />
              </div>

              {/* Items */}
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>
                Tasks ({draft.sections[activeShift].items.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {draft.sections[activeShift].items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                        onClick={() => moveItem(activeShift, ii, -1)} disabled={ii === 0}>↑</button>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                        onClick={() => moveItem(activeShift, ii, 1)}
                        disabled={ii === draft.sections[activeShift].items.length - 1}>↓</button>
                    </div>
                    <input
                      className="form-input"
                      style={{ flex: 1 }}
                      placeholder="Task description…"
                      value={item.text}
                      onChange={e => updateItem(activeShift, ii, e.target.value)}
                    />
                    <button className="btn btn-sm btn-danger" onClick={() => removeItem(activeShift, ii)}>✕</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => addItem(activeShift)}>+ Add Task</button>
            </div>
          )}

          <button className="btn btn-ghost" onClick={addShift}>+ Add Shift</button>
        </>
      )}

      {/* Start Session modal */}
      {showStart && (
        <div className="modal-overlay" onClick={() => setShowStart(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Start Induction Session</div>
            <div className="form-group">
              <label className="form-label">Select Staff Member</label>
              <select className="form-select" value={selectedStaff}
                onChange={e => setSelectedStaff(e.target.value)}>
                <option value="">Choose…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={startSession}
                disabled={!selectedStaff || starting}>
                {starting ? 'Starting…' : 'Start'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowStart(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
