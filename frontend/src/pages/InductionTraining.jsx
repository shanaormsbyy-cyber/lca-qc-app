import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

// Group sections by shift_label, preserving order of first appearance
function groupByShift(sections) {
  const order = [];
  const map = {};
  sections.forEach(sec => {
    const label = sec.shift_label || 'General';
    if (!map[label]) { map[label] = []; order.push(label); }
    map[label].push(sec);
  });
  return { order, map };
}

export default function InductionTraining() {
  const navigate = useNavigate();

  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingRubric, setSavingRubric] = useState(false);
  const [rubricSaved, setRubricSaved] = useState(false);
  const [activeShiftLabel, setActiveShiftLabel] = useState(null);
  const [editTab, setEditTab] = useState('shifts'); // 'shifts' | 'rubric'
  const [viewTab, setViewTab] = useState('checklist'); // 'checklist' | 'rubric'

  // Rubric dimensions (editable)
  const [rubricDims, setRubricDims] = useState([]);

  const [staff, setStaff] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [starting, setStarting] = useState(false);

  const load = async () => {
    try {
      const [clRes, staffRes, rubricRes] = await Promise.all([
        api.get('/training/checklists'),
        api.get('/staff'),
        api.get('/training/rubric/dimensions'),
      ]);
      // Use a checklist that mentions induction/onboarding, or just the first one
      const induction = clRes.data.find(c => /induction|onboarding/i.test(c.name))
        || clRes.data[0]
        || null;
      setChecklist(induction);
      setStaff(staffRes.data);
      setRubricDims(rubricRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = () => {
    const base = checklist
      ? JSON.parse(JSON.stringify(checklist))
      : { name: 'New Hire Induction', description: '', sections: [] };
    base.sections = base.sections.map(s => ({ ...s, shift_label: s.shift_label || 'Shift 1' }));
    setDraft(base);
    setEditTab('shifts');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const saveRubricOnly = async () => {
    setSavingRubric(true);
    try {
      await api.put('/training/rubric/dimensions', { dimensions: rubricDims });
      setRubricSaved(true);
      setTimeout(() => setRubricSaved(false), 2500);
    } finally {
      setSavingRubric(false);
    }
  };

  const saveTemplate = async () => {
    if (!draft.name.trim()) return alert('Template name required');
    setSaving(true);
    try {
      if (checklist) {
        await api.put(`/training/checklists/${checklist.id}`, draft);
      } else {
        await api.post('/training/checklists', draft);
      }
      await api.put('/training/rubric/dimensions', { dimensions: rubricDims });
      await load();
      setEditing(false);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  // ── Rubric dimension helpers ──────────────────────────────────────────────
  const updateDim = (i, field, val) => {
    setRubricDims(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  };
  const addDim = () => {
    setRubricDims(prev => [...prev, { name: '', pass_desc: '', fail_desc: '', order_idx: prev.length }]);
  };
  const removeDim = (i) => {
    setRubricDims(prev => prev.filter((_, idx) => idx !== i));
  };
  const moveDim = (i, dir) => {
    setRubricDims(prev => {
      const next = [...prev];
      const t = i + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  };

  const startSession = async () => {
    if (!selectedStaff) return;
    setStarting(true);
    try {
      const r = await api.post('/training/sessions/induction/ensure', {
        trainee_id: selectedStaff,
        checklist_id: checklist?.id,
      });
      navigate(`/training/sessions/${r.data.id}`);
    } finally {
      setStarting(false);
    }
  };

  // ── Draft helpers ──────────────────────────────────────────────────────────

  const addSection = (shiftLabel) => {
    setDraft(d => ({
      ...d,
      sections: [...d.sections, { name: '', description: '', shift_label: shiftLabel, items: [] }],
    }));
  };

  const removeSection = (si) => {
    setDraft(d => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
  };

  const updateSection = (si, field, val) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si ? { ...s, [field]: val } : s),
    }));
  };

  // Rename all sections that belong to a shift
  const renameShift = (oldLabel, newLabel) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map(s =>
        s.shift_label === oldLabel ? { ...s, shift_label: newLabel } : s
      ),
    }));
    setActiveShiftLabel(newLabel);
  };

  const addShift = () => {
    const { order } = groupByShift(draft.sections);
    const n = order.length + 1;
    const label = `Shift ${n}`;
    setDraft(d => ({
      ...d,
      sections: [...d.sections, { name: '', description: '', shift_label: label, items: [] }],
    }));
    setActiveShiftLabel(label);
  };

  const removeShift = (shiftLabel) => {
    setDraft(d => {
      const next = d.sections.filter(s => s.shift_label !== shiftLabel);
      const { order } = groupByShift(next);
      setActiveShiftLabel(order[0] || null);
      return { ...d, sections: next };
    });
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  // ── View mode grouping ─────────────────────────────────────────────────────
  const { order: shiftOrder, map: shiftMap } = groupByShift(checklist?.sections || []);
  const activeViewLabel = activeShiftLabel && shiftOrder.includes(activeShiftLabel)
    ? activeShiftLabel : (shiftOrder[0] || null);

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/training')}>← Back to Onboarding</button>

      {!editing ? (
        <>
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
              {checklist && shiftOrder.length > 0 && (
                <button className="btn btn-primary" onClick={() => setShowStart(true)}>+ Start Session</button>
              )}
            </div>
          </div>

          {/* Top-level view tabs */}
          <div className="tab-row" style={{ marginBottom: 0 }}>
            <button className={`tab-btn${viewTab === 'checklist' ? ' active' : ''}`} onClick={() => setViewTab('checklist')}>Onboarding Checklist</button>
            <button className={`tab-btn${viewTab === 'rubric' ? ' active' : ''}`} onClick={() => setViewTab('rubric')}>Shadow Period Rubric</button>
          </div>

          {viewTab === 'checklist' && (!checklist || shiftOrder.length === 0) ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, marginTop: 0, borderTopLeftRadius: 0 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p style={{ color: 'var(--t2)', fontSize: 15, marginBottom: 16 }}>No induction template set up yet.</p>
              <button className="btn btn-primary" onClick={startEdit}>Create Template</button>
            </div>
          ) : viewTab === 'checklist' ? (
            <>
              <div className="tab-row" style={{ marginBottom: 0, marginTop: 0, borderTop: '1px solid var(--glass-border)' }}>
                {shiftOrder.map((label) => (
                  <button key={label} className={`tab-btn${activeViewLabel === label ? ' active' : ''}`}
                    onClick={() => setActiveShiftLabel(label)}>
                    {label}
                  </button>
                ))}
              </div>

              {activeViewLabel && (
                <div className="card" style={{ marginTop: 0, borderTopLeftRadius: 0 }}>
                  {shiftMap[activeViewLabel].map((sec, si) => (
                    <div key={si} style={{ marginBottom: si < shiftMap[activeViewLabel].length - 1 ? 24 : 0 }}>
                      {sec.name && (
                        <div style={{
                          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: 1, color: 'var(--cyan)', marginBottom: 10,
                        }}>
                          {sec.name}
                        </div>
                      )}
                      {sec.description && (
                        <div style={{
                          background: 'rgba(58,181,217,0.08)',
                          border: '1px solid rgba(58,181,217,0.2)',
                          borderRadius: 8, padding: '10px 14px',
                          marginBottom: 12, fontSize: 13,
                          color: 'var(--t2)', lineHeight: 1.6,
                        }}>
                          {sec.description}
                        </div>
                      )}
                      {sec.items?.map((item, ii) => (
                        <div key={ii} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          padding: '10px 0',
                          borderBottom: ii < sec.items.length - 1 ? '1px solid var(--glass-border)' : 'none',
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4,
                            border: '2px solid var(--glass-border)',
                            flexShrink: 0, marginTop: 2,
                          }} />
                          <span style={{ fontSize: 14, color: 'var(--t1)', lineHeight: 1.6 }}>{item.text}</span>
                        </div>
                      ))}
                      {sec.items?.length === 0 && (
                        <p style={{ color: 'var(--t3)', fontSize: 13 }}>No tasks yet.</p>
                      )}
                      {si < shiftMap[activeViewLabel].length - 1 && (
                        <div style={{ height: 1, background: 'var(--glass-border)', margin: '16px 0 0' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* ── Rubric editor (view mode) ── */
            <div className="card" style={{ marginTop: 0, borderTopLeftRadius: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ color: 'var(--t3)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  Edit the dimensions scored PASS / MIXED / FAIL across the 5 shadow period cleans.
                </p>
                <button className="btn btn-primary btn-sm" onClick={saveRubricOnly} disabled={savingRubric} style={{ flexShrink: 0, marginLeft: 12 }}>
                  {savingRubric ? 'Saving…' : rubricSaved ? '✓ Saved' : 'Save Rubric'}
                </button>
              </div>
              {rubricDims.map((dim, i) => (
                <div key={i} style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                        onClick={() => moveDim(i, -1)} disabled={i === 0}>↑</button>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                        onClick={() => moveDim(i, 1)} disabled={i === rubricDims.length - 1}>↓</button>
                    </div>
                    <input className="form-input" style={{ flex: 1, fontWeight: 600 }}
                      placeholder="Dimension name (e.g. Technical competence)"
                      value={dim.name}
                      onChange={e => updateDim(i, 'name', e.target.value)} />
                    <button className="btn btn-sm btn-danger" onClick={() => removeDim(i)}>✕</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="form-label" style={{ color: 'var(--ok)' }}>✓ Pass description</label>
                      <input className="form-input" placeholder="e.g. Hits QC standard consistently"
                        value={dim.pass_desc || ''}
                        onChange={e => updateDim(i, 'pass_desc', e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ color: 'var(--red)' }}>✗ Fail description</label>
                      <input className="form-input" placeholder="e.g. Misses things consistently"
                        value={dim.fail_desc || ''}
                        onChange={e => updateDim(i, 'fail_desc', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost btn-sm" onClick={addDim}>+ Add Dimension</button>
                {rubricSaved && <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ Changes saved</span>}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Edit Mode ───────────────────────────────────────────────────── */
        (() => {
          const { order: draftShiftOrder, map: draftShiftMap } = groupByShift(draft.sections);
          const currentShiftLabel = (activeShiftLabel && draftShiftOrder.includes(activeShiftLabel))
            ? activeShiftLabel : (draftShiftOrder[0] || null);
          const currentShiftSections = currentShiftLabel ? draftShiftMap[currentShiftLabel] : [];

          return (
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

              {/* Top-level edit tabs: Shifts vs Rubric */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--glass-border)' }}>
                {[['shifts', 'Onboarding Shifts'], ['rubric', 'Shadow Period Rubric']].map(([t, label]) => (
                  <button key={t} onClick={() => setEditTab(t)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 16px', fontWeight: 700, fontSize: 14,
                    color: editTab === t ? 'var(--cyan)' : 'var(--t3)',
                    borderBottom: editTab === t ? '2px solid var(--cyan)' : '2px solid transparent',
                    marginBottom: -1,
                  }}>{label}</button>
                ))}
              </div>

              {/* Shift tabs (only shown when on shifts tab) */}
              {editTab === 'shifts' && draftShiftOrder.length > 0 && (
                <div className="tab-row" style={{ marginBottom: 0 }}>
                  {draftShiftOrder.map((label) => (
                    <button key={label} className={`tab-btn${currentShiftLabel === label ? ' active' : ''}`}
                      onClick={() => setActiveShiftLabel(label)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* ── Rubric editor ─────────────────────────────────────────── */}
              {editTab === 'rubric' && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                    These dimensions are scored PASS / MIXED / FAIL across each of the 5 shadow period cleans.
                    Scores appear in the Shadow Period Rubric tab inside each training session.
                  </p>
                  {rubricDims.map((dim, i) => (
                    <div key={i} style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                          <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                            onClick={() => moveDim(i, -1)} disabled={i === 0}>↑</button>
                          <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                            onClick={() => moveDim(i, 1)} disabled={i === rubricDims.length - 1}>↓</button>
                        </div>
                        <input className="form-input" style={{ flex: 1, fontWeight: 600 }}
                          placeholder="Dimension name (e.g. Technical competence)"
                          value={dim.name}
                          onChange={e => updateDim(i, 'name', e.target.value)} />
                        <button className="btn btn-sm btn-danger" onClick={() => removeDim(i)}>✕</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label className="form-label" style={{ color: 'var(--ok)' }}>✓ Pass description</label>
                          <input className="form-input" placeholder="e.g. Hits QC standard consistently"
                            value={dim.pass_desc || ''}
                            onChange={e => updateDim(i, 'pass_desc', e.target.value)} />
                        </div>
                        <div>
                          <label className="form-label" style={{ color: 'var(--red)' }}>✗ Fail description</label>
                          <input className="form-input" placeholder="e.g. Misses things consistently"
                            value={dim.fail_desc || ''}
                            onChange={e => updateDim(i, 'fail_desc', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={addDim}>+ Add Dimension</button>
                </div>
              )}

              {/* ── Shifts editor ─────────────────────────────────────────── */}
              {editTab === 'shifts' && draftShiftOrder.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 16 }}>
                  <p style={{ color: 'var(--t3)', marginBottom: 12 }}>No shifts yet.</p>
                </div>
              ) : editTab === 'shifts' && currentShiftLabel && (
                <div className="card" style={{ marginTop: 0, marginBottom: 16, borderTopLeftRadius: draftShiftOrder[0] === currentShiftLabel ? 0 : undefined }}>
                  {/* Shift name editor + remove */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 160px' }}>
                      <label className="form-label">Shift Name</label>
                      <input className="form-input" value={currentShiftLabel}
                        onChange={e => renameShift(currentShiftLabel, e.target.value)} />
                    </div>
                    <button className="btn btn-sm btn-danger" style={{ marginBottom: 2 }}
                      onClick={() => removeShift(currentShiftLabel)}>
                      Remove Shift
                    </button>
                  </div>

                  {/* Sections within this shift */}
                  {currentShiftSections.map((sec) => {
                    // Find the global index of this section in draft.sections
                    const si = draft.sections.indexOf(sec);
                    return (
                      <div key={si} className="card" style={{ background: 'var(--bg)', marginBottom: 14 }}>
                        {/* Section name + remove */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 160px' }}>
                            <label className="form-label">Section Name</label>
                            <input className="form-input"
                              placeholder="e.g. Bathroom, Kitchen…"
                              value={sec.name}
                              onChange={e => updateSection(si, 'name', e.target.value)} />
                          </div>
                          <button className="btn btn-sm btn-danger" style={{ marginBottom: 2 }}
                            onClick={() => removeSection(si)}>
                            Remove Section
                          </button>
                        </div>

                        {/* Section notes */}
                        <div style={{ marginBottom: 14 }}>
                          <label className="form-label">Notes / Instructions (optional)</label>
                          <textarea className="form-input" style={{ minHeight: 60, resize: 'vertical' }}
                            placeholder="Context or instructions for this section…"
                            value={sec.description || ''}
                            onChange={e => updateSection(si, 'description', e.target.value)} />
                        </div>

                        {/* Items */}
                        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Tasks
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                          {sec.items.map((item, ii) => (
                            <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                                <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                                  onClick={() => moveItem(si, ii, -1)} disabled={ii === 0}>↑</button>
                                <button className="btn btn-sm btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                                  onClick={() => moveItem(si, ii, 1)} disabled={ii === sec.items.length - 1}>↓</button>
                              </div>
                              <input className="form-input" style={{ flex: 1 }}
                                placeholder="Task description…"
                                value={item.text}
                                onChange={e => updateItem(si, ii, e.target.value)} />
                              <button className="btn btn-sm btn-danger"
                                onClick={() => removeItem(si, ii)}>✕</button>
                            </div>
                          ))}
                        </div>
                        <button className="btn btn-sm btn-ghost" onClick={() => addItem(si)}>+ Add Task</button>
                      </div>
                    );
                  })}

                  <button className="btn btn-ghost btn-sm" onClick={() => addSection(currentShiftLabel)}>
                    + Add Section to {currentShiftLabel}
                  </button>
                </div>
              )}

              {editTab === 'shifts' && (
                <button className="btn btn-ghost" onClick={addShift}>+ Add Shift</button>
              )}
            </>
          );
        })()
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
