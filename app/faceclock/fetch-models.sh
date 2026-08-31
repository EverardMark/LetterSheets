#!/usr/bin/env bash
#
# Fetch the face models into ./models.
#
# Run this on a BUILD machine, not on a kiosk — the kiosk gets the models as
# part of the packaged app (see README.md), and client kiosks deliberately
# carry no toolchain.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS="$DIR/models"
mkdir -p "$MODELS"

BUFFALO_URL="https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip"

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: $1 is required" >&2; exit 1; }; }
need curl
need unzip

# ---------------------------------------------------------------------------
# Detector + recogniser (InsightFace buffalo_s)
#
# The same pair app/timeclock/facebridge uses. Keeping them identical is what
# lets a face enrolled on one kiosk match on the other: embeddings are only
# comparable within the model that produced them.
# ---------------------------------------------------------------------------
if [ -f "$MODELS/det_500m.onnx" ] && [ -f "$MODELS/w600k_mbf.onnx" ]; then
  echo "buffalo_s models already present, skipping."
else
  echo "Downloading buffalo_s..."
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  curl -fL --retry 3 -o "$tmp/buffalo_s.zip" "$BUFFALO_URL"
  unzip -q -o "$tmp/buffalo_s.zip" -d "$tmp/extracted"

  # The archive layout has moved between releases, so locate the files rather
  # than assuming a path.
  det="$(find "$tmp/extracted" -name 'det_500m.onnx' -print -quit)"
  rec="$(find "$tmp/extracted" -name 'w600k_mbf.onnx' -print -quit)"

  [ -n "$det" ] || { echo "error: det_500m.onnx not found in the archive" >&2; exit 1; }
  [ -n "$rec" ] || { echo "error: w600k_mbf.onnx not found in the archive" >&2; exit 1; }

  cp "$det" "$MODELS/det_500m.onnx"
  cp "$rec" "$MODELS/w600k_mbf.onnx"
  echo "Installed det_500m.onnx and w600k_mbf.onnx"
fi

# ---------------------------------------------------------------------------
# Anti-spoof
#
# Not downloadable as ONNX: the reference weights (MiniFASNet, from
# minivision-ai/Silent-Face-Anti-Spoofing) ship as PyTorch .pth and must be
# exported. This script will not silently proceed without it, because face
# sign-in refuses to run when the model is absent — that refusal is the point,
# not a bug to work around.
# ---------------------------------------------------------------------------
if [ -f "$MODELS/antispoof.onnx" ]; then
  echo "antispoof.onnx present."
else
  cat <<'EOF'

  ------------------------------------------------------------------
  antispoof.onnx is NOT installed.

  Face sign-in will stay disabled until it is: without a liveness
  check a printed photo defeats the kiosk, which at a time clock is
  precisely the buddy-punching fraud the biometric is there to stop.

  To produce it, see models/README.md — export MiniFASNet from
  Silent-Face-Anti-Spoofing to ONNX at input 1x3x80x80.

  Until then the kiosk still works: staff clock in by tapping their
  name, exactly as with no camera attached.
  ------------------------------------------------------------------

EOF
fi

echo
echo "Models in $MODELS:"
ls -lh "$MODELS"/*.onnx 2>/dev/null || echo "  (none)"
