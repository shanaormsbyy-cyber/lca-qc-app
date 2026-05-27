import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { fmtDate } from '../utils';

import useLiveSync from '../hooks/useLiveSync';

// RGB colour constants used in PDF — LCA brand colours
const NAVY      = [8, 8, 12];       // near-black background
const NAVY_MID  = [20, 20, 32];     // slightly lighter card bg
const CYAN_PDF  = [58, 181, 217];   // LCA teal/cyan accent #3AB5D9
const WHITE     = [255, 255, 255];
const GREY_TEXT = [100, 115, 130];  // muted label text
const PASS_G    = [34, 197, 94];    // green #22c55e
const FAIL_R    = [239, 68, 68];    // red #ef4444

function scoreColor(pct) {
  return pct >= 85 ? 'var(--ok)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';
}

function scoreRgb(pct) {
  if (pct >= 85) return PASS_G;
  if (pct >= 70) return [245, 158, 11];
  return FAIL_R;
}

export default function QCCheckForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [check, setCheck] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState({});
  const [photoPickerItem, setPhotoPickerItem] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const rollInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // Corrective actions — stored in check.notes
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [correctiveActionsEditing, setCorrectiveActionsEditing] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [editingComplete, setEditingComplete] = useState(false);
  const [openSections, setOpenSections] = useState(new Set());

  // Voice note state
  const [voiceState, setVoiceState] = useState('idle'); // 'idle' | 'recording' | 'done'
  const [transcript, setTranscript] = useState('');
  const [voiceAnalysing, setVoiceAnalysing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceResult, setVoiceResult] = useState(null); // { summary, fails, ambiguous }
  const [ambiguousChoices, setAmbiguousChoices] = useState({}); // { item_id: 'fail' | 'pass' }
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceDefaultUnmentioned, setVoiceDefaultUnmentioned] = useState('pass');
  const speechRef = useRef(null);
  const committedRef = useRef(''); // accumulated final transcript across all sessions
  const [recleanRequired, setRecleanRequired] = useState(null); // null | 0 | 1
  const [recleanMinutes, setRecleanMinutes] = useState('');

  const load = (overwriteItems = true) => {
    api.get(`/qc/checks/${id}`).then(r => {
      setCheck(r.data);
      // Always overwrite items if check is complete — prevents stale in-progress
      // items from a background tab from being treated as authoritative
      const shouldOverwrite = overwriteItems || r.data.status === 'complete';
      if (shouldOverwrite) setItems(r.data.items || []);
      // Don't overwrite notes while the user is actively typing or AI is writing
      setCorrectiveActionsEditing(editing => {
        if (!editing) setCorrectiveActions(r.data.notes || '');
        return editing;
      });
      if (r.data.reclean_required !== undefined && r.data.reclean_required !== null) setRecleanRequired(r.data.reclean_required);
      if (r.data.reclean_minutes !== undefined && r.data.reclean_minutes !== null) setRecleanMinutes(String(r.data.reclean_minutes));
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load(true);
    api.get('/scheduling/settings').then(r => {
      setVoiceDefaultUnmentioned(r.data.voice_default_unmentioned || 'pass');
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    return () => { speechRef.current?.stop(); };
  }, []);

  useLiveSync(() => load(false));

  const loadPhotos = () => {
    api.get(`/qc/checks/${id}/photos`).then(r => {
      const grouped = {};
      r.data.forEach(p => {
        const key = p.item_id != null ? String(p.item_id) : `cat_${p.category || 'general'}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
      });
      setPhotos(grouped);
    });
  };

  useEffect(() => { if (!loading) loadPhotos(); }, [loading]);

  const setScore = (itemId, score) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, score } : i));
  };

  const setNote = (itemId, notes) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
  };

  const setNA = (itemId, na) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, na, score: na ? null : i.score } : i));
  };

  const toggleSection = (cat) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const markSectionNA = (catItems, e) => {
    e.stopPropagation();
    const allNA = catItems.every(i => i.na);
    const newNA = !allNA;
    setItems(prev => prev.map(i =>
      catItems.some(ci => ci.id === i.id) ? { ...i, na: newNA, score: newNA ? null : i.score } : i
    ));
  };

  const compressImage = (file) => new Promise(resolve => {
    const MAX = 1400;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });

  const uploadPhoto = async (itemId, category, file) => {
    // Close picker and show preview immediately
    setPhotoPickerItem(null);
    const blobUrl = URL.createObjectURL(file);
    const tempId  = `temp_${Date.now()}`;
    const key     = String(itemId);
    setPhotos(prev => ({ ...prev, [key]: [...(prev[key] || []), { id: tempId, blobUrl, uploading: true }] }));
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('photo', compressed, file.name);
      fd.append('category', category || '');
      fd.append('item_id', key);
      const r = await api.post(`/qc/checks/${id}/photos`, fd);
      setPhotos(prev => ({
        ...prev,
        [key]: (prev[key] || []).map(p => p.id === tempId ? { id: r.data.id, filename: r.data.filename, blobUrl } : p),
      }));
    } catch {
      setPhotos(prev => ({ ...prev, [key]: (prev[key] || []).filter(p => p.id !== tempId) }));
      URL.revokeObjectURL(blobUrl);
      alert('Photo upload failed — please try again.');
    }
  };

  const deletePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return;
    await api.delete(`/qc/photos/${photoId}`);
    loadPhotos();
  };

  const liveScore = () => {
    let total = 0, max = 0;
    items.forEach(item => {
      if (item.na) return; // N/A items excluded from scoring
      const w = item.weight || 1;
      if (item.score_type === 'pass_fail') { total += (item.score || 0) * w; max += w; }
      else { total += (item.score || 0) * w; max += 5 * w; }
    });
    return max ? (total / max) * 100 : 0;
  };

  const deleteCheck = async () => {
    if (!confirm('Delete this QC check and all its results? This cannot be undone.')) return;
    await api.delete(`/qc/checks/${id}`);
    navigate('/qc');
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoiceState('done'); return; }

    committedRef.current = '';

    const attach = (recognition) => {
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-NZ';

      // baseText: everything committed before this session started.
      // sessionText: finals accumulated within this session.
      // sessionFinalCount: how many final results already processed (Chrome
      //   re-delivers all from index 0 on restart, so we skip already-seen ones).
      const baseText = committedRef.current;
      let sessionText = '';
      let sessionFinalCount = 0;

      recognition.onresult = e => {
        let interim = '';
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            if (i >= sessionFinalCount) {
              sessionText += e.results[i][0].transcript + ' ';
              sessionFinalCount = i + 1;
            }
          } else {
            interim += e.results[i][0].transcript;
          }
        }
        committedRef.current = baseText + sessionText;
        setTranscript((committedRef.current + interim).replace(/\s+/g, ' ').trimStart());
      };

      recognition.onerror = e => {
        if (e.error === 'not-allowed') {
          speechRef.current = null; // signal stop
          setVoiceError('Microphone access denied. Please allow microphone access in your browser settings.');
          setVoiceState('idle');
        }
        // no-speech / network / aborted — onend will restart or finish
      };

      recognition.onend = () => {
        // If stopRecording() or onerror already cleared the ref, don't restart
        if (speechRef.current === null) return;

        // Chrome Android stops after ~60s or a long pause — restart silently
        try {
          const next = new SpeechRecognition();
          speechRef.current = next;
          attach(next);
          next.start();
        } catch {
          setTranscript(committedRef.current.trim());
          setVoiceState('done');
        }
      };
    };

    const recognition = new SpeechRecognition();
    speechRef.current = recognition;
    attach(recognition);
    recognition.start();
    setVoiceState('recording');
    setVoiceError('');
  };

  const stopRecording = () => {
    const r = speechRef.current;
    speechRef.current = null; // onend checks this ref — null = don't restart
    const final = committedRef.current.trim();
    setTranscript(final);
    setVoiceState('done');
    try { r?.stop(); } catch { /* ignore */ }
  };

  const analyseVoice = async () => {
    if (voiceAnalysing || transcript.trim().length < 10) return;
    setVoiceAnalysing(true);
    setVoiceError('');
    try {
      const r = await api.post(`/qc/checks/${id}/voice-analyse`, { transcript });
      setVoiceResult({
        summary: r.data.summary || '',
        fails: r.data.fails || [],
        ambiguous: r.data.ambiguous || [],
      });
      const choices = {};
      (r.data.ambiguous || []).forEach(a => { choices[a.item_id] = 'pass'; });
      setAmbiguousChoices(choices);
      setShowVoiceModal(true);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Analysis failed — please try again.';
      setVoiceError(msg);
      setVoiceResult(null);
      setShowVoiceModal(false);
    } finally {
      setVoiceAnalysing(false);
    }
  };

  const applyVoiceScores = () => {
    const failIds = new Set([
      ...(voiceResult.fails || []).map(f => f.item_id),
      ...Object.entries(ambiguousChoices).filter(([, v]) => v === 'fail').map(([k]) => parseInt(k)),
    ]);

    setItems(prev => prev.map(item => {
      if (item.na) return item;
      if (failIds.has(item.id)) {
        return { ...item, score: item.score_type === 'pass_fail' ? 0 : 1 };
      }
      if (voiceDefaultUnmentioned === 'pass') {
        return { ...item, score: item.score_type === 'pass_fail' ? 1 : 5 };
      }
      return item;
    }));

    setShowVoiceModal(false);
    setVoiceResult(null);
  };

  const save = async (complete = false) => {
    setSaving(true);
    // Never overwrite items on a completed check unless explicitly editing it
    const sendItems = complete || check.status !== 'complete' || editingComplete;
    const payload = { ...(sendItems ? { items } : {}), notes: correctiveActions };
    if (recleanRequired !== null) {
      payload.reclean_required = recleanRequired;
      payload.reclean_minutes = recleanRequired === 1 && recleanMinutes ? parseInt(recleanMinutes) : null;
    }
    if (complete) { payload.status = 'complete'; payload.signed_off_by = manager.name; }
    await api.put(`/qc/checks/${id}`, payload);
    if (complete) navigate('/qc');
    else {
      const r = await api.get(`/qc/checks/${id}`);
      setCheck(r.data); setItems(r.data.items || []);
      setCorrectiveActions(r.data.notes || '');
    }
    setSaving(false);
  };

  const exportPDF = async () => {
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210;
      const pct = Math.round(check.score_pct || liveScore());
      const today = new Date().toISOString().slice(0, 10);

      // ── HEADER ────────────────────────────────────────────────────────────────
      doc.setFillColor(8, 8, 12);
      doc.rect(0, 0, W, 40, 'F');
      doc.setFillColor(58, 181, 217);
      doc.rect(0, 38, W, 2, 'F');

      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Team Member Quality Control Report', 14, 18);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(58, 181, 217);
      doc.text('Quality Control Inspection Report', 14, 26);
      doc.setFontSize(8);
      doc.setTextColor(160, 190, 200);
      doc.text(`Generated: ${fmtDate(today)}`, W - 14, 12, { align: 'right' });

      // Score badge
      const [sr, sg, sb] = pct >= 85 ? [34, 197, 94] : pct >= 70 ? [245, 158, 11] : [239, 68, 68];
      doc.setFillColor(sr, sg, sb);
      doc.roundedRect(W - 46, 8, 32, 22, 3, 3, 'F');
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${pct}%`, W - 30, 22, { align: 'center' });

      // ── INFO ──────────────────────────────────────────────────────────────────
      let y = 50;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80, 80, 80);
      const info = [
        ['Property', check.property_name || '—'],
        ['Staff Member', check.staff_name || 'N/A'],
        ['Date', fmtDate(check.date)],
        ['Check Type', check.check_type === 'property' ? 'Property Health Check' : 'Team QC Check'],
        ['Checklist', check.checklist_name || '—'],
        ['Assigned To', check.assigned_to_name || '—'],
        ['Signed Off By', check.signed_off_by || '—'],
      ];
      info.forEach(([label, value], i2) => {
        const x = i2 % 2 === 0 ? 14 : 110;
        if (i2 % 2 === 0 && i2 > 0) y += 10;
        doc.setFont(undefined, 'bold');
        doc.setTextColor(58, 181, 217);
        doc.text(label + ':', x, y);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(String(value).substring(0, 35), x + 30, y);
      });
      y += 14;

      // Divider
      doc.setDrawColor(58, 181, 217);
      doc.setLineWidth(0.4);
      doc.line(14, y, W - 14, y);
      y += 8;

      // ── CHECKLIST TABLE ────────────────────────────────────────────────────────
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(58, 181, 217);
      doc.text('Checklist Results', 14, y);
      y += 4;

      const tableBody = items.map((item, i2) => {
        const isPF = (item.score_type || 'pass_fail') === 'pass_fail';
        const score = item.score ?? 0;
        const scoreLabel = item.na ? 'N/A' : isPF ? (score === 1 ? 'PASS' : 'FAIL') : (score > 0 ? `${score}/5` : '—');
        return [
          String(i2 + 1),
          String(item.category || '—'),
          String(item.text || ''),
          scoreLabel,
          String(item.weight ?? 1) + (isPF ? '' : '×'),
          String(item.notes || ''),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['#', 'Category', 'Checklist Item', 'Result', 'Wt', 'Notes']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [8, 8, 12], textColor: [58, 181, 217], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 28 },
          2: { cellWidth: 72 },
          3: { cellWidth: 16, halign: 'center' },
          4: { cellWidth: 10, halign: 'center' },
          5: { cellWidth: 'auto' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const val = String(data.cell.raw);
            if (val === 'FAIL') { data.cell.styles.textColor = [220, 50, 50]; data.cell.styles.fontStyle = 'bold'; }
            if (val === 'PASS') { data.cell.styles.textColor = [30, 160, 80]; data.cell.styles.fontStyle = 'bold'; }
            if (val === 'N/A') { data.cell.styles.textColor = [150, 150, 150]; data.cell.styles.fontStyle = 'italic'; }
          }
        },
      });

      y = doc.lastAutoTable.finalY + 10;

      // ── CORRECTIVE ACTIONS ────────────────────────────────────────────────────
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(58, 181, 217);
      doc.text('Corrective Actions', 14, y);
      y += 6;
      const caText = (check.notes || '').trim() || 'No corrective actions recorded.';
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(30, 30, 30);
      const caLines = doc.splitTextToSize(caText, W - 28);
      doc.text(caLines, 14, y);
      y += caLines.length * 5 + 8;

      // ── PHOTOS ────────────────────────────────────────────────────────────────
      const allPhotos = Object.values(photos).flat();
      if (allPhotos.length > 0) {
        // Fetch all photos as base64, skip any that fail
        const toBase64 = (url) => fetch(url)
          .then(r => r.blob())
          .then(blob => new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }))
          .catch(() => null);

        const photoData = await Promise.all(
          allPhotos.map(p => toBase64(`/uploads/${p.filename}`).then(b64 => ({ ...p, b64 })))
        );
        const loaded = photoData.filter(p => p.b64);

        if (loaded.length > 0) {
          if (y > 230) { doc.addPage(); y = 20; }
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(58, 181, 217);
          doc.text('Photos', 14, y);
          y += 6;

          const imgW = 56;
          const imgH = 42;
          const cols = 3;
          const gapX = 4;
          const gapY = 6;

          loaded.forEach((photo, idx) => {
            const col = idx % cols;
            const x = 14 + col * (imgW + gapX);
            if (col === 0 && idx > 0) y += imgH + gapY + 8;
            if (y + imgH > 275) { doc.addPage(); y = 20; }
            try {
              doc.addImage(photo.b64, 'JPEG', x, y, imgW, imgH);
              // Item label under photo
              const label = photo.original_name || '';
              if (label) {
                doc.setFontSize(6);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(80, 80, 80);
                doc.text(String(label).substring(0, 28), x, y + imgH + 3);
              }
            } catch (_) { /* skip broken image */ }
          });
          y += imgH + gapY + 10;
        }
      }

      // ── SIGN-OFF ──────────────────────────────────────────────────────────────
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setDrawColor(58, 181, 217);
      doc.setLineWidth(0.4);
      doc.line(14, y, W - 14, y);
      y += 6;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(58, 181, 217);
      doc.text('Sign-off', 14, y);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`${check.signed_off_by || '—'}  |  ${fmtDate(check.date)}  |  ${check.assigned_to_name || '—'}`, 14, y + 5);

      const safeName = (check.property_name || 'Property').replace(/[^a-zA-Z0-9]/g, '-');
      doc.save(`QC-Report-${safeName}-${check.date}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed: ' + err.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!check) return <div className="page"><p>Check not found.</p></div>;

  const isLocked = check.status === 'complete' && !editingComplete;
  const pct = check.status === 'complete' && !editingComplete ? check.score_pct : liveScore();

  const categories = {};
  items.forEach(item => {
    const cat = item.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  });

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/qc')}>← Back</button>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{check.checklist_name}</h1>
        <p style={{ color: 'var(--t2)' }}>
          {check.property_name}{check.check_type !== 'property' && check.staff_name ? ` · ${check.staff_name}` : ''} · {fmtDate(check.date)}
          {check.assigned_to_name && <> · Assigned to: <strong style={{ color: 'var(--t1)' }}>{check.assigned_to_name}</strong></>}
        </p>
      </div>

      {/* Voice Note Card */}
      {(check.status !== 'complete' || editingComplete) && (
        <div className="card mb-4" style={{ padding: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Voice Note</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
            Walk through the property and describe any issues aloud. AI will fill in the checklist for you.
          </div>

          {voiceError && (
            <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{voiceError}</div>
          )}

          {voiceState === 'idle' && (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ fontSize: 18 }}>🎙️</span> Record Voice Note
            </button>
          )}

          {voiceState === 'recording' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%', background: 'var(--red)',
                  animation: 'pulse 1s infinite',
                  display: 'inline-block',
                }} />
                <span style={{ fontWeight: 700, color: 'var(--red)', fontSize: 14 }}>Recording...</span>
              </div>
              {transcript && (
                <div style={{
                  fontSize: 13, color: 'var(--t2)', background: 'var(--navy2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 12, minHeight: 60, lineHeight: 1.6,
                }}>
                  {transcript}
                </div>
              )}
              <button className="btn btn-danger" onClick={stopRecording}>⏹ Stop</button>
            </div>
          )}

          {voiceState === 'done' && (
            <div>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={4}
                style={{
                  width: '100%', fontSize: 13, color: 'var(--t1)', background: 'var(--navy2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 12, lineHeight: 1.6, resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                placeholder="Your transcript appears here. You can also type observations manually."
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={analyseVoice}
                  disabled={voiceAnalysing || transcript.trim().length < 10}
                >
                  {voiceAnalysing ? 'Analysing...' : '✨ Analyse with AI'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setVoiceState('idle'); setTranscript(''); setVoiceError(''); }}
                >
                  Re-record
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card mb-6" style={{ padding: '16px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>Overall Score</span>
          <span style={{ fontWeight: 800, fontSize: 24, color: scoreColor(pct) }}>{Math.round(pct)}%</span>
        </div>
        <div className="score-bar">
          <div className={`score-fill ${pct >= 85 ? 'green' : pct >= 70 ? 'amber' : 'red'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {check.status === 'complete' && (
            <span style={{ color: 'var(--ok)', fontSize: 13 }}>✓ Signed off by {check.signed_off_by}</span>
          )}
          <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
            {check.status === 'complete' && !editingComplete && (
              <button className="btn btn-sm btn-secondary" onClick={() => setEditingComplete(true)}>✏️ Edit Check</button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={exportPDF}>📄 Export PDF</button>
          </div>
        </div>
      </div>

      <div className="card mb-4" style={{ padding: 0, overflow: 'hidden' }}>
        {Object.entries(categories).map(([cat, catItems], sectionIdx, arr) => {
          const isOpen = openSections.has(cat);
          const allNA = catItems.every(i => i.na);
          const activeItems = catItems.filter(i => !i.na);
          const scoredCount = activeItems.filter(i => i.score !== null && i.score !== undefined).length;
          const isLast = sectionIdx === arr.length - 1;
          return (
            <div key={cat}>
              {/* Section header row */}
              <div
                onClick={() => toggleSection(cat)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', cursor: 'pointer', userSelect: 'none',
                  borderBottom: isLast && !isOpen ? 'none' : '1px solid var(--border)',
                  background: isOpen ? 'var(--hover)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--hover)'; }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontWeight: 700, fontSize: 15 }}>{cat}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {allNA
                    ? <span style={{ fontSize: 13, color: 'var(--t3)', fontStyle: 'italic' }}>N/A</span>
                    : <span style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600 }}>{scoredCount} of {activeItems.length}</span>
                  }
                  <span style={{
                    color: 'var(--t3)', fontSize: 12, fontWeight: 700,
                    display: 'inline-block', transition: 'transform 0.2s',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}>▶</span>
                </div>
              </div>

              {/* Expanded items */}
              {isOpen && (
                <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                  {/* N/A section button */}
                  {!isLocked && (
                    <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <button
                        onClick={e => markSectionNA(catItems, e)}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: allNA ? 'var(--border)' : 'transparent',
                          color: allNA ? 'var(--t2)' : 'var(--t3)',
                          cursor: 'pointer',
                        }}
                      >{allNA ? '↩ Undo N/A for section' : 'Mark entire section N/A'}</button>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {catItems.map((item, itemIdx) => {
                      const itemPhotos = photos[String(item.id)] || [];
                      const isPickerOpen = photoPickerItem === item.id;
                      const isLastItem = itemIdx === catItems.length - 1;
                      return (
                        <div key={item.id} style={{
                          padding: '16px 20px',
                          borderBottom: isLastItem ? 'none' : '1px solid var(--border)',
                          opacity: item.na ? 0.45 : 1,
                          background: item.na ? 'var(--bg)' : 'transparent',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.text}</div>
                          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
                            {item.score_type === 'pass_fail' ? 'Pass / Fail' : 'Score 1–5'} · Weight: {item.weight}×
                            {item.na && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>— Not applicable</span>}
                          </div>

                          {item.score_type === 'pass_fail' ? (
                            <div className="pass-fail-btns">
                              <button className={`pf-btn pass${item.score === 1 ? ' active' : ''}`} disabled={isLocked} onClick={() => setScore(item.id, 1)}>✓ Pass</button>
                              <button className={`pf-btn fail${item.score === 0 && item.score !== null && item.score !== undefined ? ' active' : ''}`} disabled={isLocked} onClick={() => setScore(item.id, 0)}>✕ Fail</button>
                              <button
                                disabled={isLocked}
                                onClick={() => setNA(item.id, !item.na)}
                                style={{
                                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                  border: '1px solid var(--border)', cursor: isLocked ? 'default' : 'pointer',
                                  background: item.na ? 'var(--border)' : 'transparent',
                                  color: item.na ? 'var(--t2)' : 'var(--t3)',
                                }}
                              >N/A</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <div className="score-buttons">
                                {[1, 2, 3, 4, 5].map(n => (
                                  <button key={n} className={`score-btn${item.score === n ? ' active' : ''}`} disabled={isLocked} onClick={() => setScore(item.id, n)}>{n}</button>
                                ))}
                              </div>
                              <button
                                disabled={isLocked}
                                onClick={() => setNA(item.id, !item.na)}
                                style={{
                                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                  border: '1px solid var(--border)', cursor: isLocked ? 'default' : 'pointer',
                                  background: item.na ? 'var(--border)' : 'transparent',
                                  color: item.na ? 'var(--t2)' : 'var(--t3)',
                                }}
                              >N/A</button>
                            </div>
                          )}

                          {!isLocked ? (
                            <input className="form-input" style={{ marginTop: 10 }} placeholder="Notes (optional)…" value={item.notes || ''} onChange={e => setNote(item.id, e.target.value)} />
                          ) : (
                            item.notes && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>{item.notes}</div>
                          )}

                          {/* Photos */}
                          <div style={{ marginTop: 10 }}>
                            {itemPhotos.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                {itemPhotos.map(photo => (
                                  <div key={photo.id} style={{ position: 'relative' }}>
                                    <img
                                      src={photo.blobUrl || `/uploads/${photo.filename}`}
                                      alt={photo.original_name}
                                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--glass-border)', cursor: photo.uploading ? 'default' : 'pointer', opacity: photo.uploading ? 0.5 : 1 }}
                                      onClick={() => { if (!photo.uploading) setViewingPhoto(photo.blobUrl || `/uploads/${photo.filename}`); }}
                                    />
                                    {photo.uploading
                                      ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}><span className="spinner" /></div>
                                      : <button onClick={() => deletePhoto(photo.id)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
                                    }
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => setPhotoPickerItem(isPickerOpen ? null : item.id)}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 12, border: '2px dashed var(--border)', background: 'var(--card)', cursor: 'pointer', gap: 3, color: 'var(--cyan)', padding: 0 }}
                              title="Add photo"
                            >
                              <span style={{ fontSize: 20, lineHeight: 1 }}>📷</span>
                              <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1 }}>Add</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Corrective Actions */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Corrective Actions</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isLocked && (
              <button
                className="btn btn-sm"
                disabled={aiSummaryLoading}
                onClick={async () => {
                  setAiSummaryLoading(true);
                  setCorrectiveActionsEditing(true);
                  try {
                    const r = await api.post(`/qc/checks/${id}/ai-summary`);
                    const summary = r.data.summary;
                    setCorrectiveActions(summary);
                    // Save immediately so it persists and live sync can't wipe it
                    await api.put(`/qc/checks/${id}`, { notes: summary });
                  } catch (e) {
                    alert(e.response?.data?.error || 'AI summary failed');
                  } finally {
                    setAiSummaryLoading(false);
                    setCorrectiveActionsEditing(false);
                  }
                }}
                style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {aiSummaryLoading ? <><span className="spinner" style={{ width: 12, height: 12, borderColor: '#8b5cf6', borderTopColor: 'transparent' }} /> Writing…</> : '✦ Write AI Summary'}
              </button>
            )}
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Appears on PDF report</span>
          </div>
        </div>
        {!isLocked ? (
          <textarea
            className="form-input"
            style={{ minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Describe any corrective actions required, follow-up tasks, or notes for this inspection…"
            value={correctiveActions}
            onFocus={() => setCorrectiveActionsEditing(true)}
            onBlur={() => setCorrectiveActionsEditing(false)}
            onChange={e => setCorrectiveActions(e.target.value)}
          />
        ) : (
          <div style={{ fontSize: 14, color: correctiveActions ? 'var(--t1)' : 'var(--t3)', fontStyle: correctiveActions ? 'normal' : 'italic', lineHeight: 1.6 }}>
            {correctiveActions || 'No corrective actions recorded.'}
          </div>
        )}
      </div>

      {/* Re-cleaning section — only shown when not locked or when editing a complete check */}
      {(!isLocked || editingComplete) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Re-cleaning Required?</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
            Did this property need a re-clean after the inspection?
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: recleanRequired === 1 ? 16 : 0 }}>
            {[{ label: 'Yes', val: 1 }, { label: 'No', val: 0 }].map(({ label, val }) => (
              <button
                key={val}
                onClick={() => { setRecleanRequired(val); if (val === 0) setRecleanMinutes(''); }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  border: `2px solid ${recleanRequired === val ? (val === 1 ? 'var(--red)' : 'var(--ok)') : 'var(--border)'}`,
                  background: recleanRequired === val ? (val === 1 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)') : 'transparent',
                  color: recleanRequired === val ? (val === 1 ? 'var(--red)' : 'var(--ok)') : 'var(--t2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {recleanRequired === 1 && (
            <div>
              <label className="form-label">Time spent re-cleaning (minutes)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                placeholder="e.g. 30"
                value={recleanMinutes}
                onChange={e => setRecleanMinutes(e.target.value)}
                style={{ maxWidth: 180 }}
              />
            </div>
          )}
        </div>
      )}

      {/* Show saved reclean info on locked checks */}
      {isLocked && check.reclean_required !== null && check.reclean_required !== undefined && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Re-cleaning</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{
              fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
              color: check.reclean_required ? 'var(--red)' : 'var(--ok)',
              background: check.reclean_required ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            }}>
              {check.reclean_required ? 'Re-clean required' : 'No re-clean needed'}
            </span>
            {check.reclean_required === 1 && check.reclean_minutes && (
              <span style={{ fontSize: 13, color: 'var(--t2)' }}>{check.reclean_minutes} min spent</span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-4" style={{ justifyContent: 'space-between' }}>
        <div className="flex gap-3">
          {check.status !== 'complete' && (
            <>
              <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving}>Save Progress</button>
              <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : '✓ Sign Off & Complete'}
              </button>
            </>
          )}
          {editingComplete && (
            <>
              <button className="btn btn-primary" onClick={() => save(false)} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving…</> : '💾 Save Changes'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setEditingComplete(false); load(true); }} disabled={saving}>Cancel</button>
            </>
          )}
        </div>
        <button className="btn btn-danger btn-sm" onClick={deleteCheck}>🗑 Delete Check</button>
      </div>

      {/* Voice Analysis Confirmation Modal */}
      {showVoiceModal && voiceResult && (
        <div className="modal-overlay" onClick={() => setShowVoiceModal(false)}>
          <div className="modal" style={{ maxWidth: 580, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">AI Checklist Analysis</div>

            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 20 }}>
              {voiceResult.summary}
            </p>

            {voiceResult.fails.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 10 }}>
                  Will Fail ({voiceResult.fails.length} item{voiceResult.fails.length !== 1 ? 's' : ''})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {voiceResult.fails.map(f => {
                    const item = items.find(i => i.id === f.item_id);
                    if (!item) return null;
                    return (
                      <div key={f.item_id} style={{
                        padding: '8px 12px', borderRadius: 8,
                        border: '1px solid rgba(239,68,68,0.3)',
                        background: 'rgba(239,68,68,0.07)',
                        borderLeft: '3px solid var(--red)',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {item.room_label || item.category} — {item.text}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{f.reason}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {voiceResult.ambiguous.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 10 }}>
                  Needs Your Input ({voiceResult.ambiguous.length} item{voiceResult.ambiguous.length !== 1 ? 's' : ''})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {voiceResult.ambiguous.map(a => {
                    const item = items.find(i => i.id === a.item_id);
                    if (!item) return null;
                    const choice = ambiguousChoices[a.item_id] || 'pass';
                    return (
                      <div key={a.item_id} style={{
                        padding: '8px 12px', borderRadius: 8,
                        border: '1px solid rgba(245,158,11,0.3)',
                        background: 'rgba(245,158,11,0.07)',
                        borderLeft: '3px solid var(--amber)',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                          {item.room_label || item.category} — {item.text}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>{a.note}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setAmbiguousChoices(c => ({ ...c, [a.item_id]: 'fail' }))}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                              border: '1px solid var(--red)',
                              background: choice === 'fail' ? 'var(--red)' : 'transparent',
                              color: choice === 'fail' ? '#fff' : 'var(--red)',
                            }}
                          >Mark as Fail</button>
                          <button
                            onClick={() => setAmbiguousChoices(c => ({ ...c, [a.item_id]: 'pass' }))}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                              border: '1px solid var(--border)',
                              background: choice === 'pass' ? 'var(--border)' : 'transparent',
                              color: 'var(--t2)',
                            }}
                          >Leave as Pass</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {voiceResult.fails.length === 0 && voiceResult.ambiguous.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--green)', marginBottom: 20 }}>
                ✓ No issues found in the transcript — all items will be marked as passed.
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={applyVoiceScores}>
                Confirm & Apply
              </button>
              <button className="btn btn-ghost" onClick={() => setShowVoiceModal(false)}>
                Edit Manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo picker modal */}
      {photoPickerItem !== null && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.6)' }} onClick={() => setPhotoPickerItem(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 200, background: 'var(--card)', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', width: 'min(320px, 90vw)', padding: '28px 24px 20px', textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Add Photo</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>Choose a source</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '20px 12px', borderRadius: 14, border: '2px solid var(--cyan)', background: 'var(--cyan-dim)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'var(--cyan)' }}>
                <span style={{ fontSize: 32, lineHeight: 1 }}>📸</span>
                Camera
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) { const it = items.find(i => i.id === photoPickerItem); uploadPhoto(photoPickerItem, it?.category, e.target.files[0]); e.target.value = ''; } }} />
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '20px 12px', borderRadius: 14, border: '2px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: 'var(--t1)' }}>
                <span style={{ fontSize: 32, lineHeight: 1 }}>🖼️</span>
                Gallery
                <input ref={rollInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => { const it = items.find(i => i.id === photoPickerItem); Array.from(e.target.files).forEach(f => uploadPhoto(photoPickerItem, it?.category, f)); e.target.value = ''; }} />
              </label>
            </div>
            <button onClick={() => setPhotoPickerItem(null)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'transparent', fontSize: 15, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </>
      )}
    </div>

      {/* ── Photo fullscreen viewer ─────────────────────────────────────────── */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <div style={{ width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setViewingPhoto(null)} style={{ color: '#fff' }}>✕ Close</button>
          </div>
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px 16px' }}>
            <img
              src={viewingPhoto}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
            />
          </div>
        </div>
      )}
  );
}
