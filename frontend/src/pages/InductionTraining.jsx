import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function InductionTraining() {
  const navigate = useNavigate();
  const { manager } = useAuth();

  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // Staff list for "Start session" modal
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
    if (!checklist) {
      // Creating new checklist from scratch
      setDraft({ name: 'New Hire Induction', description: '', sections: [] });
    } else {
      setDraft(JSON.parse(JSON.stringify(checklist)));
    }
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const saveTemplate = async () => {
    if (!draft.name.trim()) return alert('Checklist name required');
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

  // ── Draft editing helpers ──────────────────────────────────────────────────

  const addSection = () => {
    setDraft(d => ({ ...d, sections: [...d.sections, { name: '', items: [] }] }));
  };

  const removeSection = (si) => {
    setDraft(d => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
  };

  const updateSectionName = (si, val) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si ? { ...s, name: val } : s),
    }));
  };

  const addItem = (si) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si ? { ...s, items: [...s.items, { text: '' }] } : s),
    }));
  };

  const removeItem = (si, ii) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s),
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

  const moveSection = (si, dir) => {
    setDraft(d => {
      const secs = [...d.sections];
      const target = si + dir;
      if (target < 0 || target >= secs.length) return d;
      [secs[si], secs[target]] = [secs[target], secs[si]];
      return { ...d, sections: secs };
    });
  };

  const moveItem = (si, ii, dir) => {
    setDraft(d => ({
      ...d,
      sections: d.sections.map((s, i) => {
        if (i !== si) return s;
        const items = [...s.items];
        const target = ii + dir;
        if (target < 0 || target >= items.length) return s;
        [items[ii], items[target]] = [items[target], items[ii]];
        return { ...s, items };
      }),
    }));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const totalItems = checklist?.sections?.reduce((n, s) => n + s.items.length, 0) || 0;

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/training')}>← Back to Onboarding</button>

      {!editing ? (
        <>
          {/* Header */}
          <div className="section-header" style={{ marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
                {checklist ? checklist.name : 'New Hire Induction'}
              </h1>
              {checklist?.description && (
                <p style={{ color: 'var(--t3)', fontSize: 14 }}>{checklist.description}</p>
              )}
              {checklist && (
                <p style={{ color: 'var(--t3)', fontSize: 13, marginTop: 4 }}>
                  {checklist.sections?.length || 0} sections · {totalItems} items
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={startEdit}>
                {checklist ? 'Edit Template' : 'Create Template'}
              </button>
              {checklist && (
                <button className="btn btn-primary" onClick={() => setShowStart(true)}>
                  + Start Session
                </button>
              )}
            </div>
          </div>

          {/* Template preview */}
          {!checklist ? (
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <p style={{ color: 'var(--t2)', fontSize: 15, marginBottom: 16 }}>No induction template set up yet.</p>
              <button className="btn btn-primary" onClick={startEdit}>Create Template</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {checklist.sections?.map((sec, si) => (
                <div key={si} className="card">
                  <div className="card-header">
                    <span className="card-title">{sec.name || 'Untitled Section'}</span>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>{sec.items?.length || 0} items</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sec.items?.map((item, ii) => (
                      <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: ii < sec.items.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                        <div style={{ width: 20, height: 20, borderRadius: 4, border: '2px solid var(--glass-border)', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 14, color: 'var(--t1)', lineHeight: 1.5 }}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ── Edit Mode ──────────────────────────────────────────────────── */
        <>
          <div className="section-header" style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Edit Onboarding Template</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTemplate} disabled={saving}>
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>

          {/* Checklist name + description */}
          <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label className="form-label">Template Name</label>
              <input className="form-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div style={{ flex: '2 1 300px' }}>
              <label className="form-label">Description (optional)</label>
              <input className="form-input" value={draft.description || ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
            </div>
          </div>

          {/* Sections */}
          {draft.sections.map((sec, si) => (
            <div key={si} className="card" style={{ marginBottom: 16 }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input
                  className="form-input"
                  style={{ flex: '1 1 200px', fontWeight: 700 }}
                  placeholder="Section name…"
                  value={sec.name}
                  onChange={e => updateSectionName(si, e.target.value)}
                />
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => moveSection(si, -1)} disabled={si === 0} title="Move up">↑</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => moveSection(si, 1)} disabled={si === draft.sections.length - 1} title="Move down">↓</button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeSection(si)}>Remove Section</button>
                </div>
              </div>

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {sec.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => moveItem(si, ii, -1)} disabled={ii === 0}>↑</button>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => moveItem(si, ii, 1)} disabled={ii === sec.items.length - 1}>↓</button>
                    </div>
                    <input
                      className="form-input"
                      style={{ flex: 1 }}
                      placeholder="Item description…"
                      value={item.text}
                      onChange={e => updateItem(si, ii, e.target.value)}
                    />
                    <button className="btn btn-sm btn-danger" onClick={() => removeItem(si, ii)}>✕</button>
                  </div>
                ))}
              </div>

              <button className="btn btn-sm btn-ghost" onClick={() => addItem(si)}>+ Add Item</button>
            </div>
          ))}

          <button className="btn btn-ghost" style={{ marginBottom: 24 }} onClick={addSection}>+ Add Section</button>
        </>
      )}

      {/* Start Session modal */}
      {showStart && (
        <div className="modal-overlay" onClick={() => setShowStart(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Start Induction Session</div>
            <div className="form-group">
              <label className="form-label">Select Staff Member</label>
              <select className="form-select" value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}>
                <option value="">Choose…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={startSession} disabled={!selectedStaff || starting}>
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
