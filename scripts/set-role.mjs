// Gives an existing sign-in account its role: sets the custom auth claim that
// firestore.rules reads (request.auth.token.role) and upserts users/{uid}, which
// the UI reads. Stands in for the claim-mirroring Cloud Function the schema doc
// describes, which isn't built yet — without a claim, every rule denies.
//
//   npm run set-role -- <email> <ROLE> ["Display name"]
//   npm run set-role -- <email> SHOP <shopId> ["Display name"]
//
// SHOP is a customer account for the Plan B web app: it carries the id of the
// shops/{shopId} document it belongs to, and the shared firestore.rules give
// it that shop's own account and nothing else. It never gets into the POS.
//
// Credentials: a service account key saved as ./service-account.json, or
// GOOGLE_APPLICATION_CREDENTIALS. Against the emulators, set
// FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT instead.
import { existsSync, readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// The literal strings firestore.rules compares the claim against.
const ROLES = ['ADMIN', 'ACCOUNTANT', 'SALES', 'WAREHOUSE', 'SHOP'];
const KEY_FILE = 'service-account.json';

const [email, role, ...rest] = process.argv.slice(2);
// A SHOP account names its shop before the optional display name.
const shopId = role === 'SHOP' ? rest.shift() : undefined;
const [name] = rest;
if (!email || !ROLES.includes(role) || (role === 'SHOP' && !shopId)) {
  console.error(
    `Usage: npm run set-role -- <email> <${ROLES.filter((r) => r !== 'SHOP').join('|')}> ["Display name"]\n` +
      `       npm run set-role -- <email> SHOP <shopId> ["Display name"]`,
  );
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

const db = getFirestore();
if (shopId && !(await db.doc(`shops/${shopId}`).get()).exists) {
  console.error(`No shops/${shopId} document. Use the shop's Firestore document id, not its SH- code.`);
  process.exit(1);
}

// shopId is dropped for staff: a rep who used to be a shop account must not
// keep a claim that points the shop rules at somebody's account.
const { shopId: _previousShop, ...otherClaims } = user.customClaims ?? {};
await auth.setCustomUserClaims(user.uid, { ...otherClaims, role, ...(shopId ? { shopId } : {}) });

const ref = db.doc(`users/${user.uid}`);
const existing = (await ref.get()).data();
await ref.set(
  {
    email: user.email,
    name: name ?? existing?.name ?? user.displayName ?? user.email,
    role,
    shopId: shopId ?? null,
    active: existing?.active ?? true,
    ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);

// An ID token already issued keeps its old claims until it refreshes (up to an hour).
console.log(
  `${email} is now ${role}${shopId ? ` for shop ${shopId}` : ''}. ` +
    `If they're signed in, they need to sign out and back in.`,
);
