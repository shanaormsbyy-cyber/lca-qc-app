import { useEffect } from 'react';

/**
 * Calls `fn` every `intervalMs` milliseconds, and also whenever the
 * browser tab becomes visible again (so data is fresh when a manager
 * switches back to the app on any device).
 */
export default function useAutoRefresh(fn, intervalMs = 30000) {
  useEffect(() => {
    const id = setInterval(fn, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') fn(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fn, intervalMs]);
}
