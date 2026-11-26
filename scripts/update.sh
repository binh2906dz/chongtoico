#!/usr/bin/env bash
# Cập nhật Chống Tối Cổ sau mỗi lần push lên main:
#   bash /opt/chongtoico/scripts/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chongtoico}"
cd "$APP_DIR"

echo "==> Kéo code mới"
# KHÔNG sửa file trong repo bằng sed — git sẽ báo "local changes would be
# overwritten by merge" ở lần pull sau (B74). Chuẩn hoá LF bằng git:
#   core.autocrlf=input  => checkout giữ nguyên LF từ repo, không tạo CRLF.
git config core.autocrlf input
git pull --ff-only

chmod +x "$APP_DIR"/scripts/*.sh 2>/dev/null || true

echo "==> Build lại và khởi động (migration DB chạy tự động khi app khởi động)"
docker compose up -d --build
docker image prune -f >/dev/null

# The bot service runs outside docker, so it has to be built and restarted
# on its own (B104).
if [ -d "$APP_DIR/bot" ] && command -v systemctl >/dev/null 2>&1; then
  echo "==> Build và khởi động lại dịch vụ bot"
  ( cd "$APP_DIR/bot" && npm install >/dev/null 2>&1 )
  ( cd "$APP_DIR/bot" && npm run build >/dev/null )
  systemctl restart chongtoico-bot.service || true
  sleep 2
  systemctl is-active chongtoico-bot.service || true
fi

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
