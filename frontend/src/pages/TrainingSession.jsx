import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function TrainingSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/training/sessions/${id}`).then(r => {
      setSession(r.data);
      setItems(r.data.items || []);
    }).finally(() => setLoading(false));
  }, [id]);

  const toggle = itemId => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, completed: i.completed ? 0 : 1 } : i));
  };

  const updateNote = (itemId, notes) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
  };

  const save = async (complete = false) => {
    setSaving(true);
    const payload = { items };
    if (complete) {
      payload.status = 'complete';
      payload.signed_off_by = manager.name;
    }
    await api.put(`/training/sessions/${id}`, payload);
    if (complete) navigate('/training');
    else {
      const r = await api.get(`/training/sessions/${id}`);
      setSession(r.data);
      setItems(r.data.items || []);
    }
    setSaving(false);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!session) return <div className="page"><p>Session not found.</p></div>;

  // Group by section
  const sections = {};
  items.forEach(item => {
    if (!sections[item.section_id]) sections[item.section_id] = { name: item.section_name, items: [] };
    sections[item.section_id].items.push(item);
  });
  const sortedSections = Object.values(sections).sort((a, b) => 0);

  const completed = items.filter(i => i.completed).length;
  const total = items.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/training')}>← Back</button>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{session.checklist_name}</h1>
        <p style={{ color: 'var(--t2)' }}>Trainee: <strong style={{ color: 'var(--t1)' }}>{session.trainee_name}</strong> · Assigned to: <strong style={{ color: 'var(--t1)' }}>{session.assigned_to_name}</strong> · {session.date}</p>
      </div>

      <div className="card mb-6" style={{ padding: '16px 20px' }}>
        <div className="flex items-center justify-between mb-4" style={{ marginBottom: 12 }}>
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
                    width: 22, height: 22, borderRadius: 6,
                    border: `2px solid ${item.completed ? 'var(--green)' : 'var(--border)'}`,
                    background: item.completed ? 'var(--green)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all .15s'
                  }}>
                    {item.completed ? <span style={{ color: 'var(--navy)', fontWeight: 800, fontSize: 13 }}>✓</span> : null}
                  </div>
                  <span style={{ fontWeight: 500, textDecoration: item.completed ? 'line-through' : 'none', color: item.completed ? 'var(--t3)' : 'var(--t1)' }}>
                    {item.text}
                  </span>
                </div>
                {item.completed && session.status !== 'complete' && (
                  <input
                    className="form-input" style={{ marginTop: 8, marginLeft: 34, width: 'calc(100% - 34px)' }}
                    placeholder="Notes (optional)…"
                    value={item.notes || ''}
                    onChange={e => updateNote(item.id, e.target.value)}
                  />
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
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!allDone && !confirm('Not all items are completed. Sign off anyway?')) return;
              save(true);
            }}
            disabled={saving}
          >
            {saving ? <><span className="spinner" /> Saving…</> : '✓ Sign Off & Complete'}
          </button>
        </div>
      )}
    </div>
  );
}
