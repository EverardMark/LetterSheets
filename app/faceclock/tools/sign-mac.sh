#!/usr/bin/env bash
#
# Ad-hoc sign the packaged macOS app.
#
# Run automatically after `npm run package:mac` (see the postpackage:mac hook).
#
# Packaging renames the binary and rewrites Info.plist, which invalidates the
# signature Electron shipped with. macOS will not show the camera permission
# prompt for an app whose signature does not verify — it refuses in about 20ms
# with no dialog at all, which looks exactly like a broken camera. Signing is
# therefore part of the build, not a step to remember.
#
# This is an AD-HOC signature: fine for local use and for a kiosk you install
# yourself. Distributing outside this machine needs a Developer ID identity and
# notarisation; set IDENTITY to use one.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:-$DIR/dist/LetterSheetsFaceClock-darwin-arm64/LetterSheetsFaceClock.app}"
IDENTITY="${IDENTITY:--}"   # "-" means ad-hoc

if [ ! -d "$APP" ]; then
  echo "sign-mac: no app bundle at $APP" >&2
  echo "sign-mac: run 'npm run package:mac' first" >&2
  exit 1
fi

echo "signing $(basename "$APP") with identity '${IDENTITY}'"

# Inside-out: nested code must be signed before whatever contains it, or the
# outer signature is invalidated the moment the inner one is written.
codesign --force --sign "$IDENTITY" --timestamp=none \
  "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A" >/dev/null

for helper in "$APP/Contents/Frameworks/"*.app; do
  [ -d "$helper" ] || continue
  codesign --force --deep --sign "$IDENTITY" "$helper" >/dev/null
done

codesign --force --deep --sign "$IDENTITY" "$APP" >/dev/null

if codesign --verify --deep --strict "$APP" 2>/dev/null; then
  echo "sign-mac: signature verifies"
else
  echo "sign-mac: SIGNATURE DOES NOT VERIFY — the camera prompt will not appear" >&2
  codesign --verify --deep --strict "$APP" || true
  exit 1
fi
