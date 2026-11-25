import { useEffect, useRef } from 'react';
import { TOKEN_KEY } from '../api';

// One shared EventSource for the whole app: browsers allow only ~6 connections
// per host, so one stream per component would starve normal API requests.
const listeners = new Set();
let source = null;
let timer = null;

function ensureSource() {
  if (source) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  source = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
  source.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach(fn => fn()), 150);
  });
}

function releaseSource() {
  if (listeners.size === 0 && source) { source.close(); source = null; }
}

/** Re-run `onUpdate` whenever any client changes data (server-sent events). */
export default function useLiveSync(onUpdate) {
  const ref = useRef(onUpdate);
  ref.current = onUpdate;
  useEffect(() => {
    const fn = () => ref.current && ref.current();
    listeners.add(fn);
    ensureSource();
    return () => { listeners.delete(fn); releaseSource(); };
  }, []);
}
