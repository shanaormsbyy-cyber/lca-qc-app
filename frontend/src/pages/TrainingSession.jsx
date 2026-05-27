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

  // Rubric sign-off
  const [rubricNote, setRubricNote]         = useState('');
  const [editingNote, setEditingNote]       = useState(false);
  const [savingNote, setSavingNote]         = useState(false);
  const [signingOff, setSigningOff]         = useState(false);

  // Resources
  const [resources, setResources]       = useState([]);
  const [uploading, setUploading]       = useState(false);
  const [viewingResource, setViewingResource] = useState(null);

  // Solo probation
  const [probation, setProbation] = useState({
    probation_start: '', probation_end: '', probation_qc_avg: '',
    probation_trajectory: '', probation_code_adherence: '', probation_standing_notes: '',
  });
  const [savingProbation, setSavingProbation] = useState(false);
  const [probationSigningOff, setProbationSigningOff] = useState(false);

  const loadSession = () => api.get(`/training/sessions/${id}`).then(r => {
    setSession(r.data);
    setItems(r.data.items || []);
    setRubricNote(r.data.rubric_signoff_note || '');
    setProbation({
      probation_start:          r.data.probation_start          || '',
      probation_end:            r.data.probation_end            || '',
      probation_qc_avg:         r.data.probation_qc_avg         || '',
      probation_trajectory:     r.data.probation_trajectory     || '',
      probation_code_adherence: r.data.probation_code_adherence || '',
      probation_standing_notes: r.data.probation_standing_notes || '',
    });
    return r.data;
  });

  const loadRubric = () => api.get(`/training/sessions/${id}/rubric`).then(r => {
    setDimensions(r.data.dimensions || []);
    setScoreMap(r.data.scoreMap || {});
  });

  const loadBriefs = (staffId) => api.get(`/training/briefs/${staffId}`).then(r => setBriefs(r.data));

  const loadResources = () => api.get('/training/resources').then(r => setResources(r.data));

  useEffect(() => {
    Promise.all([loadSession(), loadRubric(), loadResources()])
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
    if (!sections[item.section_id]) sections[item.section_id] = {
      name: item.section_name,
      shift_label: item.section_shift_label || '',
      description: item.section_description || '',
      items: [],
    };
    sections[item.section_id].items.push(item);
  });
  const allSections = Object.values(sections);
  const isOffice = s => /office/i.test(s.shift_label || s.name);
  const sortedSections = allSections.filter(s => !isOffice(s));
  const officeSections = allSections.filter(s => isOffice(s));
  const checklistItems = sortedSections.flatMap(s => s.items);
  const officeItems    = officeSections.flatMap(s => s.items);
  const completed = checklistItems.filter(i => !!i.completed).length;
  const total     = checklistItems.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const officeCompleted = officeItems.filter(i => !!i.completed).length;

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
        {[['checklist', 'Onboarding Checklist'], ['office', 'Office Use Only'], ['shadow', 'Shadow Period Rubric'], ['probation', 'Solo Probation'], ['resources', 'Resources'], ['brief', 'Brief']].map(([t, label]) => (
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
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>{sec.items.filter(i => !!i.completed).length}/{sec.items.length}</span>
              </div>
              {sec.description && (
                <div style={{
                  margin: '0 0 0 0', padding: '10px 16px',
                  background: 'rgba(58,181,217,0.08)', borderBottom: '1px solid rgba(58,181,217,0.2)',
                  fontSize: 13, color: 'var(--cyan)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {sec.description}
                </div>
              )}
              <div className="section-block-body">
                {sec.items.map(item => {
                  const done = !!item.completed;
                  return (
                    <div key={item.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-3"
                        style={{ cursor: session.status !== 'complete' ? 'pointer' : 'default' }}
                        onClick={() => session.status !== 'complete' && toggle(item.id)}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${done ? 'var(--ok)' : 'rgba(255,255,255,0.25)'}`,
                          background: done ? 'var(--ok)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                        }}>
                          {done && <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: 500, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--t3)' : 'var(--t1)' }}>
                          {item.text}
                        </span>
                      </div>
                      {done && session.status !== 'complete' && (
                        <input className="form-input" style={{ marginTop: 8, marginLeft: 34, width: 'calc(100% - 34px)' }}
                          placeholder="Notes (optional)…" value={item.notes || ''}
                          onChange={e => updateNote(item.id, e.target.value)} />
                      )}
                      {item.notes && session.status === 'complete' && (
                        <div style={{ marginLeft: 34, marginTop: 4, fontSize: 12, color: 'var(--t3)' }}>{item.notes}</div>
                      )}
                    </div>
                  );
                })}
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

      {/* ── OFFICE USE ONLY TAB ───────────────────────────────────────────────── */}
      {tab === 'office' && (
        <>
          <div className="card mb-6" style={{ padding: '16px 20px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>{officeCompleted}/{officeItems.length} items completed</span>
              <span style={{ fontWeight: 700, color: officeCompleted === officeItems.length && officeItems.length > 0 ? 'var(--ok)' : 'var(--t1)', fontSize: 18 }}>
                {officeItems.length ? Math.round((officeCompleted / officeItems.length) * 100) : 0}%
              </span>
            </div>
            <div className="score-bar">
              <div className={`score-fill ${officeCompleted === officeItems.length && officeItems.length > 0 ? 'green' : officeCompleted / officeItems.length >= 0.6 ? 'amber' : 'red'}`}
                style={{ width: `${officeItems.length ? Math.round((officeCompleted / officeItems.length) * 100) : 0}%` }} />
            </div>
          </div>

          {officeSections.length === 0 && (
            <div style={{ color: 'var(--t3)', textAlign: 'center', padding: '32px 0' }}>
              No Office Use Only sections in this checklist template.
            </div>
          )}

          {officeSections.map((sec, si) => (
            <div key={si} className="section-block mb-4">
              <div className="section-block-header">
                <span style={{ fontWeight: 700, fontSize: 14 }}>{sec.name}</span>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>{sec.items.filter(i => !!i.completed).length}/{sec.items.length}</span>
              </div>
              {sec.description && (
                <div style={{
                  padding: '10px 16px',
                  background: 'rgba(58,181,217,0.08)', borderBottom: '1px solid rgba(58,181,217,0.2)',
                  fontSize: 13, color: 'var(--cyan)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {sec.description}
                </div>
              )}
              <div className="section-block-body">
                {sec.items.map(item => {
                  const done = !!item.completed;
                  return (
                    <div key={item.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-3"
                        style={{ cursor: session.status !== 'complete' ? 'pointer' : 'default' }}
                        onClick={() => session.status !== 'complete' && toggle(item.id)}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${done ? 'var(--ok)' : 'rgba(255,255,255,0.25)'}`,
                          background: done ? 'var(--ok)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                        }}>
                          {done && <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: 500, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--t3)' : 'var(--t1)' }}>
                          {item.text}
                        </span>
                      </div>
                      {done && session.status !== 'complete' && (
                        <input className="form-input" style={{ marginTop: 8, marginLeft: 34, width: 'calc(100% - 34px)' }}
                          placeholder="Notes (optional)…" value={item.notes || ''}
                          onChange={e => updateNote(item.id, e.target.value)} />
                      )}
                      {item.notes && session.status === 'complete' && (
                        <div style={{ marginLeft: 34, marginTop: 4, fontSize: 12, color: 'var(--t3)' }}>{item.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {session.status !== 'complete' && officeItems.length > 0 && (
            <div className="flex gap-3 mt-4">
              <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving}>Save Progress</button>
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
                  border: `2px solid ${isActive ? 'var(--cyan)' : 'var(--glass-border)'}`,
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
                          border: `2px solid ${active ? cfg.border : 'var(--glass-border)'}`,
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

          {/* ── Sign-off section ── */}
          <div style={{ marginTop: 28, borderTop: '2px solid var(--glass-border)', paddingTop: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 16 }}>Shadow Period Sign-Off</div>

            {/* Blue info box — editable */}
            <div style={{ marginBottom: 20 }}>
              {!editingNote ? (
                <div
                  onClick={() => !session.rubric_signoff_status && setEditingNote(true)}
                  style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(58,181,217,0.08)', border: '1px solid rgba(58,181,217,0.25)',
                    fontSize: 13, color: rubricNote ? 'var(--cyan)' : 'rgba(58,181,217,0.45)',
                    lineHeight: 1.6, whiteSpace: 'pre-wrap', cursor: session.rubric_signoff_status ? 'default' : 'pointer',
                    minHeight: 48,
                  }}
                >
                  {rubricNote || (session.rubric_signoff_status ? 'No sign-off notes.' : 'Tap to add notes for managers to read before signing off…')}
                  {!session.rubric_signoff_status && rubricNote && (
                    <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>✎</span>
                  )}
                </div>
              ) : (
                <div>
                  <textarea
                    className="form-input"
                    rows={4}
                    style={{ resize: 'vertical', marginBottom: 8 }}
                    autoFocus
                    value={rubricNote}
                    onChange={e => setRubricNote(e.target.value)}
                    placeholder="e.g. Review overall scores before signing off. Consider improvement trend across cleans more than individual scores…"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" disabled={savingNote} onClick={async () => {
                      setSavingNote(true);
                      await api.put(`/training/sessions/${id}/rubric-note`, { note: rubricNote });
                      setSavingNote(false);
                      setEditingNote(false);
                    }}>
                      {savingNote ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setRubricNote(session.rubric_signoff_note || ''); setEditingNote(false); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Sign-off status or buttons */}
            {session.rubric_signoff_status ? (
              <div>
                <div style={{
                  padding: '16px 20px', borderRadius: 12, marginBottom: 12,
                  background: session.rubric_signoff_status === 'approved' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${session.rubric_signoff_status === 'approved' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: session.rubric_signoff_status === 'approved' ? 'var(--ok)' : 'var(--red)', marginBottom: 4 }}>
                    {session.rubric_signoff_status === 'approved' ? '✓ Shadow Period Approved' : '✗ Shadow Period Declined'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--t2)' }}>
                    Signed off by <strong style={{ color: 'var(--t1)' }}>{session.rubric_signoff_by}</strong>
                    {' · '}{new Date(session.rubric_signoff_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!confirm('Undo this sign-off?')) return;
                  await api.delete(`/training/sessions/${id}/rubric-signoff`);
                  setSession(s => ({ ...s, rubric_signoff_status: null, rubric_signoff_by: null, rubric_signoff_at: null }));
                }}>
                  Undo Sign-Off
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
                  Overall score: <strong style={{ color: pctColor(overallPct), fontSize: 15 }}>{overallPct !== null ? `${overallPct}%` : '—'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    disabled={signingOff}
                    onClick={async () => {
                      if (!confirm(`Approve shadow period for ${session.trainee_name}?`)) return;
                      setSigningOff(true);
                      await api.post(`/training/sessions/${id}/rubric-signoff`, { status: 'approved' });
                      await loadSession();
                      setSigningOff(false);
                    }}
                  >
                    ✓ Approve Shadow Period
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={signingOff}
                    onClick={async () => {
                      if (!confirm(`Decline shadow period for ${session.trainee_name}? This means they did not pass.`)) return;
                      setSigningOff(true);
                      await api.post(`/training/sessions/${id}/rubric-signoff`, { status: 'declined' });
                      await loadSession();
                      setSigningOff(false);
                    }}
                  >
                    ✗ Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── SOLO PROBATION TAB ────────────────────────────────────────────────── */}
      {tab === 'probation' && (
        <>
          {/* Reference: Dashboard signals */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--cyan)', marginBottom: 6 }}>Dashboard signals to monitor</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10, fontStyle: 'italic' }}>
              L3 reviews every QC photo and dashboard entry for the first 30 days. Watch for patterns, not single events.
            </div>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.4fr', background: 'var(--cyan)', padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#000' }}>
                <span>Signal</span><span>Healthy (PASS)</span><span>Concerning (FAIL)</span>
              </div>
              {[
                ['QC average (rolling)',  'Climbing toward 90%+, holds there',                   'Below 85%, or stuck 75–85% without improvement'],
                ['Pattern of misses',     'Specific categories improving over time',              'Same misses repeating week after week'],
                ['Photo quality',         'Full quality, every category covered',                 'Sloppy, blurry, missing'],
                ['Checklist completion',  '100% every clean',                                    'Skipped items, half-completed'],
                ['Reporting',            'Reports through proper channel, on time',              'Misses, hides, late'],
                ['Speed trend',          'Improving toward standard pace, quality holds',        'Too slow (avoidant) or fast + sloppy'],
                ['Reliability',          'Shows up to every committed shift',                    'Late, no-shows, cancellations'],
                ['Team interactions',    'Pleasant, communicative',                              'Friction, lone-wolf energy'],
              ].map(([signal, pass, fail], i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.4fr',
                  padding: '9px 12px', fontSize: 12,
                  background: i % 2 === 0 ? 'var(--glass)' : 'transparent',
                  borderTop: '1px solid var(--glass-border)',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{signal}</span>
                  <span style={{ color: 'var(--ok)' }}>{pass}</span>
                  <span style={{ color: 'var(--red)' }}>{fail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reference: Weekly check-in framework */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--cyan)', marginBottom: 6 }}>Weekly check-in — framework</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10, fontStyle: 'italic' }}>
              5–10 minutes. Phone or in person. Every week of the 30 days. Don't skip even if everything looks great — it's relationship-building too.
            </div>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', background: 'var(--cyan)', padding: '8px 12px', fontWeight: 700, fontSize: 12, color: '#000' }}>
                <span>Section</span><span>What to surface</span>
              </div>
              {[
                ["What's working",           'Specific reinforcement (not generic "good job"). Reference dashboard data.'],
                ['What needs adjustment',    'Specific, from the dashboard. One focus area for the week ahead.'],
                ["How they're finding it",   'Listen for stress, frustration, confusion. Real conversation, not a checkbox.'],
                ['Reaffirm standard + timeline', "You're [week X] of probation. Here's what excellent looks like at this point."],
              ].map(([section, surface], i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 2fr',
                  padding: '9px 12px', fontSize: 12,
                  background: i % 2 === 0 ? 'var(--glass)' : 'transparent',
                  borderTop: '1px solid var(--glass-border)',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--t1)' }}>{section}</span>
                  <span style={{ color: 'var(--t2)' }}>{surface}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fillable: End-of-Probation record */}
          <div style={{ borderTop: '2px solid var(--glass-border)', paddingTop: 24, marginBottom: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--cyan)', marginBottom: 16 }}>
              End-of-Probation — Record Entry
            </div>

            {session.probation_decision ? (
              /* Locked view */
              <div>
                <div style={{
                  padding: '14px 18px', borderRadius: 12, marginBottom: 16,
                  background: session.probation_decision === 'approved' ? 'rgba(34,197,94,0.1)' : session.probation_decision === 'extend' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${session.probation_decision === 'approved' ? 'rgba(34,197,94,0.3)' : session.probation_decision === 'extend' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4,
                    color: session.probation_decision === 'approved' ? 'var(--ok)' : session.probation_decision === 'extend' ? 'var(--amber)' : 'var(--red)' }}>
                    {session.probation_decision === 'approved' ? '✓ APPROVED for Standard' : session.probation_decision === 'extend' ? '⏱ EXTEND Probation 2 Weeks' : '✗ PART WAYS'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--t2)' }}>
                    Signed off by <strong style={{ color: 'var(--t1)' }}>{session.probation_signoff_by}</strong>
                    {' · '}{new Date(session.probation_signoff_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                {/* Show saved record */}
                <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--glass)', border: '1px solid var(--glass-border)', fontSize: 13, lineHeight: 2 }}>
                  <div><strong style={{ color: 'var(--t2)' }}>Team member:</strong> {session.trainee_name}</div>
                  <div><strong style={{ color: 'var(--t2)' }}>Probation period:</strong> {probation.probation_start || '—'} to {probation.probation_end || '—'}</div>
                  <div><strong style={{ color: 'var(--t2)' }}>Rolling 30-day QC average:</strong> {probation.probation_qc_avg || '—'}</div>
                  <div><strong style={{ color: 'var(--t2)' }}>Trajectory:</strong> {probation.probation_trajectory || '—'}</div>
                  <div><strong style={{ color: 'var(--t2)' }}>Code adherence:</strong> {probation.probation_code_adherence || '—'}</div>
                  <div><strong style={{ color: 'var(--t2)' }}>Standing notes for future:</strong> {probation.probation_standing_notes || '—'}</div>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={async () => {
                  if (!confirm('Undo this probation sign-off?')) return;
                  await api.delete(`/training/sessions/${id}/probation-signoff`);
                  setSession(s => ({ ...s, probation_decision: null, probation_signoff_by: null, probation_signoff_at: null }));
                }}>
                  Undo Sign-Off
                </button>
              </div>
            ) : (
              /* Editable form */
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Probation start date</label>
                    <input className="form-input" type="date" value={probation.probation_start}
                      onChange={e => setProbation(p => ({ ...p, probation_start: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Probation end date</label>
                    <input className="form-input" type="date" value={probation.probation_end}
                      onChange={e => setProbation(p => ({ ...p, probation_end: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rolling 30-day QC average</label>
                  <input className="form-input" placeholder="e.g. 91%" value={probation.probation_qc_avg}
                    onChange={e => setProbation(p => ({ ...p, probation_qc_avg: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trajectory</label>
                  <input className="form-input" placeholder="Brief summary of curve across 30 days…" value={probation.probation_trajectory}
                    onChange={e => setProbation(p => ({ ...p, probation_trajectory: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Code adherence</label>
                  <input className="form-input" placeholder="No violations / specific violations logged…" value={probation.probation_code_adherence}
                    onChange={e => setProbation(p => ({ ...p, probation_code_adherence: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Standing notes for future</label>
                  <textarea className="form-input" rows={3} placeholder="Anything to remember about this team member…" value={probation.probation_standing_notes}
                    onChange={e => setProbation(p => ({ ...p, probation_standing_notes: e.target.value }))} />
                </div>
                <button className="btn btn-secondary btn-sm" disabled={savingProbation} style={{ marginBottom: 20 }}
                  onClick={async () => {
                    setSavingProbation(true);
                    await api.put(`/training/sessions/${id}/probation`, probation);
                    setSavingProbation(false);
                  }}>
                  {savingProbation ? 'Saving…' : 'Save Notes'}
                </button>

                {/* Decision buttons */}
                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Decision</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" disabled={probationSigningOff} onClick={async () => {
                      if (!confirm(`Approve ${session.trainee_name} for Standard?`)) return;
                      setProbationSigningOff(true);
                      await api.put(`/training/sessions/${id}/probation`, probation);
                      await api.post(`/training/sessions/${id}/probation-signoff`, { decision: 'approved' });
                      await loadSession();
                      setProbationSigningOff(false);
                    }}>✓ Approved for Standard</button>
                    <button className="btn btn-secondary" disabled={probationSigningOff} onClick={async () => {
                      if (!confirm(`Extend probation 2 weeks for ${session.trainee_name}?`)) return;
                      setProbationSigningOff(true);
                      await api.put(`/training/sessions/${id}/probation`, probation);
                      await api.post(`/training/sessions/${id}/probation-signoff`, { decision: 'extend' });
                      await loadSession();
                      setProbationSigningOff(false);
                    }}>⏱ Extend 2 Weeks</button>
                    <button className="btn btn-danger" disabled={probationSigningOff} onClick={async () => {
                      if (!confirm(`Part ways with ${session.trainee_name}? This cannot be undone easily.`)) return;
                      setProbationSigningOff(true);
                      await api.put(`/training/sessions/${id}/probation`, probation);
                      await api.post(`/training/sessions/${id}/probation-signoff`, { decision: 'part_ways' });
                      await loadSession();
                      setProbationSigningOff(false);
                    }}>✗ Part Ways</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── RESOURCES TAB ─────────────────────────────────────────────────────── */}
      {tab === 'resources' && (
        <>
          {/* Upload area */}
          <div className="card mb-5" style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Upload Resource</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>PDFs and images (max 20MB). Shared across all onboarding sessions.</div>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '20px', borderRadius: 10, cursor: 'pointer',
              border: '2px dashed rgba(58,181,217,0.4)', background: 'rgba(58,181,217,0.05)',
              color: uploading ? 'var(--t3)' : 'var(--cyan)', fontWeight: 700, fontSize: 14,
              transition: 'all .15s',
            }}>
              {uploading ? <><span className="spinner" /> Uploading…</> : '+ Tap to upload PDF or image'}
              <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                disabled={uploading}
                onChange={async e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setUploading(true);
                  const fd = new FormData();
                  fd.append('file', file);
                  await api.post('/training/resources', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  await loadResources();
                  setUploading(false);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Resource list */}
          {resources.length === 0 ? (
            <div style={{ color: 'var(--t3)', textAlign: 'center', padding: '32px 0' }}>
              No resources uploaded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {resources.map(r => {
                const isImage = r.mimetype.startsWith('image/');
                const url = `/uploads/${r.filename}`;
                return (
                  <div key={r.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Thumbnail / icon */}
                    <div
                      onClick={() => setViewingResource(r)}
                      style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                        background: 'var(--glass)', border: '1px solid var(--glass-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isImage
                        ? <img src={url} alt={r.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 26 }}>📄</span>
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.original_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                        Uploaded by {r.uploaded_by} · {new Date(r.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setViewingResource(r)}>Open</button>
                      <button className="btn btn-sm btn-danger" onClick={async () => {
                        if (!confirm(`Delete "${r.original_name}"?`)) return;
                        await api.delete(`/training/resources/${r.id}`);
                        setResources(prev => prev.filter(x => x.id !== r.id));
                      }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Resource viewer modal (fullscreen) ────────────────────────────────── */}
      {viewingResource && (
        <div
          onClick={() => setViewingResource(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
        >
          {/* Header */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', background: 'rgba(0,0,0,0.6)', flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 100px)' }}>
              {viewingResource.original_name}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={`/uploads/${viewingResource.filename}`}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="btn btn-sm btn-secondary"
              >
                ↗ Open
              </a>
              <button className="btn btn-sm btn-ghost" onClick={() => setViewingResource(null)}>✕ Close</button>
            </div>
          </div>
          {/* Content */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, width: '100%', overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16 }}
          >
            {viewingResource.mimetype.startsWith('image/') ? (
              <img
                src={`/uploads/${viewingResource.filename}`}
                alt={viewingResource.original_name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
              />
            ) : (
              <iframe
                src={`/uploads/${viewingResource.filename}`}
                title={viewingResource.original_name}
                style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 80px)', border: 'none', borderRadius: 8 }}
              />
            )}
          </div>
        </div>
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
