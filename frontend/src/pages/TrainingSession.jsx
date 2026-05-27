import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const SCORE_CONFIG = {
  pass:  { label: 'Pass',  color: 'var(--ok)',    bg: 'rgba(34,197,94,0.15)'  },
  mixed: { label: 'Mixed', color: 'var(--amber)',  bg: 'rgba(245,158,11,0.15)' },
  fail:  { label: 'Fail',  color: 'var(--red)',    bg: 'rgba(239,68,68,0.15)'  },
};
const SCORE_VAL = { pass: 2, mixed: 1, fail: 0 };

function overallLabel(avg) {
  if (avg === null) return { text: '—', color: 'var(--t3)' };
  if (avg >= 1.6) return { text: 'Pass', color: 'var(--ok)' };
  if (avg >= 0.8) return { text: 'Borderline', color: 'var(--amber)' };
  return { text: 'Fail', color: 'var(--red)' };
}

export default function TrainingSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { manager } = useAuth();

  const [session, setSession]   = useState(null);
  const [items, setItems]       = useState([]);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('checklist');

  // Rubric state
  const [dimensions, setDimensions] = useState([]);
  const [scoreMap, setScoreMap]     = useState({}); // "dimId_cleanNum" -> {score, notes}
  const [noteModal, setNoteModal]   = useState(null); // {dimId, cleanNum, score, notes}
  const [savingCell, setSavingCell] = useState(null);

  const loadSession = () => api.get(`/training/sessions/${id}`).then(r => {
    setSession(r.data);
    setItems(r.data.items || []);
  });

  const loadRubric = () => api.get(`/training/sessions/${id}/rubric`).then(r => {
    setDimensions(r.data.dimensions || []);
    setScoreMap(r.data.scoreMap || {});
  });

  useEffect(() => {
    Promise.all([loadSession(), loadRubric()]).finally(() => setLoading(false));
  }, [id]);

  // ── Checklist ────────────────────────────────────────────────────────────────
  const toggle = itemId => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: i.completed ? 0 : 1 } : i));
  };
  const updateNote = (itemId, notes) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
  };
  const save = async (complete = false) => {
    setSaving(true);
    const payload = { items };
    if (complete) { payload.status = 'complete'; payload.signed_off_by = manager.name; }
    await api.put(`/training/sessions/${id}`, payload);
    if (complete) navigate('/training');
    else { await loadSession(); setSaving(false); }
  };

  // ── Rubric ───────────────────────────────────────────────────────────────────
  const setScore = async (dimId, cleanNum, score) => {
    const key = `${dimId}_${cleanNum}`;
    const existing = scoreMap[key] || {};
    // If clicking same score, clear it
    const newScore = existing.score === score ? null : score;

    // If setting a fail score and no notes yet, open note modal
    if (newScore === 'fail' && !existing.notes) {
      setNoteModal({ dimId, cleanNum, score: newScore, notes: '' });
      return;
    }

    setSavingCell(key);
    await api.put(`/training/sessions/${id}/rubric/${dimId}/${cleanNum}`, {
      score: newScore,
      notes: existing.notes || '',
    });
    setScoreMap(prev => ({
      ...prev,
      [key]: { ...existing, score: newScore },
    }));
    setSavingCell(null);
  };

  const saveNoteModal = async () => {
    const { dimId, cleanNum, score, notes } = noteModal;
    const key = `${dimId}_${cleanNum}`;
    setSavingCell(key);
    await api.put(`/training/sessions/${id}/rubric/${dimId}/${cleanNum}`, { score, notes });
    setScoreMap(prev => ({ ...prev, [key]: { score, notes } }));
    setSavingCell(null);
    setNoteModal(null);
  };

  const openNotes = (dimId, cleanNum) => {
    const key = `${dimId}_${cleanNum}`;
    const existing = scoreMap[key] || {};
    setNoteModal({ dimId, cleanNum, score: existing.score || null, notes: existing.notes || '' });
  };

  // ── Rubric calculations ───────────────────────────────────────────────────────
  // Overall score per clean (avg across dimensions that have a score)
  const cleanAvg = (cleanNum) => {
    const scored = dimensions.filter(d => scoreMap[`${d.id}_${cleanNum}`]?.score);
    if (!scored.length) return null;
    return scored.reduce((sum, d) => sum + SCORE_VAL[scoreMap[`${d.id}_${cleanNum}`].score], 0) / scored.length;
  };

  // Overall across all scored cells
  const overallAvg = () => {
    let total = 0, count = 0;
    for (let c = 1; c <= 5; c++) {
      dimensions.forEach(d => {
        const s = scoreMap[`${d.id}_${c}`]?.score;
        if (s) { total += SCORE_VAL[s]; count++; }
      });
    }
    return count ? total / count : null;
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!session) return <div className="page"><p>Session not found.</p></div>;

  const sections = {};
  items.forEach(item => {
    if (!sections[item.section_id]) sections[item.section_id] = { name: item.section_name, items: [] };
    sections[item.section_id].items.push(item);
  });
  const sortedSections = Object.values(sections);
  const completed = items.filter(i => i.completed).length;
  const total = items.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const overall = overallLabel(overallAvg());

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/training')}>← Back</button>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{session.checklist_name}</h1>
        <p style={{ color: 'var(--t2)' }}>
          Trainee: <strong style={{ color: 'var(--t1)' }}>{session.trainee_name}</strong>
          {' · '}Assigned to: <strong style={{ color: 'var(--t1)' }}>{session.assigned_to_name}</strong>
          {' · '}{session.date}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {['checklist', 'shadow'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 16px', fontWeight: 700, fontSize: 14,
            color: tab === t ? 'var(--cyan)' : 'var(--t3)',
            borderBottom: tab === t ? '2px solid var(--cyan)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t === 'checklist' ? 'Onboarding Checklist' : 'Shadow Period Rubric'}
          </button>
        ))}
      </div>

      {/* ── CHECKLIST TAB ─────────────────────────────────────────────────────── */}
      {tab === 'checklist' && (
        <>
          <div className="card mb-6" style={{ padding: '16px 20px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>{completed}/{total} items completed</span>
              <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--ok)' : 'var(--t1)', fontSize: 18 }}>{pct}%</span>
            </div>
            <div className="score-bar"><div className={`score-fill ${pct >= 100 ? 'green' : pct >= 60 ? 'amber' : 'red'}`} style={{ width: `${pct}%` }} /></div>
            {session.status === 'complete' && (
              <div style={{ marginTop: 12, color: 'var(--ok)', fontSize: 13 }}>✓ Completed & signed off by {session.signed_off_by}</div>
            )}
          </div>

          {sortedSections.map((sec, si) => (
            <div key={si} className="section-block mb-4">
              <div className="section-block-header">
                <span style={{ fontWeight: 700, fontSize: 14 }}>{sec.name}</span>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>{sec.items.filter(i => i.completed).length}/{sec.items.length}</span>
              </div>
              <div className="section-block-body">
                {sec.items.map(item => (
                  <div key={item.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                    <div
                      className="flex items-center gap-3"
                      style={{ cursor: session.status !== 'complete' ? 'pointer' : 'default' }}
                      onClick={() => session.status !== 'complete' && toggle(item.id)}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${item.completed ? 'var(--green)' : 'var(--border)'}`,
                        background: item.completed ? 'var(--green)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                      }}>
                        {item.completed ? <span style={{ color: 'var(--navy)', fontWeight: 800, fontSize: 13 }}>✓</span> : null}
                      </div>
                      <span style={{ fontWeight: 500, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'var(--t3)' : 'var(--t1)' }}>
                        {item.text}
                      </span>
                    </div>
                    {item.completed && session.status !== 'complete' && (
                      <input className="form-input" style={{ marginTop: 8, marginLeft: 34, width: 'calc(100% - 34px)' }}
                        placeholder="Notes (optional)…" value={item.notes || ''}
                        onChange={e => updateNote(item.id, e.target.value)} />
                    )}
                    {item.notes && session.status === 'complete' && (
                      <div style={{ marginLeft: 34, marginTop: 4, fontSize: 12, color: 'var(--t3)' }}>{item.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {session.status !== 'complete' && (
            <div className="flex gap-3 mt-4">
              <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving}>Save Progress</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => {
                if (completed < total && !confirm('Not all items are completed. Sign off anyway?')) return;
                save(true);
              }}>
                {saving ? <><span className="spinner" /> Saving…</> : '✓ Sign Off & Complete'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── SHADOW PERIOD RUBRIC TAB ─────────────────────────────────────────── */}
      {tab === 'shadow' && (
        <>
          {/* Overall result banner */}
          <div className="card mb-4" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Shadow Period Overall</div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Average across all scored dimensions & cleans</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 22, color: overall.color }}>{overall.text}</div>
          </div>

          {/* Clean avg summary row */}
          <div className="card mb-4" style={{ padding: '12px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clean Average</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3, 4, 5].map(c => {
                const avg = cleanAvg(c);
                const ol = overallLabel(avg);
                return (
                  <div key={c} style={{
                    flex: 1, textAlign: 'center', padding: '10px 4px',
                    background: 'var(--glass)', borderRadius: 10,
                    border: '1px solid var(--glass-border)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Clean {c}</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: ol.color }}>{ol.text}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rubric grid */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr repeat(5, 80px)',
              padding: '10px 16px', background: 'var(--navy2)',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase' }}>Dimension</div>
              {[1,2,3,4,5].map(c => (
                <div key={c} style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textAlign: 'center', textTransform: 'uppercase' }}>C{c}</div>
              ))}
            </div>

            {dimensions.map((dim, di) => (
              <div key={dim.id} style={{
                display: 'grid', gridTemplateColumns: '1fr repeat(5, 80px)',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: di < dimensions.length - 1 ? '1px solid var(--border)' : 'none',
                background: di % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              }}>
                {/* Dimension name + descriptions */}
                <div style={{ paddingRight: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{dim.name}</div>
                  {dim.pass_desc && (
                    <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 2 }}>✓ {dim.pass_desc}</div>
                  )}
                  {dim.fail_desc && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 1 }}>✗ {dim.fail_desc}</div>
                  )}
                </div>

                {/* Score cells */}
                {[1,2,3,4,5].map(c => {
                  const key = `${dim.id}_${c}`;
                  const cell = scoreMap[key] || {};
                  const isSaving = savingCell === key;
                  const cfg = cell.score ? SCORE_CONFIG[cell.score] : null;

                  return (
                    <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {/* Score cycle button */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 60 }}>
                        {['pass', 'mixed', 'fail'].map(s => (
                          <button key={s} onClick={() => setScore(dim.id, c, s)} disabled={isSaving} style={{
                            padding: '3px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
                            border: `1px solid ${cell.score === s ? SCORE_CONFIG[s].color : 'var(--border)'}`,
                            background: cell.score === s ? SCORE_CONFIG[s].bg : 'transparent',
                            color: cell.score === s ? SCORE_CONFIG[s].color : 'var(--t3)',
                            cursor: 'pointer', transition: 'all .1s', textTransform: 'uppercase',
                          }}>
                            {SCORE_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                      {/* Notes indicator / button */}
                      <button onClick={() => openNotes(dim.id, c)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 11, color: cell.notes ? 'var(--cyan)' : 'var(--t3)',
                      }} title={cell.notes || 'Add note'}>
                        {cell.notes ? '✎ note' : '+ note'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {dimensions.length === 0 && (
            <div style={{ color: 'var(--t3)', padding: 24, textAlign: 'center' }}>
              No rubric dimensions configured. Go to Onboarding → Edit Template → Shadow Period Rubric to set them up.
            </div>
          )}
        </>
      )}

      {/* ── Note modal ─────────────────────────────────────────────────────────── */}
      {noteModal && (
        <div className="modal-overlay" onClick={() => setNoteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-title">
              {dimensions.find(d => d.id === noteModal.dimId)?.name} — Clean {noteModal.cleanNum}
            </div>

            {/* Score selector inside modal */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['pass', 'mixed', 'fail'].map(s => (
                <button key={s} onClick={() => setNoteModal(m => ({ ...m, score: m.score === s ? null : s }))} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  border: `2px solid ${noteModal.score === s ? SCORE_CONFIG[s].color : 'var(--border)'}`,
                  background: noteModal.score === s ? SCORE_CONFIG[s].bg : 'transparent',
                  color: noteModal.score === s ? SCORE_CONFIG[s].color : 'var(--t3)',
                  cursor: 'pointer',
                }}>
                  {SCORE_CONFIG[s].label}
                </button>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">Notes {noteModal.score === 'fail' ? '(required for fail)' : '(optional)'}</label>
              <textarea
                className="form-input"
                rows={3}
                style={{ resize: 'vertical' }}
                placeholder="What specifically was observed…"
                value={noteModal.notes}
                onChange={e => setNoteModal(m => ({ ...m, notes: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={saveNoteModal}
                disabled={noteModal.score === 'fail' && !noteModal.notes.trim()}>
                Save
              </button>
              <button className="btn btn-ghost" onClick={() => setNoteModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
