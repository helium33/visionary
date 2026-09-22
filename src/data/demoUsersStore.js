import { demoUsers as seedUsers } from './demoData';

/**
 * Demo-mode user directory, held in memory for the session.
 *
 * Real mode writes go straight to `users/{uid}` and a Cloud Function mirrors
 * the role into a custom auth claim. Demo mode has no server, so edits made on
 * the Users screen live here instead — a plain mutable store with subscribers,
 * the same shape as every other demo collection, so the Users page, the
 * sidebar role-switcher and the nav's permission filtering all see the same
 * edit the moment it happens rather than only after a reload.
 */
let users = seedUsers.map((user) => ({ ...user }));
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(users);
}

export function getDemoUsers() {
  return users;
}

export function subscribeDemoUsers(cb) {
  listeners.add(cb);
  cb(users);
  return () => listeners.delete(cb);
}

export function updateDemoUser(userId, patch) {
  const before = users.find((user) => user.id === userId) ?? null;
  users = users.map((user) => (user.id === userId ? { ...user, ...patch } : user));
  notify();
  return { before, after: users.find((user) => user.id === userId) ?? null };
}
