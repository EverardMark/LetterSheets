#!/usr/bin/env bash
# Package facebridge into a single binary.
#
# Run this on a machine matching the TARGET architecture — PyInstaller does not
# cross-compile. For the Pi kiosk that means building on an arm64 Linux box (a
# Pi, an arm64 VM, or a container under qemu), NOT on the kiosk itself: the
# kiosk keeps its "runtime artifacts only" rule, so it gets the output of this
# script and nothing else.
#
#   ./build.sh          -> dist/facebridge
#
# Copy dist/facebridge to /usr/local/bin/facebridge on the kiosk, along with
# models/antispoof.onnx and facebridge.service. See README.md.
set -euo pipefail

cd "$(dirname "$0")"

VENV="${VENV:-.venv}"
if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

pip install --upgrade pip >/dev/null
pip install -r requirements.txt pyinstaller

# Fail fast on the pure logic before spending minutes on packaging.
python facebridge.py --selftest

# insightface and onnxruntime both load data files at runtime that PyInstaller's
# static analysis does not see, hence the explicit collect-all.
pyinstaller \
  --onefile \
  --name facebridge \
  --collect-all insightface \
  --collect-all onnxruntime \
  --hidden-import websockets \
  facebridge.py

echo
echo "built: dist/facebridge"
file dist/facebridge || true
