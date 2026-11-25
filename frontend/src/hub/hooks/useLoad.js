import { useCallback, useEffect, useState } from 'react';
import useLiveSync from './useLiveSync';

/** Load data with an async function; re-load on live-sync events and when deps change. */
export default function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => fn().then(d => { setData(d); setError(null); }).catch(e => setError(e)), deps);
  useEffect(() => { load(); }, [load]);
  useLiveSync(load);
  return [data, load, error];
}
