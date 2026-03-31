import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { fmtDate } from '../utils';
import logoUrl from '../assets/logo.png';
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
  const rollInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // Corrective actions — stored in check.notes
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [editingComplete, setEditingComplete] = useState(false);
  const [openSections, setOpenSections] = useState(new Set());

  const load = (overwriteItems = true) => {
    api.get(`/qc/checks/${id}`).then(r => {
      setCheck(r.data);
      if (overwriteItems) setItems(r.data.items || []);
      setCorrectiveActions(r.data.notes || '');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(true); }, [id]);
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

  const save = async (complete = false) => {
    setSaving(true);
    const payload = { items, notes: correctiveActions };
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

      // Fetch logo
      let logoB64 = null;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(logoUrl, { signal: controller.signal });
        clearTimeout(t);
        const blob = await resp.blob();
        logoB64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (_) {}

      // ── HEADER ────────────────────────────────────────────────────────────────
      doc.setFillColor(8, 8, 12);
      doc.rect(0, 0, W, 40, 'F');
      doc.setFillColor(58, 181, 217);
      doc.rect(0, 38, W, 2, 'F');

      if (logoB64) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(8, 5, 30, 30, 2, 2, 'F');
        doc.addImage(logoB64, 'JPEG', 8, 5, 30, 30);
      }

      const textX = logoB64 ? 44 : 14;
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('LCA Cleaning Services', textX, 18);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(58, 181, 217);
      doc.text('Quality Control Inspection Report', textX, 26);
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
      doc.save(`LCA-QC-${safeName}-${check.date}.pdf`);
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
                                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: photo.uploading ? 'default' : 'pointer', opacity: photo.uploading ? 0.5 : 1 }}
                                      onClick={() => { if (!photo.uploading) window.open(`/uploads/${photo.filename}`, '_blank'); }}
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
                  try {
                    const r = await api.post(`/qc/checks/${id}/ai-summary`);
                    setCorrectiveActions(r.data.summary);
                  } catch (e) {
                    alert(e.response?.data?.error || 'AI summary failed');
                  } finally {
                    setAiSummaryLoading(false);
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
            onChange={e => setCorrectiveActions(e.target.value)}
          />
        ) : (
          <div style={{ fontSize: 14, color: correctiveActions ? 'var(--t1)' : 'var(--t3)', fontStyle: correctiveActions ? 'normal' : 'italic', lineHeight: 1.6 }}>
            {correctiveActions || 'No corrective actions recorded.'}
          </div>
        )}
      </div>

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
                <input ref={rollInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) { const it = items.find(i => i.id === photoPickerItem); uploadPhoto(photoPickerItem, it?.category, e.target.files[0]); e.target.value = ''; } }} />
              </label>
            </div>
            <button onClick={() => setPhotoPickerItem(null)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', fontSize: 15, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
