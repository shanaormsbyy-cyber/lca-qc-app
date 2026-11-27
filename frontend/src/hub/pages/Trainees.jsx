import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Trash2 } from 'lucide-react';
import deleteTeamMember from '../lib/deleteMember';
import api from '../api';
import useLoad from '../hooks/useLoad';
import { PageTitle, Panel, ProgressCell, StatusPill, Avatar, EmptyState, Loading, Modal, Icon } from '../components/ui';
import { NewHireSetupModal, AlreadyTrainedModal } from '../components/modals';

export default function Trainees() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, reload] = useLoad(() => api.get('/trainees').then(r => r.data));
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(params.get('add') ? 'choose' : null);
  const close = () => { setModal(null); if (params.get('add')) setParams({}); };

  if (!rows) return <Loading />;
  const shown = rows.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageTitle title="Trainees" sub="Everyone currently in onboarding or on a training plan.">
        <button className="btn btn-secondary" onClick={() => setModal('trained')}>Mark as already trained</button>
        <button className="btn btn-primary" onClick={() => setModal('choose')}>+ Add Trainee</button>
      </PageTitle>
      <Panel>
        <div className="toolbar"><input className="form-input" placeholder="Search trainees…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {shown.length === 0 ? <EmptyState icon="users" text={rows.length ? 'No matches.' : 'No one is in training yet. Add a trainee to get started.'} /> : (
          <div className="table-scroll">
            <table className="hub-table">
              <thead><tr><th>Trainee</th><th>Current stage</th><th>Progress</th><th>Trainer</th><th>Plans</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.staff_id} className="clickable" onClick={() => navigate(`/training-hub/trainees/${r.staff_id}`)}>
                    <td><span className="person"><Avatar name={r.name} /><span className="strong">{r.name}</span></span></td>
                    <td>{r.stage_name === '—' ? <span className="muted">—</span> : <StatusPill status="in_progress" label={r.stage_name} />}</td>
                    <td>{r.progress != null ? <ProgressCell pct={r.progress} /> : <span className="muted">—</span>}</td>
                    <td>{r.trainer_name || <span className="muted">—</span>}</td>
                    <td>{r.active_plans}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-btn danger" title={`Delete ${r.name}`}
                        onClick={async e => { e.stopPropagation(); if (await deleteTeamMember(r.staff_id, r.name)) reload(); }}>
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={16} className="chev" style={{ marginLeft: 6, verticalAlign: 'middle' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modal === 'choose' && (
        <Modal title="Add Trainee" onClose={close}>
          <div className="stack">
            <button className="mini-card" onClick={() => setModal('newhire')}><Icon name="user-plus" className="mini-card-icon" size={26} />
              <div><div className="strong">New hire</div><div className="muted small">Start onboarding: setup checklist, required skills and a draft training plan.</div></div></button>
            <button className="mini-card" onClick={() => setModal('trained')}><Icon name="badge-check" className="mini-card-icon" size={26} />
              <div><div className="strong">Existing cleaner — already trained</div><div className="muted small">Record them as signed off and competent, then flag skills or start a plan.</div></div></button>
            <button className="mini-card" onClick={() => navigate('/training-hub/plans/new')}><Icon name="calendar-plus" className="mini-card-icon" size={26} />
              <div><div className="strong">Put someone on a training plan</div><div className="muted small">Development, PIP, cross-training or reassessment.</div></div></button>
          </div>
        </Modal>
      )}
      {modal === 'newhire' && <NewHireSetupModal onClose={close} />}
      {modal === 'trained' && <AlreadyTrainedModal onClose={close} />}
    </div>
  );
}
