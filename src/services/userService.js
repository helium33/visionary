import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, COL, db, isDemoMode } from '../lib/firebase';
import { demoSettings } from '../data/demoData';
import { updateDemoUser } from '../data/demoUsersStore';
import { ROLES } from '../lib/constants';
import { logAudit } from './auditService';
import { tNow } from '../i18n/translate';

/**
 * ---------------------------------------------------------------------------
 * USER ADMINISTRATION.
 * ---------------------------------------------------------------------------
 * Two writes here are deliberately NOT simple `updateDoc` calls:
 *
 *  - A role change writes `users/{uid}.role` only. The custom auth claim that
 *    Firestore rules actually gate on is mirrored by a Cloud Function
 *    triggered on that write — the client never sets a claim directly, or a
 *    signed-in session could hand itself admin. The write here is the request;
 *    the claim is the grant, and it lands seconds later, server-side.
 *  - The master password is verified and rotated by a callable, the same
 *    pattern as `requestCreditOverride`. `settings/{docId}` denies client
 *    reads and writes outright (see firestore.rules) specifically so the
 *    hash — and the ability to change it — never touches the browser.
 */

export async function updateUserRole({ userId, role, actor }) {
  if (!ROLES[role]) {
    return { ok: false, message: tNow('admin.err.unknownRole', { role }) };
  }

  if (isDemoMode) {
    const { before, after } = updateDemoUser(userId, { role });
    await logAudit({
      actor,
      action: 'USER_ROLE_CHANGE',
      entity: COL.users,
      entityId: userId,
      before: { role: before?.role },
      after: { role: after?.role },
    });
    return { ok: true, user: after };
  }

  await updateDoc(doc(db, COL.users, userId), { role, updatedAt: serverTimestamp() });
  await logAudit({
    actor,
    action: 'USER_ROLE_CHANGE',
    entity: COL.users,
    entityId: userId,
    after: { role },
  });
  return { ok: true };
}

export async function setUserActive({ userId, active, actor }) {
  if (isDemoMode) {
    const { after } = updateDemoUser(userId, { active });
    await logAudit({
      actor,
      action: 'USER_STATUS_CHANGE',
      entity: COL.users,
      entityId: userId,
      after: { active },
    });
    return { ok: true, user: after };
  }

  await updateDoc(doc(db, COL.users, userId), { active, updatedAt: serverTimestamp() });
  await logAudit({
    actor,
    action: 'USER_STATUS_CHANGE',
    entity: COL.users,
    entityId: userId,
    after: { active },
  });
  return { ok: true };
}

/** Rep-specific fields: the code that prefixes voucher numbers, and the
 * commission rate the Reports page pays them. */
export async function updateUserProfile({ userId, patch, actor }) {
  if (isDemoMode) {
    const { after } = updateDemoUser(userId, patch);
    await logAudit({ actor, action: 'USER_ROLE_CHANGE', entity: COL.users, entityId: userId, after: patch, reason: 'Profile updated' });
    return { ok: true, user: after };
  }

  await updateDoc(doc(db, COL.users, userId), { ...patch, updatedAt: serverTimestamp() });
  await logAudit({ actor, action: 'USER_ROLE_CHANGE', entity: COL.users, entityId: userId, after: patch, reason: 'Profile updated' });
  return { ok: true };
}

/**
 * Rotate the credit-override master password. Requires the CURRENT password,
 * so a session left open at an unlocked desk cannot silently lock everyone
 * else out — whoever rotates it has to prove they already hold it.
 */
export async function rotateMasterPassword({ currentPassword, newPassword, actor }) {
  if (!newPassword || newPassword.length < 4) {
    return { ok: false, message: tNow('admin.err.passwordTooShort') };
  }

  if (isDemoMode) {
    if (currentPassword !== demoSettings.masterPasswordHint) {
      return { ok: false, message: tNow('admin.err.currentIncorrect') };
    }
    demoSettings.masterPasswordHint = newPassword;
    await logAudit({ actor, action: 'MASTER_PASSWORD_ROTATE', entity: COL.settings, entityId: 'config' });
    return { ok: true };
  }

  try {
    const callable = httpsCallable(getFunctions(app), 'rotateMasterPassword');
    await callable({ currentPassword, newPassword });
    await logAudit({ actor, action: 'MASTER_PASSWORD_ROTATE', entity: COL.settings, entityId: 'config' });
    return { ok: true };
  } catch (error) {
    const code = error?.code === 'functions/permission-denied' ? 'BAD_PASSWORD' : 'ERROR';
    return {
      ok: false,
      code,
      message:
        code === 'BAD_PASSWORD'
          ? tNow('admin.err.currentIncorrect')
          : tNow('admin.err.rotateUnreachable'),
    };
  }
}
