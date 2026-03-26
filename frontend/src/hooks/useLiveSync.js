import { useEffect } from 'react';

/**
 * Subscribe to server-sent change events.
 * Calls `onUpdate` whenever another client (or this client) mutates data.
 * Pass the page's `load` function as `onUpdate` to auto-refresh.
 */
export default function useLiveSync(onUpdate) {
  useEffect(() => {
    const token = localStorage.getItem('lca_token');
    const url = token ? `/api/events?t=${token}` : '/api/events';
    const es = new EventSource(url);

    es.addEventListener('change', () => {
      onUpdate();
    });

    // Reconnect silently on error (EventSource does this automatically)
    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
