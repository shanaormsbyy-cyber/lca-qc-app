import React, { useEffect, useState } from 'react';
import api from '../api';

// Location (area) field: type a new area or pick an existing one (Hamilton, Tauranga, ...).
export default function LocationInput({ value, onChange }) {
  const [options, setOptions] = useState([]);
  useEffect(() => { api.get('/staff/locations').then(r => setOptions(r.data)).catch(() => {}); }, []);
  return (
    <div className="form-group">
      <label className="form-label">Location</label>
      <input
        className="form-input"
        list="location-options"
        placeholder="e.g. Hamilton"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id="location-options">
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}
