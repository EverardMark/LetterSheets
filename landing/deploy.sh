#!/usr/bin/env bash
# Upload the static landing pages to the EC2 host over SSH.
#
# Usage:
#   SERVER=ec2-user@1.2.3.4 KEY=~/.ssh/landing.pem ./deploy.sh
#
# One-time server setup is documented in DEPLOY.md.

set -euo pipefail

SERVER="${SERVER:?set SERVER=ec2-user@<public-ip-or-dns>}"
KEY="${KEY:?set KEY=path/to/your-key.pem}"
REMOTE_DIR="${REMOTE_DIR:-/srv/landing}"

HERE="$(cd "$(dirname "$0")" && pwd)"

echo "Uploading landing pages to ${SERVER}:${REMOTE_DIR} ..."
rsync -avz --delete \
  -e "ssh -i ${KEY}" \
  "${HERE}"/*.html \
  "${SERVER}:${REMOTE_DIR}/"

echo "Done. Live at your \$LANDING_DOMAIN once DNS + Caddy are up."
