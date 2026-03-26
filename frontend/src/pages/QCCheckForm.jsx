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
  const rollInputRefs = useRef({});
  const cameraInputRefs = useRef({});
  // Corrective actions — stored in check.notes
  const [correctiveActions, setCorrectiveActions] = useState('');

  const load = () => {
    api.get(`/qc/checks/${id}`).then(r => {
      setCheck(r.data);
      setItems(r.data.items || []);
      setCorrectiveActions(r.data.notes || '');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);
  useLiveSync(load);

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

  const uploadPhoto = async (itemId, category, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('category', category || '');
    fd.append('item_id', String(itemId));
    await api.post(`/qc/checks/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    loadPhotos();
    setPhotoPickerItem(null);
  };

  const deletePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return;
    await api.delete(`/qc/photos/${photoId}`);
    loadPhotos();
  };

  const liveScore = () => {
    let total = 0, max = 0;
    items.forEach(item => {
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
    const H = 297;
    const pct = Math.round(check.score_pct || liveScore());
    const today = new Date().toISOString().slice(0, 10);
    const failedItems = items.filter(i =>
      (i.score_type === 'pass_fail' && i.score === 0) ||
      (i.score_type === '1_to_5' && i.score <= 2)
    );

    // Helper: fill full dark background on the current page
    const fillPageBg = () => {
      doc.setFillColor(13, 13, 20);
      doc.rect(0, 0, W, H, 'F');
    };

    // Helper: draw header band on current page
    const drawHeader = () => {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, W, 52, 'F');
      doc.setFillColor(...CYAN_PDF);
      doc.rect(0, 50, W, 3, 'F');
    };

    // Fetch logo as base64 (with timeout so it never blocks PDF generation)
    let logoB64 = null;
    try {
      const controller = new AbortController();
      const logoTimeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(logoUrl, { signal: controller.signal });
      clearTimeout(logoTimeout);
      const blob = await resp.blob();
      logoB64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (_) { /* logo optional — PDF still generates without it */ }

    // Page 1 background + header
    fillPageBg();
    drawHeader();

    // Logo image (white bg so place inside a white rounded rect in the header)
    if (logoB64) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(8, 7, 38, 38, 3, 3, 'F');
      doc.addImage(logoB64, 'JPEG', 8, 7, 38, 38);
    }

    // Company name & subtitle — offset right of logo
    const textX = logoB64 ? 52 : 14;
    doc.setTextColor(...WHITE);
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('LCA Cleaning Services', textX, 22);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...CYAN_PDF);
    doc.text('Quality Control Inspection Report', textX, 30);

    // Report date (top-right)
    doc.setFontSize(8);
    doc.setTextColor(160, 190, 200);
    doc.text(`Generated: ${fmtDate(today)}`, W - 14, 14, { align: 'right' });

    // ── SCORE BADGE (right side of header) ────────────────────────────────────
    const badgeX = W - 30;
    const badgeY = 28;
    const scoreRgbVal = scoreRgb(pct);
    doc.setFillColor(...scoreRgbVal);
    doc.roundedRect(badgeX - 18, badgeY - 12, 36, 18, 4, 4, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(`${pct}%`, badgeX, badgeY - 1, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.text('OVERALL SCORE', badgeX, badgeY + 5, { align: 'center' });

    // ── INFO GRID ──────────────────────────────────────────────────────────────
    let y = 62;
    const col1 = 14, col2 = 75, col3 = 120, col4 = 165;

    const infoBox = (label, value, x, yy, w2 = 52) => {
      doc.setFillColor(...NAVY_MID);
      doc.roundedRect(x, yy, w2, 14, 2, 2, 'F');
      doc.setDrawColor(...CYAN_PDF);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, yy, w2, 14, 2, 2, 'S');
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...GREY_TEXT);
      doc.text(label.toUpperCase(), x + 3, yy + 5);
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...WHITE);
      doc.text(String(value || '—').substring(0, 26), x + 3, yy + 11);
    };

    infoBox('Property', check.property_name, col1, y, 52);
    infoBox('Staff Member', check.staff_name || 'N/A', col2, y, 42);
    infoBox('Date', fmtDate(check.date), col3, y, 35);
    infoBox('Check Type', check.check_type === 'property' ? 'Property' : 'Staff', col4, y, 32);

    y += 18;
    infoBox('Checklist', check.checklist_name, col1, y, 52);
    infoBox('Assigned To', check.assigned_to_name, col2, y, 42);
    infoBox('Signed Off By', check.signed_off_by || 'Pending', col3, y, 35);

    // Score bar
    const barX = col4, barY = y, barW = 32, barH = 14;
    doc.setFillColor(...NAVY_MID);
    doc.setDrawColor(...CYAN_PDF);
    doc.setLineWidth(0.2);
    doc.roundedRect(barX, barY, barW, barH, 2, 2, 'FD');
    const fillW = Math.round((pct / 100) * (barW - 4));
    doc.setFillColor(...scoreRgb(pct));
    doc.roundedRect(barX + 2, barY + 4, fillW, 6, 1, 1, 'F');
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...CYAN_PDF);
    doc.text('SCORE', barX + 3, barY + 5);

    y += 22;

    // ── SUMMARY STATS ─────────────────────────────────────────────────────────
    const totalItems  = items.length;
    const passCount   = items.filter(i => i.score_type === 'pass_fail' && i.score === 1).length;
    const failCount   = items.filter(i => i.score_type === 'pass_fail' && i.score === 0).length;
    const avgRating   = items.filter(i => i.score_type === '1_to_5' && i.score > 0);
    const avgRatingVal = avgRating.length
      ? (avgRating.reduce((s, i) => s + i.score, 0) / avgRating.length).toFixed(1)
      : '—';

    const statBoxW = 42;
    const stats = [
      { label: 'Total Items', value: totalItems, color: NAVY },
      { label: 'Pass', value: passCount, color: PASS_G },
      { label: 'Fail', value: failCount, color: failCount > 0 ? FAIL_R : GREY_TEXT },
      { label: 'Avg Rating', value: avgRatingVal !== '—' ? `${avgRatingVal}/5` : '—', color: NAVY_MID },
    ];
    stats.forEach((s, i2) => {
      const sx = 14 + i2 * (statBoxW + 4);
      doc.setFillColor(...NAVY);
      doc.roundedRect(sx, y, statBoxW, 16, 3, 3, 'F');
      doc.setTextColor(...CYAN_PDF);
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(String(s.value), sx + statBoxW / 2, y + 10, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(160, 190, 180);
      doc.text(s.label.toUpperCase(), sx + statBoxW / 2, y + 14.5, { align: 'center' });
    });

    y += 22;

    // ── CHECKLIST TABLE ────────────────────────────────────────────────────────
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...CYAN_PDF);
    doc.text('Checklist Results', 14, y);
    y += 4;

    const tableBody = items.map((item, i2) => {
      const isPF = item.score_type === 'pass_fail';
      const scoreLabel = isPF
        ? (item.score === 1 ? 'PASS' : 'FAIL')
        : (item.score > 0 ? `${item.score}/5` : '—');
      const isFail = (isPF && item.score === 0) || (!isPF && item.score > 0 && item.score <= 2);
      return [
        { content: String(i2 + 1), styles: { halign: 'center', fontStyle: 'normal' } },
        item.category || '—',
        item.text,
        { content: scoreLabel, styles: {
          halign: 'center',
          fontStyle: 'bold',
          textColor: isFail ? FAIL_R : PASS_G,
        }},
        { content: String(item.weight) + '×', styles: { halign: 'center' } },
        item.notes || '',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['#', 'Category', 'Checklist Item', 'Result', 'Wt', 'Notes']],
      body: tableBody,
      theme: 'plain',
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        textColor: WHITE,
        fillColor: NAVY_MID,
        lineColor: [40, 44, 60],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: NAVY,
        textColor: CYAN_PDF,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [24, 24, 36] },
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 72 },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 10, halign: 'center' },
        5: { cellWidth: 'auto' },
      },
      didDrawPage: () => {
        // Redraw dark bg on every new page autoTable creates
        const pg = doc.internal.getCurrentPageInfo().pageNumber;
        if (pg > 1) { fillPageBg(); }
      },
      didDrawCell: (data) => {
        // Red left border for fail rows
        if (data.section === 'body') {
          const row = tableBody[data.row.index];
          const resultCell = row[3];
          if (typeof resultCell === 'object' && String(resultCell.content).includes('FAIL')) {
            doc.setFillColor(...FAIL_R);
            doc.rect(data.cell.x, data.cell.y, 1.5, data.cell.height, 'F');
          }
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // ── FAILED ITEMS HIGHLIGHT ─────────────────────────────────────────────────
    if (failedItems.length > 0) {
      if (y > 240) { doc.addPage(); fillPageBg(); y = 20; }

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...FAIL_R);
      doc.text('Items Requiring Attention', 14, y);
      y += 5;

      failedItems.forEach(item => {
        if (y > 270) { doc.addPage(); fillPageBg(); y = 20; }
        doc.setFillColor(60, 10, 10);
        doc.setDrawColor(...FAIL_R);
        const textLines = doc.splitTextToSize(item.text, 140);
        const boxH = Math.max(10, textLines.length * 5 + 6);
        doc.roundedRect(14, y, W - 28, boxH, 2, 2, 'FD');
        doc.setFillColor(...FAIL_R);
        doc.rect(14, y, 3, boxH, 'F');
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...FAIL_R);
        doc.text(textLines, 20, y + 5);
        if (item.notes) {
          doc.setFont(undefined, 'italic');
          doc.setTextColor(...GREY_TEXT);
          const noteLines = doc.splitTextToSize(`Note: ${item.notes}`, 135);
          doc.text(noteLines, 20, y + 5 + textLines.length * 5);
          y += boxH + 3 + noteLines.length * 4;
        } else {
          y += boxH + 3;
        }
      });

      y += 4;
    }

    // ── CORRECTIVE ACTIONS ─────────────────────────────────────────────────────
    if (y > 230) { doc.addPage(); fillPageBg(); y = 20; }

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...CYAN_PDF);
    doc.text('Corrective Actions', 14, y);
    y += 5;

    const caText = check.notes && check.notes.trim()
      ? check.notes.trim()
      : 'No corrective actions recorded.';
    const caLines = doc.splitTextToSize(caText, W - 32);
    const caBoxH = Math.max(22, caLines.length * 5 + 10);

    doc.setFillColor(...NAVY_MID);
    doc.setDrawColor(...CYAN_PDF);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, W - 28, caBoxH, 3, 3, 'FD');
    doc.setFillColor(...CYAN_PDF);
    doc.rect(14, y, 3, caBoxH, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...WHITE);
    doc.text(caLines, 20, y + 7);
    y += caBoxH + 10;

    // ── SIGN-OFF SECTION ───────────────────────────────────────────────────────
    if (y > 250) { doc.addPage(); fillPageBg(); y = 20; }

    doc.setDrawColor(...CYAN_PDF);
    doc.setLineWidth(0.4);
    doc.line(14, y, W - 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...CYAN_PDF);
    doc.text('Sign-off', 14, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...GREY_TEXT);
    doc.text(`Completed by: ${check.signed_off_by || '—'}  |  Date: ${fmtDate(check.date)}  |  Assigned to: ${check.assigned_to_name}`, 14, y + 6);

    // ── FOOTER ─────────────────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i2 = 1; i2 <= pageCount; i2++) {
      doc.setPage(i2);
      doc.setFillColor(...NAVY);
      doc.rect(0, 284, W, 13, 'F');
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...CYAN_PDF);
      doc.text('LCA Cleaning Services — Quality Control Report', 14, 291);
      doc.setTextColor(120, 150, 140);
      doc.text(`Page ${i2} of ${pageCount}`, W - 14, 291, { align: 'right' });
    }

    const safeName = (check.property_name || 'Property').replace(/[^a-zA-Z0-9]/g, '-');
    doc.save(`LCA-QC-${safeName}-${check.date}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed: ' + err.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!check) return <div className="page"><p>Check not found.</p></div>;

  const pct = check.status === 'complete' ? check.score_pct : liveScore();

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
          {check.property_name} · {check.staff_name} · {fmtDate(check.date)}
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
        {check.status === 'complete' && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ color: 'var(--ok)', fontSize: 13 }}>✓ Signed off by {check.signed_off_by}</span>
            <button className="btn btn-sm btn-secondary" onClick={exportPDF}>📄 Export PDF</button>
          </div>
        )}
      </div>

      {Object.entries(categories).map(([cat, catItems]) => (
        <div key={cat} className="section-block mb-4">
          <div className="section-block-header">
            <span style={{ fontWeight: 700 }}>{cat}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              {catItems.filter(i => i.score > 0).length}/{catItems.length} scored
            </span>
          </div>
          <div className="section-block-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {catItems.map(item => {
              const itemPhotos = photos[String(item.id)] || [];
              const isPickerOpen = photoPickerItem === item.id;
              return (
                <div key={item.id} className="check-item">
                  <div className="check-item-text">{item.text}</div>
                  <div className="check-item-meta">
                    {item.score_type === 'pass_fail' ? 'Pass / Fail' : 'Score 1–5'} · Weight: {item.weight}×
                  </div>
                  {item.score_type === 'pass_fail' ? (
                    <div className="pass-fail-btns">
                      <button
                        className={`pf-btn pass${item.score === 1 ? ' active' : ''}`}
                        disabled={check.status === 'complete'}
                        onClick={() => setScore(item.id, 1)}
                      >✓ Pass</button>
                      <button
                        className={`pf-btn fail${item.score === 0 && item.score !== null && item.score !== undefined ? ' active' : ''}`}
                        disabled={check.status === 'complete'}
                        onClick={() => setScore(item.id, 0)}
                      >✕ Fail</button>
                    </div>
                  ) : (
                    <div className="score-buttons">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          className={`score-btn${item.score === n ? ' active' : ''}`}
                          disabled={check.status === 'complete'}
                          onClick={() => setScore(item.id, n)}
                        >{n}</button>
                      ))}
                    </div>
                  )}
                  {check.status !== 'complete' && (
                    <input
                      className="form-input" style={{ marginTop: 10 }}
                      placeholder="Notes (optional)…"
                      value={item.notes || ''}
                      onChange={e => setNote(item.id, e.target.value)}
                    />
                  )}
                  {item.notes && check.status === 'complete' && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>{item.notes}</div>
                  )}

                  {/* Per-item photo attachment */}
                  <div style={{ marginTop: 10 }}>
                    {itemPhotos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {itemPhotos.map(photo => (
                          <div key={photo.id} style={{ position: 'relative' }}>
                            <img
                              src={`/uploads/${photo.filename}`}
                              alt={photo.original_name}
                              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
                              onClick={() => window.open(`/uploads/${photo.filename}`, '_blank')}
                            />
                            <button
                              onClick={() => deletePhoto(photo.id)}
                              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button
                        onClick={() => setPhotoPickerItem(isPickerOpen ? null : item.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          width: 56, height: 56, borderRadius: 12,
                          border: '2px dashed var(--border)',
                          background: 'var(--card)', cursor: 'pointer',
                          gap: 3, color: 'var(--cyan)', padding: 0,
                        }}
                        title="Add photo"
                      >
                        <span style={{ fontSize: 20, lineHeight: 1 }}>📷</span>
                        <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1 }}>Add</span>
                      </button>
                      {isPickerOpen && (
                        <div style={{
                          position: 'absolute', bottom: 64, left: 0, zIndex: 100,
                          background: 'var(--card)', border: '1px solid var(--border)',
                          borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                          minWidth: 180, overflow: 'hidden',
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                          >
                            🖼️ Camera Roll
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              ref={el => rollInputRefs.current[item.id] = el}
                              onChange={e => { if (e.target.files[0]) { uploadPhoto(item.id, item.category, e.target.files[0]); e.target.value = ''; } }}
                            />
                          </label>
                          <div style={{ borderTop: '1px solid var(--border)' }} />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                          >
                            📸 Take a Photo
                            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                              ref={el => cameraInputRefs.current[item.id] = el}
                              onChange={e => { if (e.target.files[0]) { uploadPhoto(item.id, item.category, e.target.files[0]); e.target.value = ''; } }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Corrective Actions */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Corrective Actions</span>
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>Appears on PDF report</span>
        </div>
        {check.status !== 'complete' ? (
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
        </div>
        <button className="btn btn-danger btn-sm" onClick={deleteCheck}>🗑 Delete Check</button>
      </div>

      {/* Close photo picker on outside click */}
      {photoPickerItem !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onClick={() => setPhotoPickerItem(null)}
        />
      )}
    </div>
  );
}
