import React, { useEffect, useState } from 'react';
import api from '../api';
import LocationInput from './LocationInput';

const currentArea = () => { try { return localStorage.getItem('location_filter') || 'Hamilton'; } catch { return 'Hamilton'; } };
const parseRooms = p => { try { return JSON.parse(p?.room_config || '{}') || {}; } catch { return {}; } };

// Add / edit a property: name, location and room counts (used to set up QC checks automatically).
export default function PropertyModal({ property, onClose, onSaved }) {
  const [name, setName] = useState(property?.name || '');
  const [location, setLocation] = useState(property ? (property.location || '') : currentArea());
  const [rooms, setRooms] = useState(parseRooms(property));
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Room types come from the checklists' repeatable sections (e.g. Bedroom, Bathroom).
  useEffect(() => {
    api.get('/qc/checklists')
      .then(r => setSections([...new Set(r.data.flatMap(cl => cl.repeatable_sections || []))]))
      .catch(() => {});
  }, []);

  const setCount = (section, val) => setRooms(r => ({ ...r, [section]: Math.max(1, Math.min(20, parseInt(val) || 1)) }));

  const save = async () => {
    if (!name.trim()) return setError('Enter a property name.');
    setSaving(true); setError('');
    // Every room type gets a count (default 1), same as the old Room Config page.
    const room_config = Object.fromEntries(sections.map(s => [s, rooms[s] ?? 1]));
    const body = { name: name.trim(), location, room_config };
    try {
      if (property) await api.put(`/properties/${property.id}`, body);
      else await api.post('/properties', body);
      onSaved && (await onSaved());
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not save the property.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{property ? 'Edit Property' : 'Add Property'}</div>
        <div className="form-group">
          <label className="form-label">Property Name</label>
          <input className="form-input" value={name} autoFocus onChange={e => setName(e.target.value)} />
        </div>
        <LocationInput value={location} onChange={setLocation} />

        {sections.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.08))', margin: '18px 0 12px', paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Rooms</div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>How many of each — QC checks for this property are set up with these automatically.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
              {sections.map(s => (
                <div className="form-group" key={s} style={{ marginBottom: 0 }}>
                  <label className="form-label">{s}s</label>
                  <input className="form-input" type="number" min="1" max="20"
                    value={rooms[s] ?? 1} onChange={e => setCount(s, e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
        <div className="flex gap-3 mt-4" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
