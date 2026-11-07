#!/usr/bin/env bash
# Kéo code mới nhất và build lại: bash /opt/chongtoico/scripts/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
