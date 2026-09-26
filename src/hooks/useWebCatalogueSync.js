import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { syncWebCatalogue } from '../services/webCatalogueService';

const SESSION_KEY = 'pos-web-catalogue-sync';

/**
 * Keeps the Plan B web app's catalogue in step with the POS: when an ADMIN
 * opens the POS, new or changed frames are copied across (see
 * `domain/webCatalogue.js`). Once per account per browser tab — it reads
 * every product, and the list changes a few times a week, not a minute.
 * Silent: a failed sync (offline) simply runs again next session.
 */
export function useWebCatalogueSync() {
  const { user, isDemoMode } = useAuth();
  const uid = user?.uid;
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (isDemoMode || !isAdmin || !uid) return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === uid) return;
    } catch {
      /* Private mode: sync anyway. */
    }

    syncWebCatalogue()
      .then(() => {
        try {
          window.sessionStorage.setItem(SESSION_KEY, uid);
        } catch {
          /* nothing to remember it in */
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('[web catalogue sync]', error);
      });
  }, [isDemoMode, isAdmin, uid]);
}
