#!/usr/bin/env bash
#
# Push the AI-interview (voice) environment variables to the Vercel project
# `digimine-web-sksf` for Production + Preview + Development.
#
# - Reads values straight from apps/web/.env.local and pipes them to the Vercel
#   CLI, so secrets never appear in logs or the terminal.
# - Idempotent: removes any existing value for each (name, target) before
#   adding, so re-running just overwrites.
# - DELIBERATELY excludes dev-only / unsafe flags (NEXT_PUBLIC_USE_FIREBASE_
#   EMULATORS, *_EMULATOR_HOST, BYPASS_PAYMENT_VERIFICATION).
#
# Prereqs: run `npx vercel login` once first (this script checks).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="apps/web/.env.local"
SCOPE="nitkkrhostels"
TARGETS=(production preview development)
VARS=(
  AZURE_SPEECH_KEY
  AZURE_SPEECH_REGION
  AZURE_SPEECH_VOICE
  KOKORO_TTS_URL
  KOKORO_TTS_SECRET
  WHISPER_STT_URL
  WHISPER_STT_SECRET
)

if ! npx --yes vercel whoami --scope "$SCOPE" >/dev/null 2>&1; then
  echo "❌ Not logged in to the Vercel CLI. Run:  npx vercel login" >&2
  exit 1
fi

getval() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

for V in "${VARS[@]}"; do
  VAL="$(getval "$V" || true)"
  if [ -z "${VAL:-}" ]; then
    echo "⚠️  SKIP $V (not found in $ENV_FILE)"
    continue
  fi
  for T in "${TARGETS[@]}"; do
    npx --yes vercel env rm "$V" "$T" --scope "$SCOPE" --yes >/dev/null 2>&1 || true
    if printf '%s' "$VAL" | npx --yes vercel env add "$V" "$T" --scope "$SCOPE" >/dev/null 2>&1; then
      echo "✅ set $V [$T]"
    else
      echo "❌ FAILED $V [$T]" >&2
    fi
  done
done

echo "Done setting env vars. Trigger a redeploy to apply them."
