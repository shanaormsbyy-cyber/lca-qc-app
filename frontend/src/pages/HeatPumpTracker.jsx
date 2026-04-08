import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { fmtDate } from '../utils';

function getDueStatus(dueDate) {
  if (!dueDate) return { status: 'none', daysLeft: null };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { status: 'overdue', daysLeft: Math.abs(diff) };
  if (diff <= 7) return { status: 'due_soon', daysLeft: diff };
  return { status: 'ok', daysLeft: diff };
}

export default function HeatPumpTracker() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ property_id: '', due_date: '' });
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const [recRes, avRes] = await Promise.all([
        api.get('/heatpump/records'),
        api.get('/heatpump/available-properties'),
      ]);
      setRecords(recRes.data);
      setAvailable(avRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const handleAdd = async () => {
    if (!addForm.property_id) return;
    await api.post('/heatpump/records', addForm);
    setShowAdd(false);
    setAddForm({ property_id: '', due_date: '' });
    load();
  };

  const handleAddAll = async () => {
    await api.post('/heatpump/records/add-all');
    load();
  };

  const exportReport = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const today = new Date().toISOString().slice(0, 10);

    // Header
    doc.setFillColor(8, 8, 12);
    doc.rect(0, 0, W, 40, 'F');
    doc.setFillColor(58, 181, 217);
    doc.rect(0, 38, W, 2, 'F');

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Heat Pump Filter Clean Report', 14, 18);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(58, 181, 217);
    doc.text('Compiled Summary of All Properties', 14, 26);
    doc.setFontSize(8);
    doc.setTextColor(160, 190, 200);
    doc.text(`Generated: ${fmtDate(today)}`, W - 14, 12, { align: 'right' });

    // Summary stats
    let y = 50;
    const overdue = records.filter(r => getDueStatus(r.due_date).status === 'overdue').length;
    const dueSoon = records.filter(r => getDueStatus(r.due_date).status === 'due_soon').length;
    const okCount = records.filter(r => getDueStatus(r.due_date).status === 'ok').length;
    const noDate = records.filter(r => getDueStatus(r.due_date).status === 'none').length;

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(58, 181, 217);
    doc.text('Summary', 14, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(`Total Properties: ${records.length}`, 14, y);
    doc.text(`Overdue: ${overdue}`, 80, y);
    doc.text(`Due Soon: ${dueSoon}`, 120, y);
    doc.text(`On Track: ${okCount}`, 160, y);
    y += 12;

    // Table
    const sorted = [...records].sort((a, b) => {
      const sa = getDueStatus(a.due_date);
      const sb = getDueStatus(b.due_date);
      const order = { overdue: 0, due_soon: 1, ok: 2, none: 3 };
      return (order[sa.status] ?? 3) - (order[sb.status] ?? 3);
    });

    const tableBody = sorted.map(r => {
      const { status, daysLeft } = getDueStatus(r.due_date);
      const statusLabel = status === 'overdue' ? `${daysLeft}d overdue` : status === 'due_soon' ? `Due in ${daysLeft}d` : status === 'ok' ? `${daysLeft}d left` : 'No date set';
      return [
        r.property_name,
        fmtDate(r.due_date),
        fmtDate(r.last_completed),
        statusLabel,
        r.notes || '',
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['Property', 'Due Date', 'Last Completed', 'Status', 'Notes']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [8, 8, 12], textColor: [58, 181, 217], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 28 },
        4: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw);
          if (val.includes('overdue')) { data.cell.styles.textColor = [220, 50, 50]; data.cell.styles.fontStyle = 'bold'; }
          else if (val.includes('Due in')) { data.cell.styles.textColor = [200, 130, 10]; data.cell.styles.fontStyle = 'bold'; }
          else if (val.includes('left')) { data.cell.styles.textColor = [30, 160, 80]; }
          else { data.cell.styles.textColor = [150, 150, 150]; }
        }
      },
    });

    y = doc.lastAutoTable.finalY + 12;

    // Footer
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setDrawColor(58, 181, 217);
    doc.setLineWidth(0.4);
    doc.line(14, y, W - 14, y);
    y += 6;
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Report generated on ${fmtDate(today)}  |  ${records.length} properties tracked`, 14, y);

    doc.save(`Heat-Pump-Filter-Report-${today}.pdf`);
  };

  const filtered = records.filter(r => {
    if (filter === 'all') return true;
    const { status } = getDueStatus(r.due_date);
    return status === filter;
  });

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading...</span></div>;

  const overdue = records.filter(r => getDueStatus(r.due_date).status === 'overdue').length;
  const dueSoon = records.filter(r => getDueStatus(r.due_date).status === 'due_soon').length;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Heat Pump Filter Tracker</h1>
          <p className="page-subtitle">{records.length} properties tracked</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {records.length > 0 && <button className="btn" onClick={exportReport}>Export Report</button>}
          {available.length > 0 && <button className="btn" onClick={handleAddAll}>Add All Properties</button>}
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Property</button>
        </div>
      </div>

      {(overdue > 0 || dueSoon > 0) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {overdue > 0 && (
            <div className="card" style={{ padding: '12px 20px', borderLeft: '3px solid var(--red)', flex: '0 0 auto' }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>{overdue} overdue</span>
            </div>
          )}
          {dueSoon > 0 && (
            <div className="card" style={{ padding: '12px 20px', borderLeft: '3px solid var(--amber)', flex: '0 0 auto' }}>
              <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{dueSoon} due soon</span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="card-title">Filter Clean Schedule</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'overdue', 'due_soon', 'ok'].map(f => (
              <button key={f} className={`btn btn-sm${filter === f ? ' btn-primary' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue' : f === 'due_soon' ? 'Due Soon' : 'OK'}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Due Date</th>
                <th>Last Completed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>No records found</td></tr>
              ) : filtered.map(r => {
                const { status, daysLeft } = getDueStatus(r.due_date);
                return (
                  <tr key={r.id} onClick={() => navigate(`/heatpump/${r.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 700 }}>{r.property_name}</td>
                    <td>{fmtDate(r.due_date)}</td>
                    <td>{fmtDate(r.last_completed)}</td>
                    <td>
                      {status === 'overdue' && <span className="badge badge-red">{daysLeft}d overdue</span>}
                      {status === 'due_soon' && <span className="badge badge-amber">Due in {daysLeft}d</span>}
                      {status === 'ok' && <span className="badge badge-green">{daysLeft}d left</span>}
                      {status === 'none' && <span className="badge badge-grey">No date set</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16 }}>Add Property to Tracker</h2>
            {available.length === 0 ? (
              <p style={{ color: 'var(--t3)' }}>All properties are already being tracked.</p>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Property</label>
                  <select className="form-input" value={addForm.property_id} onChange={e => setAddForm(f => ({ ...f, property_id: e.target.value }))}>
                    <option value="">Select property...</option>
                    {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label">First Due Date</label>
                  <input type="date" className="form-input" value={addForm.due_date} onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAdd} disabled={!addForm.property_id}>Add</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
