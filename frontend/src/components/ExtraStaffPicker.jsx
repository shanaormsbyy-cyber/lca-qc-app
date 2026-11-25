// "Also cleaned by" — extra team members on a QC check. The check's result counts for all of them.
// value: array of extra staff ids (the main team member is chosen in the select above it).
export default function ExtraStaffPicker({ staff, primaryId, value = [], onChange }) {
  const ids = value.map(String);
  const available = staff.filter(s => String(s.id) !== String(primaryId) && !ids.includes(String(s.id)));
  const nameOf = id => staff.find(s => String(s.id) === String(id))?.name || 'Unknown';
  return (
    <div style={{ marginTop: 8 }}>
      {ids.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {ids.map(id => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 8, background: 'var(--cyan-dim)', border: '1px solid rgba(58,181,217,0.35)', fontSize: 12, fontWeight: 600 }}>
              {nameOf(id)}
              <button type="button" onClick={() => onChange(ids.filter(x => x !== id))} title="Remove"
                style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
            </span>
          ))}
        </div>
      )}
      {primaryId && available.length > 0 && (
        <select className="form-select" value="" onChange={e => e.target.value && onChange([...ids, e.target.value])}>
          <option value="">+ Add another team member (cleaned together)…</option>
          {available.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {ids.length > 0 && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6 }}>The QC result counts for everyone on this check.</div>}
    </div>
  );
}
