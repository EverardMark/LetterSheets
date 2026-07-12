#!/usr/bin/env bash
# Build a static Linux binary of the LetterSheets server.
# Mirrors the flags used in Dockerfile so local builds match container builds.
#
# Usage:
#   ./build-linux.sh              # amd64 -> dist/lettersheets-linux-amd64
#   GOARCH=arm64 ./build-linux.sh # arm64 -> dist/lettersheets-linux-arm64
set -euo pipefail

cd "$(dirname "$0")"

GOARCH="${GOARCH:-amd64}"
OUT="dist/lettersheets-linux-${GOARCH}"

echo "Building ${OUT} (GOOS=linux GOARCH=${GOARCH}) ..."
CGO_ENABLED=0 GOOS=linux GOARCH="${GOARCH}" \
  go build -trimpath -ldflags="-s -w" -o "${OUT}" ./cmd/server

echo "Done: ${OUT}"
