import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
    // try/catch, not just letting it propagate: registering this listener is
    // when Firebase Auth reads its persisted session, which can throw
    // synchronously on a host that restricts storage (a sandboxed preview
    // iframe, a private window) rather than rejecting a promise. AuthProvider
    // wraps the entire app, so an uncaught throw here — not just on the login
    // page — would blank every screen, every time, on such a host.
    try {
      return onAuthStateChanged(auth, async (fbUser) => {
        if (!fbUser) {
          setFirebaseUser(null);
          setLoading(false);
          return;
        }
        // The role comes from the token's custom claim because that is what
        // firestore.rules check — a role read from users/{uid} could disagree
        // with the rules and leave every screen loading into permission errors.
        // No claim means no access yet (role null), never a guessed role. A
        // token issued before an admin granted the role doesn't carry it, so
        // refresh once before concluding there is none.
        let { claims } = await fbUser.getIdTokenResult();
        if (!claims.role) {
          try {
            ({ claims } = await fbUser.getIdTokenResult(true));
          } catch {
            // Offline: keep the cached token's claims.
          }
        }
        setFirebaseUser({
          uid: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName ?? fbUser.email,
          role: claims.role ?? null,
          active: true,
          townships: [],
          repCode: null,
        });
        setLoading(false);

        // Profile details live on users/{uid}. Read after the first render,
        // not before it — the role that gates everything is already known,
        // and on a slow connection this read alone can take seconds.
        getDoc(doc(db, COL.users, fbUser.uid))
          .then((snap) => {
            const data = snap.data();
            if (!data) return;
            setFirebaseUser((current) =>
              current?.uid === fbUser.uid
                ? {
                    ...current,
                    name: data.name ?? current.name,
                    active: data.active ?? true,
                    townships: data.townships ?? [],
                    repCode: data.repCode ?? null,
                  }
                : current,
            );
          })
          .catch(() => {});
      });
    } catch {
      // No session to restore in this environment. Stop showing the loading
      // state so the app settles on "signed out" (the login screen) instead
      // of spinning forever with no listener ever going to call setLoading.
      setLoading(false);
      return undefined;
    }
  }, []);

  const demoUser = isDemoMode
    ? (demoRoster.find((u) => u.id === demoUserId) ?? demoRoster[0] ?? null)
    : null;
  const user = isDemoMode ? demoUser : firebaseUser;

  /** Re-reads the role after an admin grants one, without signing out. */
  const refreshAccess = useCallback(async () => {
    const fbUser = auth?.currentUser;
    if (!fbUser) return null;
    const { claims } = await fbUser.getIdTokenResult(true);
    const role = claims.role ?? null;
    setFirebaseUser((current) => (current ? { ...current, role } : current));
    return role;
  }, []);

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
      refreshAccess,
    }),
    [user, loading, demoRoster, refreshAccess],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
