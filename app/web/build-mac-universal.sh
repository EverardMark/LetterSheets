#!/usr/bin/env bash
# Build a UNIVERSAL (Intel x86_64 + Apple Silicon arm64) macOS .dmg of the
# LetterSheets desktop app, ad-hoc signed so it launches without a paid Apple
# Developer ID (recipients still do a one-time "Open Anyway" — see the bundled
# "READ ME FIRST - macOS.txt").
#
# Usage:
#   ./build-mac-universal.sh
#
# Output:
#   release/LetterSheets-<version>-universal.dmg
#   release/READ ME FIRST - macOS.txt   (recipient instructions, ship alongside)
set -euo pipefail

cd "$(dirname "$0")"

# Must be built on macOS — a .dmg / universal app cannot be produced elsewhere.
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: macOS builds can only be produced on macOS (this is $(uname -s))." >&2
  exit 1
fi

# Warn if the API switch is pointed at localhost — distributed copies almost
# always want DEV_MODE=false (remote server), or they'll try to reach the
# recipient's own machine.
if grep -qE '^\s*const\s+DEV_MODE\s*=\s*true' vite.config.js; then
  echo "⚠️  WARNING: DEV_MODE = true in vite.config.js — this build will point"
  echo "   API requests at localhost. For a build you hand out, set DEV_MODE = false."
  read -r -p "   Continue anyway? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

echo "Installing dependencies (if needed)..."
npm install --no-audit --no-fund

echo "Building universal macOS app (this downloads both Intel + Apple Silicon"
echo "Electron binaries and merges them — it can take a few minutes)..."
npm run electron:build:mac

DMG=$(ls -t release/*-universal.dmg 2>/dev/null | head -1 || true)
if [[ -z "${DMG:-}" ]]; then
  echo "Error: build finished but no *-universal.dmg was produced." >&2
  exit 1
fi

echo
echo "✅ Done."
echo "   App:          $DMG"
echo "   Instructions: release/READ ME FIRST - macOS.txt"
echo
echo "Verifying the app is universal and launchable..."
APP="release/mac-universal/LetterSheets.app"
if [[ -d "$APP" ]]; then
  echo -n "   Architectures: "; lipo -archs "$APP/Contents/MacOS/LetterSheets"
  codesign --verify --deep --strict "$APP" \
    && echo "   Signature:     ad-hoc, verified — launches on Intel + Apple Silicon" \
    || echo "   Signature:     WARNING — verification failed"
fi
echo
echo "Distribute BOTH files together (the .dmg and the READ ME txt)."
