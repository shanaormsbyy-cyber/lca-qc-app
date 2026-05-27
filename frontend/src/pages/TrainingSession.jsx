import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const SCORE_CFG = {
  pass:  { label: 'Pass',  color: 'var(--ok)',   bg: 'rgba(34,197,94,0.18)',   border: 'rgba(34,197,94,0.5)'   },
  mixed: { label: 'Mixed', color: 'var(--amber)', bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.5)'  },
  fail:  { label: 'Fail',  color: 'var(--red)',   bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.5)'   },
};
const SCORE_VAL = { pass: 2, mixed: 1, fail: 0 };
const SCORES = ['pass', 'mixed', 'fail'];

function calcPct(avg) {
  // avg is 0–2, map to 0–100%
  return avg === null ? null : Math.round((avg / 2) * 100);
}

function pctColor(pct) {
  if (pct === null) return 'var(--t3)';
  if (pct >= 80) return 'var(--ok)';
  if (pct >= 40) return 'var(--amber)';
  return 'var(--red)';
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

  // Rubric
  const [dimensions, setDimensions] = useState([]);
  const [scoreMap, setScoreMap]     = useState({});
  const [noteModal, setNoteModal]   = useState(null);
  const [savingCell, setSavingCell] = useState(null);
  const [activeClean, setActiveClean] = useState(1);

  // Brief
  const [briefs, setBriefs]         = useState([]);
  const [briefText, setBriefText]   = useState('');
  const [postingBrief, setPostingBrief] = useState(false);

  const loadSession = () => api.get(`/training/sessions/${id}`).then(r => {
    setSession(r.data);
    setItems(r.data.items || []);
    return r.data;
  });

  const loadRubric = () => api.get(`/training/sessions/${id}/rubric`).then(r => {
    setDimensions(r.data.dimensions || []);
    setScoreMap(r.data.scoreMap || {});
  });

  const loadBriefs = (staffId) => api.get(`/training/briefs/${staffId}`).then(r => setBriefs(r.data));

  useEffect(() => {
    Promise.all([loadSession(), loadRubric()])
      .then(([sessionData]) => {
        if (sessionData?.trainee_id) loadBriefs(sessionData.trainee_id);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // ── Checklist ────────────────────────────────────────────────────────────────
  const toggle = itemId =>
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: i.completed ? 0 : 1 } : i));

  const updateNote = (itemId, notes) =>
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));

  const save = async (complete = false) => {
    setSaving(true);
    const payload = { items };
    if (complete) { payload.status = 'complete'; payload.signed_off_by = manager.name; }
    await api.put(`/training/sessions/${id}`, payload);
    if (complete) navigate('/training');
    else { await loadSession(); setSaving(false); }
  };

  // ── Rubric ────────────────────────────────────────────────────────────────────
  const setScore = async (dimId, cleanNum, score) => {
    const key = `${dimId}_${cleanNum}`;
    const existing = scoreMap[key] || {};
    const newScore = existing.score === score ? null : score;

    // Fail always opens note modal (required note)
    if (newScore === 'fail') {
      setNoteModal({ dimId, cleanNum, score: newScore, notes: existing.notes || '' });
      return;
    }

    setSavingCell(key);
    await api.put(`/training/sessions/${id}/rubric/${dimId}/${cleanNum}`, {
      score: newScore,
      notes: existing.notes || '',
    });
    setScoreMap(prev => ({ ...prev, [key]: { ...existing, score: newScore } }));
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

  // ── Calculations ──────────────────────────────────────────────────────────────
  const cleanAvg = (cleanNum) => {
    const scored = dimensions.filter(d => scoreMap[`${d.id}_${cleanNum}`]?.score);
    if (!scored.length) return null;
    return scored.reduce((s, d) => s + SCORE_VAL[scoreMap[`${d.id}_${cleanNum}`].score], 0) / scored.length;
  };

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

  const overallPct = calcPct(overallAvg());

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/training')}>← Back</button>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{session.checklist_name}</h1>
        <p style={{ color: 'var(--t2)', fontSize: 13 }}>
          <strong style={{ color: 'var(--t1)' }}>{session.trainee_name}</strong>
          {' · '}Assigned to: <strong style={{ color: 'var(--t1)' }}>{session.assigned_to_name}</strong>
          {' · '}{session.date}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['checklist', 'Onboarding Checklist'], ['shadow', 'Shadow Period Rubric'], ['brief', 'Brief']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 18px', fontWeight: 700, fontSize: 14,
            color: tab === t ? 'var(--cyan)' : 'var(--t3)',
            borderBottom: tab === t ? '2px solid var(--cyan)' : '2px solid transparent',
            marginBottom: -2, whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

      {/* ── CHECKLIST TAB ──────────────────────────────────────────────────────── */}
      {tab === 'checklist' && (
        <>
          <div className="card mb-6" style={{ padding: '16px 20px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>{completed}/{total} items completed</span>
              <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--ok)' : 'var(--t1)', fontSize: 18 }}>{pct}%</span>
            </div>
            <div className="score-bar">
              <div className={`score-fill ${pct >= 100 ? 'green' : pct >= 60 ? 'amber' : 'red'}`} style={{ width: `${pct}%` }} />
            </div>
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
                    <div className="flex items-center gap-3"
                      style={{ cursor: session.status !== 'complete' ? 'pointer' : 'default' }}
                      onClick={() => session.status !== 'complete' && toggle(item.id)}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${item.completed ? 'var(--green)' : 'var(--border)'}`,
                        background: item.completed ? 'var(--green)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                      }}>
                        {item.completed && <span style={{ color: 'var(--navy)', fontWeight: 800, fontSize: 13 }}>✓</span>}
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

      {/* ── SHADOW PERIOD RUBRIC TAB ───────────────────────────────────────────── */}
      {tab === 'shadow' && (
        <>
          {/* Overall score banner */}
          <div className="card mb-4" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Shadow Period Score</div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>All scored dimensions across all 5 cleans</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, fontSize: 32, color: pctColor(overallPct), lineHeight: 1 }}>
                {overallPct !== null ? `${overallPct}%` : '—'}
              </div>
            </div>
          </div>

          {/* Clean selector — large tap targets */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[1,2,3,4,5].map(c => {
              const avg = cleanAvg(c);
              const p = calcPct(avg);
              const isActive = activeClean === c;
              return (
                <button key={c} onClick={() => setActiveClean(c)} style={{
                  flex: 1, padding: '12px 4px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${isActive ? 'var(--cyan)' : 'var(--border)'}`,
                  background: isActive ? 'rgba(58,181,217,0.1)' : 'var(--glass)',
                  transition: 'all .15s',
                }}>
                  <div style={{ fontSize: 12, color: isActive ? 'var(--cyan)' : 'var(--t3)', fontWeight: 700, marginBottom: 4 }}>
                    Clean {c}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: p !== null ? pctColor(p) : 'var(--t3)' }}>
                    {p !== null ? `${p}%` : '—'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dimension cards for active clean */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dimensions.map(dim => {
              const key = `${dim.id}_${activeClean}`;
              const cell = scoreMap[key] || {};
              const isSaving = savingCell === key;

              return (
                <div key={dim.id} className="card" style={{ padding: '14px 16px' }}>
                  {/* Dimension name */}
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{dim.name}</div>

                  {/* Pass/fail descriptions */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    {dim.pass_desc && (
                      <div style={{ fontSize: 12, color: 'var(--ok)', flex: '1 1 120px' }}>✓ {dim.pass_desc}</div>
                    )}
                    {dim.fail_desc && (
                      <div style={{ fontSize: 12, color: 'var(--red)', flex: '1 1 120px' }}>✗ {dim.fail_desc}</div>
                    )}
                  </div>

                  {/* Score buttons — large, full width row */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {SCORES.map(s => {
                      const cfg = SCORE_CFG[s];
                      const active = cell.score === s;
                      return (
                        <button key={s} onClick={() => !isSaving && setScore(dim.id, activeClean, s)} style={{
                          flex: 1, padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                          border: `2px solid ${active ? cfg.border : 'var(--border)'}`,
                          background: active ? cfg.bg : 'var(--glass)',
                          color: active ? cfg.color : 'var(--t3)',
                          fontWeight: 800, fontSize: 15,
                          transition: 'all .15s',
                          opacity: isSaving ? 0.5 : 1,
                        }}>
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Notes */}
                  {cell.notes && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      fontSize: 13, color: 'var(--t2)',
                    }}>
                      📝 {cell.notes}
                    </div>
                  )}
                  {cell.score && (
                    <button onClick={() => openNotes(dim.id, activeClean)} style={{
                      marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: cell.notes ? 'var(--cyan)' : 'var(--t3)', padding: 0,
                    }}>
                      {cell.notes ? '✎ Edit note' : '+ Add note'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {dimensions.length === 0 && (
            <div style={{ color: 'var(--t3)', padding: 32, textAlign: 'center' }}>
              No rubric dimensions set up yet. Go to Onboarding → Edit Template → Shadow Period Rubric tab.
            </div>
          )}
        </>
      )}

      {/* ── BRIEF TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'brief' && (
        <>
          {/* Post new entry */}
          <div className="card mb-5" style={{ padding: '16px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Add Brief Update</div>
            <textarea
              className="form-input"
              rows={4}
              style={{ resize: 'vertical', marginBottom: 12 }}
              placeholder="e.g. Great attitude, needs more confidence with bed-making. Arrived on time, asked good questions…"
              value={briefText}
              onChange={e => setBriefText(e.target.value)}
            />
            <button
              className="btn btn-primary"
              disabled={postingBrief || !briefText.trim()}
              onClick={async () => {
                setPostingBrief(true);
                await api.post(`/training/briefs/${session.trainee_id}`, { body: briefText.trim() });
                setBriefText('');
                await loadBriefs(session.trainee_id);
                setPostingBrief(false);
              }}
            >
              {postingBrief ? <><span className="spinner" /> Posting…</> : 'Post Update'}
            </button>
          </div>

          {/* Brief log */}
          {briefs.length === 0 ? (
            <div style={{ color: 'var(--t3)', textAlign: 'center', padding: '32px 0' }}>
              No brief entries yet. Add one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {briefs.map(b => (
                <div key={b.id} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--cyan)' }}>{b.author_name}</span>
                      <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 10 }}>
                        {new Date(b.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this brief entry?')) return;
                        await api.delete(`/training/briefs/entry/${b.id}`);
                        setBriefs(prev => prev.filter(x => x.id !== b.id));
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                      title="Delete"
                    >✕</button>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--t1)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.body}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Note modal ─────────────────────────────────────────────────────────── */}
      {noteModal && (
        <div className="modal-overlay" onClick={() => setNoteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-title">
              {dimensions.find(d => d.id === noteModal.dimId)?.name}
              <span style={{ color: 'var(--t3)', fontWeight: 400, fontSize: 14 }}> — Clean {noteModal.cleanNum}</span>
            </div>

            {/* Score selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {SCORES.map(s => {
                const cfg = SCORE_CFG[s];
                const active = noteModal.score === s;
                return (
                  <button key={s} onClick={() => setNoteModal(m => ({ ...m, score: m.score === s ? null : s }))} style={{
                    flex: 1, padding: '12px 8px', borderRadius: 10, fontWeight: 800, fontSize: 15,
                    border: `2px solid ${active ? cfg.border : 'var(--border)'}`,
                    background: active ? cfg.bg : 'transparent',
                    color: active ? cfg.color : 'var(--t3)',
                    cursor: 'pointer',
                  }}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            <div className="form-group">
              <label className="form-label">
                Notes {noteModal.score === 'fail' ? <span style={{ color: 'var(--red)' }}>— required for fail</span> : '(optional)'}
              </label>
              <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
                placeholder="What specifically was observed…"
                value={noteModal.notes}
                onChange={e => setNoteModal(m => ({ ...m, notes: e.target.value }))}
                autoFocus />
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
