import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COL, auth, db, isDemoMode } from '../lib/firebase';
import { can } from '../lib/constants';
import { demoUsers as demoUsersSeed } from '../data/demoData';
import { subscribeDemoUsers } from '../data/demoUsersStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  // The live roster, not the static seed — an edit made on the Users screen
  // (a role change, a deactivation) has to reach the signed-in session too,
  // including when the edit is to the session's own account.
  const [demoRoster, setDemoRoster] = useState(demoUsersSeed);
  const [demoUserId, setDemoUserId] = useState(demoUsersSeed[0]?.id ?? null);
  const [loading, setLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (!isDemoMode) return undefined;
    return subscribeDemoUsers(setDemoRoster);
  }, []);

  useEffect(() => {
    if (isDemoMode) return undefined;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setFirebaseUser(null);
        setLoading(false);
        return;
      }
      // The role lives on the user document, mirrored into a custom claim by a
      // Cloud Function — the claim is what Firestore rules read, the document
      // is what the UI reads. Falling back to the token keeps the app usable
      // if the document read is still cold in the offline cache.
      const snap = await getDoc(doc(db, COL.users, fbUser.uid));
      const claims = (await fbUser.getIdTokenResult()).claims;
      setFirebaseUser({
        uid: fbUser.uid,
        email: fbUser.email,
        name: snap.data()?.name ?? fbUser.displayName ?? fbUser.email,
        role: snap.data()?.role ?? claims.role ?? 'SALES',
        active: snap.data()?.active ?? true,
        townships: snap.data()?.townships ?? [],
        repCode: snap.data()?.repCode ?? null,
      });
      setLoading(false);
    });
  }, []);

  const demoUser = isDemoMode
    ? (demoRoster.find((u) => u.id === demoUserId) ?? demoRoster[0] ?? null)
    : null;
  const user = isDemoMode ? demoUser : firebaseUser;

  const value = useMemo(
    () => ({
      user,
      loading,
      isDemoMode,
      demoUsers: demoRoster,
      /** Demo-only role switcher so the RBAC surface can be reviewed. */
      switchDemoUser: (id) => setDemoUserId(id),
      can: (permission) => can(user?.role, permission),
      logout: () => (isDemoMode ? setDemoUserId(demoUsersSeed[0]?.id ?? null) : signOut(auth)),
    }),
    [user, loading, demoRoster],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
