import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { fmtDate } from '../utils';

function compressImage(file, maxWidth = 1400, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function HeatPumpDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [form, setForm] = useState({ due_date: '', last_completed: '', notes: '' });
  const [showDelete, setShowDelete] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/heatpump/records/${id}`);
      setRecord(data);
      setForm({ due_date: data.due_date || '', last_completed: data.last_completed || '', notes: data.notes || '' });
    } catch {
      navigate('/heatpump');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/heatpump/records/${id}`, form);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async () => {
    setCompleting(true);
    try {
      await api.post(`/heatpump/records/${id}/complete`);
      await load();
    } finally {
      setCompleting(false);
    }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append('photo', blob, file.name);
      await api.post(`/heatpump/records/${id}/photos`, fd);
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deletePhoto = async (photoId) => {
    await api.delete(`/heatpump/photos/${photoId}`);
    load();
  };

  const deleteRecord = async () => {
    await api.delete(`/heatpump/records/${id}`);
    navigate('/heatpump');
  };

  if (loading) return <div className="loading"><div className="spinner" /><span>Loading...</span></div>;
  if (!record) return null;

  const dueStatus = (() => {
    if (!record.due_date) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const due = new Date(record.due_date + 'T00:00:00');
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { cls: 'badge-red', label: `${Math.abs(diff)}d overdue` };
    if (diff <= 7) return { cls: 'badge-amber', label: `Due in ${diff}d` };
    return { cls: 'badge-green', label: `${diff}d left` };
  })();

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <button className="btn btn-sm" onClick={() => navigate('/heatpump')} style={{ marginBottom: 8 }}>Back</button>
          <h1 className="page-title">{record.property_name}</h1>
          <p className="page-subtitle">Heat Pump Filter Clean</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {dueStatus && <span className={`badge ${dueStatus.cls}`} style={{ fontSize: 14, padding: '6px 14px' }}>{dueStatus.label}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Details Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Details</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 0 4px' }}>
            <div>
              <label className="form-label">Due Date</label>
              <input type="date" className="form-input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Last Completed</label>
              <input type="date" className="form-input" value={form.last_completed} onChange={e => setForm(f => ({ ...f, last_completed: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this heat pump..." />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button className="btn" onClick={markComplete} disabled={completing} style={{ background: 'var(--green)', color: '#fff' }}>
                {completing ? 'Completing...' : 'Mark as Cleaned'}
              </button>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 16, paddingTop: 12 }}>
            <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => setShowDelete(true)}>Remove from tracker</button>
          </div>
        </div>

        {/* Photos Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Photos</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{record.photos?.length || 0} photos</span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handlePhoto} style={{ display: 'none' }} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </button>
          </div>

          {record.photos?.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              {record.photos.map(p => (
                <div key={p.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--glass)', border: '1px solid var(--glass-border)' }}>
                  <img
                    src={`/uploads/${p.filename}`}
                    alt={p.original_name}
                    style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{fmtDate(p.uploaded_at?.slice(0, 10))}</span>
                    <button onClick={() => deletePhoto(p.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: 2 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--t3)', fontSize: 13 }}>No photos uploaded yet. Take a photo of the filter after cleaning.</p>
          )}
        </div>
      </div>

      {showDelete && (
        <div className="modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 8 }}>Remove Property</h2>
            <p style={{ color: 'var(--t2)', marginBottom: 16 }}>Remove <strong>{record.property_name}</strong> from the heat pump tracker? This will delete all associated photos.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowDelete(false)}>Cancel</button>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff' }} onClick={deleteRecord}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
