import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import useLiveSync from '../hooks/useLiveSync';
import { fmtDate } from '../utils';

const POCKET_CARD = (
  <div style={{
    background: 'rgba(58,181,217,0.07)', border: '1px solid rgba(58,181,217,0.2)',
    borderRadius: 10, padding: '16px 20px', fontSize: 13, lineHeight: 1.7,
  }}>
    <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--cyan)', marginBottom: 10 }}>
      Pocket Card — Can't / Didn't / Won't
    </div>
    <div style={{ marginBottom: 12 }}>
      <strong style={{ color: 'var(--amber)' }}>Can't</strong> — skill gap. Retrain, demo, more reps. Coach it.<br />
      <strong style={{ color: 'var(--cyan)' }}>Didn't</strong> — unclear or blocked. Fix the expectation or the barrier.<br />
      <strong style={{ color: 'var(--red)' }}>Won't</strong> — can, but chooses not to. Code conversation, don't coach.
    </div>
    <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 6 }}>The Five Moves</div>
    <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--t2)' }}>
      <li><strong>Show the gap.</strong> Evidence, not opinion. Private, calm.</li>
      <li><strong>Ask why — then stop.</strong> Let them talk first.</li>
      <li><strong>One thing.</strong> Pick the single fix; show what good looks like.</li>
      <li><strong>Lock it.</strong> One checkable step + a date.</li>
      <li><strong>Back them.</strong> "I know you can." Then follow up.</li>
    </ol>
  </div>
);

const PROBLEM_LABELS = { cant: "Can't", didnt: "Didn't", wont: "Won't" };
const PROBLEM_COLORS = {
  cant:  { color: 'var(--amber)', bg: 'rgba(245,158,11,0.12)' },
  didnt: { color: 'var(--cyan)',  bg: 'rgba(58,181,217,0.12)' },
  wont:  { color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)'  },
};

function ProblemBadge({ type }) {
  const s = PROBLEM_COLORS[type] || PROBLEM_COLORS.cant;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, color: s.color, background: s.bg }}>
      {PROBLEM_LABELS[type] || type}
    </span>
  );
}

function CoachingStatusBadge({ status }) {
  const open = status === 'open';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
      color: open ? 'var(--amber)' : 'var(--ok)',
      background: open ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
    }}>
      {open ? 'Open' : 'Resolved'}
    </span>
  );
}

const EMPTY_FORM = {
  staff_id: '', date: new Date().toISOString().slice(0, 10),
  topic: '', problem_type: '', how_coached: '', outcome: '',
  followup_date: '', sessions_required: 1, status: 'open',
};

export default function Coaching() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pocketOpen, setPocketOpen] = useState(false);
  const [modalPocketOpen, setModalPocketOpen] = useState(false);
  const [filterStaff, setFilterStaff] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = () => {
    Promise.all([
      api.get('/coaching'),
      api.get('/staff'),
    ]).then(([c, s]) => {
      setSessions(c.data);
      setStaff(s.data.filter(x => !x.inactive_until));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useLiveSync(load);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalPocketOpen(false);
    setShowModal(true);
  };

  const openEdit = (session) => {
    setEditingId(session.id);
    setForm({
      staff_id: session.staff_id,
      date: session.date,
      topic: session.topic,
      problem_type: session.problem_type,
      how_coached: session.how_coached,
      outcome: session.outcome,
      followup_date: session.followup_date || '',
      sessions_required: session.sessions_required,
      status: session.status,
    });
    setModalPocketOpen(false);
    setShowModal(true);
  };

  const saveSession = async () => {
    if (!form.staff_id || !form.date || !form.topic || !form.problem_type || !form.how_coached || !form.outcome) {
      alert('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/coaching/${editingId}`, form);
      } else {
        await api.post('/coaching', form);
      }
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const filtered = sessions.filter(s => {
    if (filterStaff && s.staff_id !== parseInt(filterStaff)) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  });

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const activeStaffCount = staff.length;

  return (
    <div className="page">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 2 }}>Coaching</h1>
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>{activeStaffCount} active staff member{activeStaffCount !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Session</button>
      </div>

      {/* Pocket Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <button
          onClick={() => setPocketOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cyan)', fontWeight: 700, fontSize: 13, padding: 0 }}
        >
          <span style={{ fontSize: 16 }}>{pocketOpen ? '▼' : '▶'}</span>
          Coaching Reference Card
        </button>
        {pocketOpen && <div style={{ marginTop: 14 }}>{POCKET_CARD}</div>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterStaff}
          onChange={e => setFilterStaff(e.target.value)}
          className="form-input"
          style={{ maxWidth: 220 }}
        >
          <option value="">All staff</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="form-input"
          style={{ maxWidth: 160 }}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--t3)', padding: '8px 0' }}>No coaching sessions found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Staff</th>
                  <th>Topic</th>
                  <th>Problem</th>
                  <th>Follow-up</th>
                  <th>Sessions</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/coaching/${s.id}`)}>
                    <td>{fmtDate(s.date)}</td>
                    <td style={{ fontWeight: 600 }}>{s.staff_name}</td>
                    <td style={{ color: 'var(--t2)' }}>{s.topic}</td>
                    <td><ProblemBadge type={s.problem_type} /></td>
                    <td style={{ color: 'var(--t2)' }}>{s.followup_date ? fmtDate(s.followup_date) : '—'}</td>
                    <td style={{ textAlign: 'center' }}>{s.sessions_required}</td>
                    <td><CoachingStatusBadge status={s.status} /></td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={e => { e.stopPropagation(); openEdit(s); }}
                      >Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 18 }}>{editingId ? 'Edit Coaching Session' : 'New Coaching Session'}</h2>

            {/* Pocket card inside modal */}
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => setModalPocketOpen(o => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cyan)', fontWeight: 700, fontSize: 12, padding: 0 }}
              >
                <span>{modalPocketOpen ? '▼' : '▶'}</span>
                Reference Card
              </button>
              {modalPocketOpen && <div style={{ marginTop: 10 }}>{POCKET_CARD}</div>}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Staff Member *</label>
              <select className="form-input" value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff member</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Date *</label>
              <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Topic *</label>
              <input className="form-input" type="text" placeholder="e.g. Bathroom presentation" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Problem Type *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['cant', 'didnt', 'wont'].map(pt => {
                  const s = PROBLEM_COLORS[pt];
                  const active = form.problem_type === pt;
                  return (
                    <button
                      key={pt}
                      onClick={() => setForm(f => ({ ...f, problem_type: pt }))}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, border: `2px solid ${active ? s.color : 'var(--border)'}`,
                        background: active ? s.bg : 'transparent', color: active ? s.color : 'var(--t2)',
                        fontWeight: 700, cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      {PROBLEM_LABELS[pt]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">How It Was Coached *</label>
              <textarea className="form-input" rows={3} value={form.how_coached} onChange={e => setForm(f => ({ ...f, how_coached: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Outcome / Follow-up Action *</label>
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
                  <button
                    key={st}
                    onClick={() => setForm(f => ({ ...f, status: st }))}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8,
                      border: `2px solid ${form.status === st ? (st === 'open' ? 'var(--amber)' : 'var(--ok)') : 'var(--border)'}`,
                      background: form.status === st ? (st === 'open' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)') : 'transparent',
                      color: form.status === st ? (st === 'open' ? 'var(--amber)' : 'var(--ok)') : 'var(--t2)',
                      fontWeight: 700, cursor: 'pointer', fontSize: 13, textTransform: 'capitalize',
                    }}
                  >
                    {st === 'open' ? 'Open' : 'Resolved'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSession} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
