// Gives an existing sign-in account its role: sets the custom auth claim that
// firestore.rules reads (request.auth.token.role) and upserts users/{uid}, which
// the UI reads. Stands in for the claim-mirroring Cloud Function the schema doc
// describes, which isn't built yet — without a claim, every rule denies.
//
//   npm run set-role -- <email> <ROLE> ["Display name"]
//
// Credentials: a service account key saved as ./service-account.json, or
// GOOGLE_APPLICATION_CREDENTIALS. Against the emulators, set
// FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT instead.
import { existsSync, readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// The literal strings firestore.rules compares the claim against.
const ROLES = ['ADMIN', 'ACCOUNTANT', 'SALES', 'WAREHOUSE'];
const KEY_FILE = 'service-account.json';

const [email, role, name] = process.argv.slice(2);
if (!email || !ROLES.includes(role)) {
  console.error(`Usage: npm run set-role -- <email> <${ROLES.join('|')}> ["Display name"]`);
  process.exit(1);
}

const onEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
if (onEmulator || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  initializeApp();
} else if (existsSync(KEY_FILE)) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_FILE, 'utf8'))) });
} else {
  console.error(
    `No credentials. In the Firebase console open Project settings → Service accounts → ` +
      `Generate new private key, and save the file as ${KEY_FILE} in this folder. ` +
      `Keep it private — it has full admin access to the project.`,
  );
  process.exit(1);
}

const auth = getAuth();
let user;
try {
  user = await auth.getUserByEmail(email);
} catch (err) {
  if (err.code !== 'auth/user-not-found') throw err;
  console.error(
    `No account for ${email}. Add it in the Firebase console (Authentication → Users → ` +
      `Add user), or have them sign in with Google once, then run this again.`,
  );
  process.exit(1);
}

await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role });

const ref = getFirestore().doc(`users/${user.uid}`);
const existing = (await ref.get()).data();
await ref.set(
  {
    email: user.email,
    name: name ?? existing?.name ?? user.displayName ?? user.email,
    role,
    active: existing?.active ?? true,
    ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);

// An ID token already issued keeps its old claims until it refreshes (up to an hour).
console.log(`${email} is now ${role}. If they're signed in, they need to sign out and back in.`);
