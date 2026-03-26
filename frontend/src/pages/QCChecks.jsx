import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ScoreBadge, StatusBadge } from '../components/Badge';
import { fmtDate } from '../utils';

export default function QCChecks() {
  const { manager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [checks, setChecks] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [staff, setStaff] = useState([]);
  const [properties, setProperties] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCheck, setShowNewCheck] = useState(false);
  const [checkForm, setCheckForm] = useState({ property_id: '', staff_id: '', checklist_id: '', assigned_to_id: '', date: new Date().toISOString().slice(0, 10), notes: '', check_type: 'staff' });
  const [filter, setFilter] = useState('all');

  const load = () => Promise.all([
    api.get('/qc/checks'),
    api.get('/qc/checklists'),
    api.get('/staff'),
    api.get('/properties'),
    api.get('/managers'),
  ]).then(([c, cl, s, p, m]) => {
    setChecks(c.data); setChecklists(cl.data); setStaff(s.data); setProperties(p.data); setManagers(m.data);
  }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading && searchParams.get('openNew')) {
      const staffId = searchParams.get('staff_id') || '';
      const propertyId = searchParams.get('property_id') || '';
      setCheckForm(f => ({
        ...f,
        staff_id: staffId,
        property_id: propertyId,
        assigned_to_id: String(manager.id),
      }));
      setShowNewCheck(true);
      navigate(location.pathname, { replace: true });
    }
  }, [loading]);

  const createCheck = async () => {
    const { property_id, staff_id, checklist_id, assigned_to_id, date } = checkForm;
    if (!property_id || !staff_id || !checklist_id || !assigned_to_id || !date) return alert('All fields required');
    const r = await api.post('/qc/checks', checkForm);
    setShowNewCheck(false);
    navigate(`/qc/checks/${r.data.id}`);
  };

  const handleCheckTypeChange = (type) => {
    const defaultCL = checklists.find(cl => cl.default_for === type);
    setCheckForm(f => ({ ...f, check_type: type, checklist_id: defaultCL ? String(defaultCL.id) : f.checklist_id }));
  };

  const deleteCheck = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this QC check?')) return;
    await api.delete(`/qc/checks/${id}`);
    setChecks(c => c.filter(x => x.id !== id));
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const filteredChecks = filter === 'all' ? checks
    : filter === 'mine' ? checks.filter(c => c.assigned_to_id === manager.id)
    : checks.filter(c => c.status === filter);

  return (
    <div className="page">
      <div className="section-header">
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>QC Checks</h1>
        <button className="btn btn-primary" onClick={() => {
          const defaultCL = checklists.find(cl => cl.default_for === 'staff');
          setCheckForm(f => ({ ...f, checklist_id: defaultCL ? String(defaultCL.id) : '' }));
          setShowNewCheck(true);
        }}>+ New QC Check</button>
      </div>

      <div className="tab-row mb-6">
        {[['all','All'],['pending','Pending'],['complete','Complete'],['mine','Assigned to me']].map(([v,l]) => (
          <button key={v} className={`tab-btn${filter===v?' active':''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {filteredChecks.length === 0 ? (
        <div className="empty-state"><div className="icon">✅</div>No QC checks found.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Date</th><th>Property</th><th>Staff</th><th>Checklist</th><th>Assigned To</th><th>Score</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {filteredChecks.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/qc/checks/${c.id}`)}>
                  <td>{fmtDate(c.date)}</td>
                  <td style={{ fontWeight: 600 }}>{c.property_name}</td>
                  <td>{c.staff_name}</td>
                  <td style={{ color: 'var(--t2)' }}>{c.checklist_name}</td>
                  <td>{c.assigned_to_name}</td>
                  <td>{c.status === 'complete' ? <ScoreBadge score={c.score_pct} /> : <span style={{ color: 'var(--t3)' }}>—</span>}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-danger" onClick={e => deleteCheck(c.id, e)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      {showNewCheck && (
        <div className="modal-overlay" onClick={() => setShowNewCheck(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New QC Check</div>
            <div className="form-group">
              <label className="form-label">Property</label>
              <select className="form-select" value={checkForm.property_id} onChange={e => setCheckForm(f => ({ ...f, property_id: e.target.value }))}>
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Staff Member Being Assessed</label>
              <select className="form-select" value={checkForm.staff_id} onChange={e => setCheckForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Select staff member…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Checklist</label>
              <select className="form-select" value={checkForm.checklist_id} onChange={e => setCheckForm(f => ({ ...f, checklist_id: e.target.value }))}>
                <option value="">Select checklist…</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assign To</label>
              <select className="form-select" value={checkForm.assigned_to_id} onChange={e => setCheckForm(f => ({ ...f, assigned_to_id: e.target.value }))}>
                <option value="">Select manager…</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={checkForm.date} onChange={e => setCheckForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Check Type</label>
              <select className="form-select" value={checkForm.check_type} onChange={e => handleCheckTypeChange(e.target.value)}>
                <option value="staff">Staff Check — evaluates team member performance</option>
                <option value="property">Property Check — evaluates property cleanliness</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={createCheck}>Create & Open</button>
              <button className="btn btn-ghost" onClick={() => setShowNewCheck(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
