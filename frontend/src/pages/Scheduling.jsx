import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { DueBadge } from '../components/Badge';
import { fmtDate } from '../utils';

export default function Scheduling() {
  const navigate = useNavigate();
  const [due, setDue] = useState(null);
  const [settings, setSettings] = useState({ qc_freq_staff_days: '30', qc_freq_property_days: '14' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [tab, setTab] = useState('staff');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/scheduling/due').then(r => {
      setDue(r.data);
      setSettings({ qc_freq_staff_days: String(r.data.staffDays), qc_freq_property_days: String(r.data.propDays) });
    }).finally(() => setLoading(false));
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    await api.put('/scheduling/settings', settings);
    const r = await api.get('/scheduling/due');
    setDue(r.data);
    setSavingSettings(false);
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Scheduling & Due Checks</h1>
          <p style={{ color: 'var(--t2)', marginTop: 4 }}>Sorted by urgency — overdue first</p>
        </div>
      </div>

      {/* Settings bar */}
      <div className="card mb-6">
        <div className="card-title" style={{ marginBottom: 16 }}>⚙️ Check Frequency Settings</div>
        <div className="flex gap-4 items-center" style={{ flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>QC per staff every</label>
            <input
              className="form-input" type="number" min="1" style={{ width: 80 }}
              value={settings.qc_freq_staff_days}
              onChange={e => setSettings(s => ({ ...s, qc_freq_staff_days: e.target.value }))}
            />
            <span style={{ color: 'var(--t2)' }}>days</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>QC per property every</label>
            <input
              className="form-input" type="number" min="1" style={{ width: 80 }}
              value={settings.qc_freq_property_days}
              onChange={e => setSettings(s => ({ ...s, qc_freq_property_days: e.target.value }))}
            />
            <span style={{ color: 'var(--t2)' }}>days</span>
          </div>
          <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="tab-row">
        <button className={`tab-btn${tab === 'staff' ? ' active' : ''}`} onClick={() => setTab('staff')}>
          Staff ({due?.staff.filter(s => s.status !== 'ok').length || 0} due/overdue)
        </button>
        <button className={`tab-btn${tab === 'properties' ? ' active' : ''}`} onClick={() => setTab('properties')}>
          Properties ({due?.properties.filter(p => p.status !== 'ok').length || 0} due/overdue)
        </button>
      </div>

      {tab === 'staff' && (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Role</th><th>Last QC Check</th><th>Next Due</th><th>Status</th><th>Total Checks</th><th></th>
            </tr></thead>
            <tbody>
              {due?.staff.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: 'var(--t2)' }}>{s.role}</td>
                  <td style={{ color: 'var(--t2)' }}>{fmtDate(s.last_check_date) || 'Never'}</td>
                  <td style={{ color: 'var(--t2)' }}>{fmtDate(s.next_due)}</td>
                  <td><DueBadge status={s.status} daysLeft={s.days_left} /></td>
                  <td>{s.total_checks}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate('/qc', { state: { preselect: { staff_id: s.id } } })}
                    >
                      Schedule QC
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'properties' && (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Property</th><th>Address</th><th>Last QC Check</th><th>Next Due</th><th>Status</th><th>Total Checks</th><th></th>
            </tr></thead>
            <tbody>
              {due?.properties.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td style={{ color: 'var(--t2)', fontSize: 12 }}>{p.address}</td>
                  <td style={{ color: 'var(--t2)' }}>{fmtDate(p.last_check_date) || 'Never'}</td>
                  <td style={{ color: 'var(--t2)' }}>{fmtDate(p.next_due)}</td>
                  <td><DueBadge status={p.status} daysLeft={p.days_left} /></td>
                  <td>{p.total_checks}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate('/qc')}
                    >
                      Schedule QC
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
