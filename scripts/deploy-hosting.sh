#!/usr/bin/env bash
# Build the app and deploy it to Firebase Hosting from a machine that keeps no
# credentials on disk — a Claude Code cloud session, or CI.
#
#   FIREBASE_SERVICE_ACCOUNT  (required) the JSON of a service-account key for
#                             the project, stored as an environment variable
#                             (in a Claude Code cloud environment: environment
#                             settings → Edit, the whole file pasted between
#                             single quotes; its line breaks can stay). Never
#                             commit it or paste it into a chat.
#
# The key is written to a private temp file for the length of the deploy and
# removed afterwards, however the script exits. The web config the build needs
# (VITE_FIREBASE_*) comes from the environment or .env.local when present;
# otherwise it is fetched from Firebase with the same key, so a fresh clone
# needs nothing else.
#
# Usage: npm run deploy:hosting            # hosting only (the default)
#        npm run deploy:hosting -- firestore:rules,hosting
set -euo pipefail

cd "$(dirname "$0")/.."
ONLY="${1:-hosting}"
PROJECT="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.firebaserc','utf8')).projects.default)")"

if [ -z "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
  echo "FIREBASE_SERVICE_ACCOUNT is not set." >&2
  echo "Add the service-account key JSON as that environment variable, then start a new session." >&2
  exit 1
fi

# Catch a mangled paste before spending a build on it. The value is never printed.
if ! node -e 'const k = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); process.exit(k.private_key && k.client_email ? 0 : 1)' 2>/dev/null; then
  echo "FIREBASE_SERVICE_ACCOUNT is set but is not a service-account key." >&2
  echo "In the environment settings, paste the whole key file between single quotes:" >&2
  echo "  FIREBASE_SERVICE_ACCOUNT='{ ...the file as downloaded... }'" >&2
  exit 1
fi

# A fresh clone (a new cloud session) has no dependencies installed yet.
[ -d node_modules ] || npm ci

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
chmod 700 "$WORK_DIR"
printf '%s' "$FIREBASE_SERVICE_ACCOUNT" > "$WORK_DIR/key.json"
chmod 600 "$WORK_DIR/key.json"
export GOOGLE_APPLICATION_CREDENTIALS="$WORK_DIR/key.json"

has_web_config() {
  [ -n "${VITE_FIREBASE_API_KEY:-}" ] || grep -qs '^VITE_FIREBASE_API_KEY=.' .env.local
}

if ! has_web_config; then
  echo "Fetching the web app config for $PROJECT…"
  npx firebase apps:sdkconfig WEB --project "$PROJECT" --non-interactive --out "$WORK_DIR/web-config.json" >/dev/null
  # Exported, never printed: the values end up in the built JS either way,
  # but they have no business in a log.
  node -e '
    const fs = require("fs");
    const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const vars = {
      VITE_FIREBASE_API_KEY: c.apiKey,
      VITE_FIREBASE_AUTH_DOMAIN: c.authDomain,
      VITE_FIREBASE_PROJECT_ID: c.projectId,
      VITE_FIREBASE_STORAGE_BUCKET: c.storageBucket,
      VITE_FIREBASE_MESSAGING_SENDER_ID: c.messagingSenderId,
      VITE_FIREBASE_APP_ID: c.appId,
    };
    const lines = Object.entries(vars).map(([name, value]) => {
      if (!value) {
        console.error("The web config has no value for " + name);
        process.exit(1);
      }
      return name + "=" + value;
    });
    fs.writeFileSync(process.argv[2], lines.join("\n") + "\n", { mode: 0o600 });
  ' "$WORK_DIR/web-config.json" "$WORK_DIR/web-config.env"
  while IFS='=' read -r name value; do
    export "$name=$value"
  done < "$WORK_DIR/web-config.env"
fi

# The real database, never demo data or the emulator, whatever .env.local says.
export VITE_DEMO_MODE=false VITE_USE_FIREBASE_EMULATOR=false VITE_STATIC_PREVIEW=false

npm run build
npx firebase deploy --only "$ONLY" --project "$PROJECT" --non-interactive
