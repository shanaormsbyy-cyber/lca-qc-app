import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api';
import { fmtDate } from '../utils';

export default function StaffPortalCheck() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('staff_token');
    if (!token) { navigate('/portal/login'); return; }
    api.get(`/staff-portal/my-checks/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setCheck(r.data))
      .catch(() => navigate('/portal'))
      .finally(() => setLoading(false));
  }, [id]);

  const exportPDF = async () => {
    if (!check) return;
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210;
      const pct = Math.round(check.score_pct || 0);
      const today = new Date().toISOString().slice(0, 10);

      // ── HEADER (no logo, no LCA branding) ──────────────────────────────────
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
      ];
      info.forEach(([label, value], i) => {
        const x = i % 2 === 0 ? 14 : 110;
        if (i % 2 === 0 && i > 0) y += 10;
        doc.setFont(undefined, 'bold');
        doc.setTextColor(58, 181, 217);
        doc.text(label + ':', x, y);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(String(value).substring(0, 35), x + 30, y);
      });
      y += 14;

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

      const tableBody = (check.items || []).map((item, i) => {
        const isPF = (item.score_type || 'pass_fail') === 'pass_fail';
        const score = item.score ?? 0;
        const scoreLabel = item.na ? 'N/A' : isPF ? (score === 1 ? 'PASS' : 'FAIL') : (score > 0 ? `${score}/5` : '—');
        return [
          String(i + 1),
          String(item.category || '—'),
          String(item.text || ''),
          scoreLabel,
          String(item.weight ?? 1) + (isPF ? '' : '\u00d7'),
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
      const allPhotos = check.photos || [];
      if (allPhotos.length > 0) {
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

          const imgW = 56, imgH = 42, cols = 3, gapX = 4, gapY = 6;
          loaded.forEach((photo, idx) => {
            const col = idx % cols;
            const x = 14 + col * (imgW + gapX);
            if (col === 0 && idx > 0) y += imgH + gapY + 8;
            if (y + imgH > 275) { doc.addPage(); y = 20; }
            try {
              doc.addImage(photo.b64, 'JPEG', x, y, imgW, imgH);
              const label = photo.original_name || '';
              if (label) {
                doc.setFontSize(6);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(80, 80, 80);
                doc.text(String(label).substring(0, 28), x, y + imgH + 3);
              }
            } catch (_) {}
          });
          y += imgH + gapY + 10;
        }
      }

      const safeName = (check.property_name || 'Property').replace(/[^a-zA-Z0-9]/g, '-');
      doc.save(`QC-Report-${safeName}-${check.date}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed: ' + err.message);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading...</span></div>;
  if (!check) return null;

  const pct = Math.round(check.score_pct || 0);
  const scoreColor = pct >= 85 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';
  const items = check.items || [];
  const passed = items.filter(i => !i.na && ((i.score_type || 'pass_fail') === 'pass_fail' ? i.score === 1 : i.score >= 4)).length;
  const failed = items.filter(i => !i.na && ((i.score_type || 'pass_fail') === 'pass_fail' ? i.score === 0 : i.score > 0 && i.score < 4)).length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 0 40px' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--glass)', borderBottom: '1px solid var(--glass-border)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-sm" onClick={() => navigate('/portal')}>Back</button>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--cyan)' }}>QC Report</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={exportPDF}>Download PDF</button>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header card */}
        <div className="card" style={{ marginBottom: 20, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{check.property_name}</h1>
              <p style={{ color: 'var(--t3)', fontSize: 13 }}>{fmtDate(check.date)} &middot; {check.checklist_name}</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Overall Score</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ padding: '8px 16px', background: 'rgba(34,197,94,0.1)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{passed} Passed</span>
            </div>
            <div style={{ padding: '8px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>{failed} Failed</span>
            </div>
            <div style={{ padding: '8px 16px', background: 'rgba(58,181,217,0.1)', borderRadius: 8, border: '1px solid rgba(58,181,217,0.2)' }}>
              <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{items.length} Total Items</span>
            </div>
          </div>
        </div>

        {/* Checklist items */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Checklist Results</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Category</th>
                  <th>Item</th>
                  <th style={{ width: 80 }}>Result</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const isPF = (item.score_type || 'pass_fail') === 'pass_fail';
                  const resultLabel = item.na ? 'N/A' : isPF ? (item.score === 1 ? 'PASS' : 'FAIL') : (item.score > 0 ? `${item.score}/5` : '—');
                  const resultColor = item.na ? 'var(--t3)' : isPF ? (item.score === 1 ? 'var(--green)' : 'var(--red)') : (item.score >= 4 ? 'var(--green)' : item.score >= 3 ? 'var(--amber)' : 'var(--red)');
                  return (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--t3)' }}>{i + 1}</td>
                      <td style={{ color: 'var(--t2)', fontSize: 12 }}>{item.category || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{item.text}</td>
                      <td><span style={{ color: resultColor, fontWeight: 700 }}>{resultLabel}</span></td>
                      <td style={{ color: 'var(--t2)', fontSize: 12 }}>{item.notes || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Corrective actions */}
        {check.notes && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Corrective Actions</span>
            </div>
            <p style={{ color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{check.notes}</p>
          </div>
        )}

        {/* Photos */}
        {check.photos?.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Photos</span>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{check.photos.length} photos</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {check.photos.map(p => (
                <div key={p.id} style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--glass)', border: '1px solid var(--glass-border)' }}>
                  <img src={`/uploads/${p.filename}`} alt={p.original_name} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '6px 8px' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtDate(p.uploaded_at?.slice(0, 10))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Date info */}
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--glass)', borderRadius: 10, border: '1px solid var(--glass-border)', fontSize: 13, color: 'var(--t2)' }}>
          <span style={{ color: 'var(--t3)' }}>Date:</span> <strong>{fmtDate(check.date)}</strong>
        </div>
      </div>
    </div>
  );
}
