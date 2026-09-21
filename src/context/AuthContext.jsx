import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, auth, db, isDemoMode } from '../lib/firebase';
import { can } from '../lib/constants';
import { demoUsers } from '../data/demoData';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(isDemoMode ? demoUsers[0] : null);
  const [loading, setLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode) return undefined;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      // The role lives on the user document, mirrored into a custom claim by a
      // Cloud Function — the claim is what Firestore rules read, the document
      // is what the UI reads. Falling back to the token keeps the app usable
      // if the document read is still cold in the offline cache.
      const snap = await getDoc(doc(db, COL.users, fbUser.uid));
      const claims = (await fbUser.getIdTokenResult()).claims;
      setUser({
        uid: fbUser.uid,
        email: fbUser.email,
        name: snap.data()?.name ?? fbUser.displayName ?? fbUser.email,
        role: snap.data()?.role ?? claims.role ?? 'SALES',
        townships: snap.data()?.townships ?? [],
        repCode: snap.data()?.repCode ?? null,
      });
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isDemoMode,
      demoUsers,
      /** Demo-only role switcher so the RBAC surface can be reviewed. */
      switchDemoUser: (id) => setUser(demoUsers.find((u) => u.id === id) ?? demoUsers[0]),
      can: (permission) => can(user?.role, permission),
      logout: () => (isDemoMode ? setUser(demoUsers[0]) : signOut(auth)),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
