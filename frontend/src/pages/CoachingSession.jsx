import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { fmtDate } from '../utils';

const PROBLEM_LABELS = { cant: "Can't", didnt: "Didn't", wont: "Won't" };
const PROBLEM_COLORS = {
  cant:  { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
  didnt: { color: 'var(--cyan)',  bg: 'rgba(58,181,217,0.12)' },
  wont:  { color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)'  },
};

function Field({ label, value, multiline }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 4 }}>{label}</div>
      {multiline
        ? <p style={{ fontSize: 14, color: 'var(--t1)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{value}</p>
        : <div style={{ fontSize: 14, color: 'var(--t1)' }}>{value}</div>
      }
    </div>
  );
}

export default function CoachingSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/coaching/${id}`)
      .then(r => {
        setSession(r.data);
        setForm({
          date: r.data.date,
          topic: r.data.topic,
          problem_type: r.data.problem_type,
          how_coached: r.data.how_coached,
          outcome: r.data.outcome,
          followup_date: r.data.followup_date || '',
          sessions_required: r.data.sessions_required,
          status: r.data.status,
        });
      })
      .catch(() => navigate('/coaching'))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/coaching/${id}`, form);
      const r = await api.get(`/coaching/${id}`);
      setSession(r.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteSession = async () => {
    if (!confirm('Delete this coaching session? This cannot be undone.')) return;
    await api.delete(`/coaching/${id}`);
    navigate('/coaching');
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!session) return null;

  const ps = PROBLEM_COLORS[session.problem_type] || PROBLEM_COLORS.cant;
  const openStatus = session.status === 'open';

  if (editing) {
    return (
      <div className="page">
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} style={{ marginBottom: 16 }}>← Cancel</button>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Edit Coaching Session</h1>

        <div className="card">
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Topic</label>
            <input className="form-input" type="text" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Problem Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['cant', 'didnt', 'wont'].map(pt => {
                const s = PROBLEM_COLORS[pt];
                const active = form.problem_type === pt;
                return (
                  <button key={pt} onClick={() => setForm(f => ({ ...f, problem_type: pt }))} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    border: `2px solid ${active ? s.color : 'var(--border)'}`,
                    background: active ? s.bg : 'transparent',
                    color: active ? s.color : 'var(--t2)',
                    fontWeight: 700, cursor: 'pointer', fontSize: 13,
                  }}>
                    {PROBLEM_LABELS[pt]}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">How It Was Coached</label>
            <textarea className="form-input" rows={3} value={form.how_coached} onChange={e => setForm(f => ({ ...f, how_coached: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Outcome / Follow-up Action</label>
            <textarea className="form-input" rows={3} value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Follow-up Date</label>
              <input className="form-input" type="date" value={form.followup_date} onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
            </div>
            <div style={{ width: 120 }}>
              <label className="form-label">Sessions Required</label>
              <input className="form-input" type="number" min={1} value={form.sessions_required} onChange={e => setForm(f => ({ ...f, sessions_required: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="form-label">Status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['open', 'resolved'].map(st => (
                <button key={st} onClick={() => setForm(f => ({ ...f, status: st }))} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8,
                  border: `2px solid ${form.status === st ? (st === 'open' ? 'var(--amber)' : 'var(--ok)') : 'var(--border)'}`,
                  background: form.status === st ? (st === 'open' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)') : 'transparent',
                  color: form.status === st ? (st === 'open' ? 'var(--amber)' : 'var(--ok)') : 'var(--t2)',
                  fontWeight: 700, cursor: 'pointer', fontSize: 13, textTransform: 'capitalize',
                }}>
                  {st === 'open' ? 'Open' : 'Resolved'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/coaching')}>← Back to Coaching</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={deleteSession}>Delete</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <button
              onClick={() => navigate(`/staff/${session.staff_id}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 18, color: 'var(--t1)', padding: 0 }}
            >
              {session.staff_name}
            </button>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
              Logged by {session.manager_name} · {fmtDate(session.date)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: ps.color, background: ps.bg }}>
              {PROBLEM_LABELS[session.problem_type] || session.problem_type}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
              color: openStatus ? 'var(--amber)' : 'var(--ok)',
              background: openStatus ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
            }}>
              {openStatus ? 'Open' : 'Resolved'}
            </span>
          </div>
        </div>

        <Field label="Topic" value={session.topic} />
        <Field label="How It Was Coached" value={session.how_coached} multiline />
        <Field label="Outcome / Follow-up Action" value={session.outcome} multiline />
        {session.followup_date && <Field label="Follow-up Date" value={fmtDate(session.followup_date)} />}
        <Field label="Sessions Required" value={String(session.sessions_required)} />
      </div>
    </div>
  );
}
