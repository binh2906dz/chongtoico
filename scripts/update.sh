#!/usr/bin/env bash
# Cập nhật Chống Tối Cổ sau mỗi lần push lên main:
#   bash /opt/chongtoico/scripts/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chongtoico}"
cd "$APP_DIR"

echo "==> Kéo code mới"
git pull --ff-only

# Script .sh phải là LF: nếu không, bash báo "invalid option name" (B69).
# .gitattributes đã đặt eol=lf, nhưng chuẩn hoá lại cho chắc (B69/B74).
find "$APP_DIR" -name '*.sh' -type f -exec sed -i 's/\r$//' {} +
chmod +x "$APP_DIR"/scripts/*.sh

echo "==> Build lại và khởi động (migration DB chạy tự động khi app khởi động)"
docker compose up -d --build
docker image prune -f >/dev/null

APP_PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-8090}"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
    echo "OK: ứng dụng đang chạy."
    docker compose ps
    exit 0
  fi
  sleep 2
done
echo "Ứng dụng chưa lên sau 2 phút. Xem log: docker compose logs --tail 100 app" >&2
exit 1
