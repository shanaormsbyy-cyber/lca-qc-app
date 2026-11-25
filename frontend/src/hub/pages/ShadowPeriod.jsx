import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Home, Settings } from 'lucide-react';
import api, { errMsg } from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, StatTile, Panel, ProgressCell, StatusPill, Avatar, EmptyState, Loading, Icon, Modal, FileDrop } from '../components/ui';
import { StartShadowModal } from '../components/modals';
import { fmtDate } from '../lib/format';

function ReviewPanel({ periodId, initialShiftId, systems, methodIds, properties, managers }) {
  const [p] = useLoad(() => api.get(`/shadow/${periodId}`).then(r => r.data), [periodId]);
  const [shiftId, setShiftId] = useState(initialShiftId || null);
  const [form, setForm] = useState({ notes: '', system_ids: [] });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shift = p && (p.shifts.find(s => s.id === shiftId) || p.shifts.find(s => !s.reviewed) || p.shifts[p.shifts.length - 1]);
  useEffect(() => {
    if (shift) { setForm({ notes: shift.review_notes || '', system_ids: shift.system_ids || [] }); setFiles([]); setError(''); }
  }, [shift && shift.id, shift && shift.reviewed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <Panel title="Shadow Shift Review" icon="clipboard-check"><Loading /></Panel>;
  const methods = systems.filter(s => methodIds.includes(s.id));
  const updateShift = (patch) => api.put(`/shadow/${p.id}/shifts/${shift.id}`, patch).catch(e => setError(errMsg(e)));
  const toggle = (id) => setForm(f => ({ ...f, system_ids: f.system_ids.includes(id) ? f.system_ids.filter(x => x !== id) : [...f.system_ids, id] }));
  const complete = async () => {
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('notes', form.notes);
    fd.append('system_ids', JSON.stringify(form.system_ids));
    files.forEach(f => fd.append('photos', f));
    try { await api.post(`/shadow/${p.id}/shifts/${shift.id}/review`, fd); setFiles([]); }
    catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const signoff = async () => {
    if (!window.confirm(`Sign off ${p.staff_name}'s shadow period?`)) return;
    try { await api.post(`/shadow/${p.id}/signoff`); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <Panel title="Shadow Shift Review" icon="clipboard-check">
      <div className="row-gap mb-4">
        <Avatar name={p.staff_name} size={40} />
        <div className="grow"><div className="strong">{p.staff_name}</div><div className="muted small">Shadow Shift {shift.shift_number} of {p.shift_count}{shift.property_name ? ` · ${shift.property_name}` : ''}</div></div>
        <StatusPill status={p.status} />
      </div>
      <div className="row-gap mb-4">
        {p.shifts.map(s => (
          <button key={s.id} className={`step${s.id === shift.id ? ' active' : s.reviewed ? ' done' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setShiftId(s.id)}>
            <span className="step-num">{s.reviewed ? <Check size={12} /> : s.shift_number}</span>
          </button>
        ))}
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={shift.date || ''} onChange={e => updateShift({ date: e.target.value })} /></div>
        <div className="form-group"><label className="form-label">Property</label>
          <select className="form-select" value={shift.property_id || ''} onChange={e => updateShift({ property_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>{properties.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
          </select></div>
      </div>
      <div className="form-group"><label className="form-label">Mentor</label>
        <select className="form-select" value={shift.mentor_id || ''} onChange={e => updateShift({ mentor_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></div>

      <label className="form-label">Coaching &amp; Observation</label>
      {methods.length === 0 ? <div className="muted small mb-4">No coaching methods set — choose them in Shadow Period Settings.</div> : methods.map(m => (
        <label key={m.id} className={`method-row${form.system_ids.includes(m.id) ? ' on' : ''}`}>
          <Icon name={m.icon} size={20} style={{ color: 'var(--cyan)' }} />
          <div className="grow"><div className="strong small">{m.name}</div><div className="muted small">{m.description}</div></div>
          <input type="checkbox" checked={form.system_ids.includes(m.id)} onChange={() => toggle(m.id)} />
        </label>
      ))}
      <div className="form-group mt-16"><label className="form-label">Shift Review Notes</label>
        <textarea className="form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="What improved, what still needs prompting, focus for next shift" /></div>
      <div className="form-group"><label className="form-label">Evidence (optional)</label>
        <FileDrop onFiles={fs => setFiles(prev => [...prev, ...fs])} label="Drag & drop photos or videos, or click to upload" />
        {(shift.photos.length > 0 || files.length > 0) && (
          <div className="thumbs">
            {shift.photos.map(ph => (ph.mime || '').startsWith('image/') ? <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer"><img className="thumb" src={ph.url} alt="" /></a> : <a key={ph.id} className="thumb" href={ph.url} target="_blank" rel="noreferrer">video</a>)}
            {files.map((f, i) => <div key={i} className="thumb">{f.type.startsWith('image/') ? <img className="thumb" src={URL.createObjectURL(f)} alt="" /> : 'new'}</div>)}
          </div>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        {p.status === 'ready' && <button className="btn btn-secondary" onClick={signoff}>Sign off shadow period</button>}
        <button className="btn btn-primary" disabled={busy || p.status === 'signed_off'} onClick={complete}>{shift.reviewed ? 'Update Review' : 'Complete Review'} <Check size={16} /></button>
      </div>
    </Panel>
  );
}

function SettingsModal({ systems, onClose }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/settings').then(r => setS(r.data)); }, []);
  const save = async () => { try { await api.put('/settings', { shadow_shift_count: Number(s.shadow_shift_count), shadow_method_system_ids: s.shadow_method_system_ids }); onClose(); } catch (e) { setError(errMsg(e)); } };
  return (
    <Modal title="Shadow Period Settings" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      {!s ? <Loading /> : <>
        <div className="form-group"><label className="form-label">Shifts per shadow period</label>
          <input type="number" min="1" max="20" className="form-input" value={s.shadow_shift_count} onChange={e => setS({ ...s, shadow_shift_count: e.target.value })} />
          <div className="muted small mt-4">Applies to shadow periods started from now on.</div></div>
        <label className="form-label">Coaching methods to observe</label>
        {systems.map(sy => (
          <label key={sy.id} className="check-row"><input type="checkbox" checked={s.shadow_method_system_ids.includes(sy.id)}
            onChange={() => setS({ ...s, shadow_method_system_ids: s.shadow_method_system_ids.includes(sy.id) ? s.shadow_method_system_ids.filter(x => x !== sy.id) : [...s.shadow_method_system_ids, sy.id] })} /><span>{sy.name}</span></label>
        ))}
        {error && <div className="form-error">{error}</div>}
      </>}
    </Modal>
  );
}

export default function ShadowPeriod() {
  const [params, setParams] = useSearchParams();
  const [rows] = useLoad(() => api.get('/shadow').then(r => r.data));
  const [stats] = useLoad(() => api.get('/overview/shadow').then(r => r.data));
  const [settings] = useLoad(() => api.get('/settings').then(r => r.data));
  const [systems] = useLoad(() => api.get('/systems').then(r => r.data));
  const [properties] = useLoad(() => api.get('/people/properties').then(r => r.data));
  const [managers] = useLoad(() => api.get('/people/managers').then(r => r.data));
  const [status, setStatus] = useState('');
  const [mentor, setMentor] = useState('');
  const [selected, setSelected] = useState(Number(params.get('period')) || null);
  const [start, setStart] = useState(!!params.get('start'));
  const [showSettings, setShowSettings] = useState(false);

  if (!rows || !stats || !settings || !systems || !properties || !managers) return <Loading />;
  const shown = rows.filter(r => (!status || r.status === status) && (!mentor || r.mentor_id === Number(mentor)));
  const active = selected || (shown.find(r => r.status !== 'signed_off') || shown[0])?.id;
  const mentors = [...new Map(rows.filter(r => r.mentor_id).map(r => [r.mentor_id, r.mentor_name])).entries()];

  return (
    <div>
      <PageTitle title="Shadow Period" sub="Monitor supported shifts and practical development.">
        <button className="btn btn-ghost" onClick={() => setShowSettings(true)}><Settings size={16} /> Shadow Period Settings</button>
        <button className="btn btn-primary" onClick={() => setStart(true)}>+ Start Shadow Period</button>
      </PageTitle>
      <div className="tiles">
        <StatTile icon="users" value={stats.active} label="Active Shadow Periods" sub="Trainees in supervised shifts" tone="cyan" />
        <StatTile icon="check-circle" value={stats.shiftsCompleted} label="Shifts Completed" sub="Across all trainees" tone="green" />
        <StatTile icon="calendar-clock" value={stats.reviewsDue} label="Reviews Due" sub="Awaiting trainer review" tone="amber" />
        <StatTile icon="award" value={stats.readyForSignoff} label="Ready for Sign-Off" sub="Met shadow period standards" tone="green" />
      </div>
      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0,1fr) 420px' }}>
        <Panel title="Shadow Period Tracking" icon="table" right={
          <div className="toolbar" style={{ margin: 0 }}>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All Statuses</option><option value="in_progress">In Progress</option><option value="review_due">Review Due</option><option value="ready">Ready for Sign-Off</option><option value="signed_off">Signed Off</option>
            </select>
            <select className="form-select" value={mentor} onChange={e => setMentor(e.target.value)}>
              <option value="">All Mentors</option>{mentors.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </div>}>
          {shown.length === 0 ? <EmptyState icon="users" text={rows.length ? 'No matches.' : 'No shadow periods yet.'} action={<button className="btn btn-primary btn-sm" onClick={() => setStart(true)}>Start Shadow Period</button>} /> : (
            <div className="table-scroll">
              <table className="hub-table">
                <thead><tr><th>Employee</th><th>Assigned mentor</th><th>Property</th><th>Shift progress</th><th>Latest review</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id} className={`clickable${r.id === active ? ' selected' : ''}`} onClick={() => setSelected(r.id)}>
                      <td><span className="person"><Avatar name={r.staff_name} size={30} /><span><span className="strong" style={{ display: 'block' }}>{r.staff_name}</span><span className="muted small">Shadow Period ({r.shift_count} Shifts)</span></span></span></td>
                      <td><span className="person"><Avatar name={r.mentor_name} size={26} />{r.mentor_name || '—'}</span></td>
                      <td>{r.property_name ? <span className="person"><Home size={14} />{r.property_name}</span> : <span className="muted">—</span>}</td>
                      <td><ProgressCell pct={(r.shifts_reviewed / r.shift_count) * 100} tone={r.shifts_reviewed >= r.shift_count ? 'green' : 'cyan'} label={`${r.shifts_reviewed} / ${r.shift_count}`} /></td>
                      <td>{r.latest_review_at ? <span className="small">{fmtDate(r.latest_review_at)}<br /><span style={{ color: 'var(--green)' }}>✓ Reviewed</span></span> : <span className="muted">—</span>}</td>
                      <td><StatusPill status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {active ? <ReviewPanel key={active} periodId={active} initialShiftId={Number(params.get('shift')) || null} systems={systems} methodIds={settings.shadow_method_system_ids} properties={properties} managers={managers} />
          : <Panel title="Shadow Shift Review" icon="clipboard-check"><EmptyState text="Select a shadow period to review its shifts." /></Panel>}
      </div>
      {start && <StartShadowModal onClose={(id) => { setStart(false); if (params.get('start')) setParams({}); if (id) setSelected(id); }} />}
      {showSettings && <SettingsModal systems={systems} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
