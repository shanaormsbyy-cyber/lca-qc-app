import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ScoreBadge } from '../components/Badge';

function scoreColor(pct) {
  return pct >= 85 ? 'var(--ok)' : pct >= 70 ? 'var(--amber)' : 'var(--red)';
}

export default function QCCheckForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [check, setCheck] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/qc/checks/${id}`).then(r => {
      setCheck(r.data);
      setItems(r.data.items || []);
    }).finally(() => setLoading(false));
  }, [id]);

  const setScore = (itemId, score) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, score } : i));
  };

  const setNote = (itemId, notes) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
  };

  // Calculate live score
  const liveScore = () => {
    let total = 0, max = 0;
    items.forEach(item => {
      const w = item.weight || 1;
      if (item.score_type === 'pass_fail') { total += (item.score || 0) * w; max += w; }
      else { total += (item.score || 0) * w; max += 5 * w; }
    });
    return max ? (total / max) * 100 : 0;
  };

  const save = async (complete = false) => {
    setSaving(true);
    const payload = { items };
    if (complete) { payload.status = 'complete'; payload.signed_off_by = manager.name; }
    await api.put(`/qc/checks/${id}`, payload);
    if (complete) navigate('/qc');
    else {
      const r = await api.get(`/qc/checks/${id}`);
      setCheck(r.data); setItems(r.data.items || []);
    }
    setSaving(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const pct = check.score_pct;

    doc.setFillColor(10, 22, 40);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(0, 200, 150);
    doc.setFontSize(22); doc.setFont(undefined, 'bold');
    doc.text('LCA Cleaning Services', 14, 16);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont(undefined, 'normal');
    doc.text('Quality Control Check Report', 14, 27);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    const info = [
      ['Property', check.property_name],
      ['Staff Member', check.staff_name],
      ['Checklist', check.checklist_name],
      ['Date', check.date],
      ['Assigned To', check.assigned_to_name],
      ['Signed Off By', check.signed_off_by || '—'],
      ['Score', `${Math.round(pct)}%`],
    ];
    let y = 50;
    info.forEach(([k, v]) => {
      doc.setFont(undefined, 'bold'); doc.text(k + ':', 14, y);
      doc.setFont(undefined, 'normal'); doc.text(v || '—', 70, y);
      y += 7;
    });

    autoTable(doc, {
      startY: y + 8,
      head: [['#', 'Item', 'Category', 'Type', 'Score', 'Notes']],
      body: items.map((item, i) => [
        i + 1,
        item.text,
        item.category || '—',
        item.score_type === 'pass_fail' ? 'Pass/Fail' : '1–5',
        item.score_type === 'pass_fail' ? (item.score ? 'PASS' : 'FAIL') : `${item.score}/5`,
        item.notes || '',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 200, 150] },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    });

    doc.save(`QC-Check-${check.property_name}-${check.date}.pdf`);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!check) return <div className="page"><p>Check not found.</p></div>;

  const pct = check.status === 'complete' ? check.score_pct : liveScore();

  // Group by category
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
          {check.property_name} · {check.staff_name} · {check.date}
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
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            {catItems.map(item => (
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
              </div>
            ))}
          </div>
        </div>
      ))}

      {check.status !== 'complete' && (
        <div className="flex gap-3 mt-4">
          <button className="btn btn-secondary" onClick={() => save(false)} disabled={saving}>Save Progress</button>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving…</> : '✓ Sign Off & Complete'}
          </button>
        </div>
      )}
    </div>
  );
}
