#!/usr/bin/env bash
# Nạp TOÀN BỘ dữ liệu (CSDL + bài viết + media) từ máy dev lên VPS, thay thế hệ thống cũ.
#
# Dùng trên máy dev (bash):
#   bash scripts/deploy-with-data.sh <user@host> [domain]
#
# Ví dụ:
#   bash scripts/deploy-with-data.sh root@1.2.3.4 chongtoico.vn
#
# Script làm (theo đúng thứ tự, dừng ngay nếu bước nào lỗi):
#   1. Kiểm tra kết nối SSH + Docker trên VPS.
#   2. Cài / cập nhật code trên VPS (/opt/chongtoico).
#   3. Tạo .env nếu chưa có (hỏi mật khẩu admin) — KHÔNG ghi đè .env cũ.
#   4. Build + khởi động (migrations tự chạy) -> DB rỗng.
#   5. Nạp file SQL (dữ liệu bài viết, bot, người dùng Telegram) vào PostgreSQL.
#   6. Nạp media (ảnh + video) vào volume uploads.
#   7. Kiểm tra sức khoẻ + Nginx.
#
# CẢNH BÁO: bước 5-6 GHI ĐÈ dữ liệu đang có trên VPS. Script có bản sao lưu
# trước khi ghi đè (bước 4b) để có thể quay lại.
set -euo pipefail

TARGET="${1:?Dùng: bash scripts/deploy-with-data.sh <user@host> [domain]}"
DOMAIN_ARG="${2:-}"
APP_DIR="${APP_DIR:-/opt/chongtoico}"
REPO_URL="${REPO_URL:-https://github.com/binh2906dz/chongtoico.git}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXPORT_DIR="$SRC_DIR/server/data/export"
SQL_FILE="$(ls -1t "$EXPORT_DIR"/chongtoico-*.sql 2>/dev/null | head -n 1 || true)"
MEDIA_FILE="$EXPORT_DIR/uploads.tar.gz"

echo "==> Đích: $TARGET   Thư mục: $APP_DIR"

if [ -z "$SQL_FILE" ] || [ ! -f "$SQL_FILE" ]; then
  echo "Không tìm thấy file SQL trong $EXPORT_DIR. Chạy trước: cd server && npx tsx scripts/export-db-to-sql.mjs" >&2
  exit 1
fi
if [ ! -f "$MEDIA_FILE" ]; then
  echo "Không tìm thấy $MEDIA_FILE. Tạo bằng: cd server && tar -czf data/export/uploads.tar.gz -C data/uploads ." >&2
  exit 1
fi
echo "==> file dữ liệu: $(basename "$SQL_FILE") ($(du -h "$SQL_FILE" | cut -f1)), $(basename "$MEDIA_FILE") ($(du -h "$MEDIA_FILE" | cut -f1))"

echo "==> 1/7. Kiểm tra kết nối"
ssh -o BatchMode=yes "$TARGET" 'echo "SSH OK"; docker --version; docker compose version' >/dev/null
echo "    SSH + Docker OK"

echo "==> 2/7. Code trên VPS"
ssh "$TARGET" "if [ -d '$APP_DIR/.git' ]; then git -C '$APP_DIR' pull --ff-only; else git clone '$REPO_URL' '$APP_DIR'; fi"

echo "==> 3/7. File .env"
ssh -t "$TARGET" "cd '$APP_DIR' && if [ -f .env ]; then echo '    .env đã có, giữ nguyên'; else
  ADMIN_USERNAME=\$(read -rp 'Ten dang nhap quan tri [admin]: ' u </dev/tty); ADMIN_USERNAME=\${ADMIN_USERNAME:-admin}
  while true; do ADMIN_PASSWORD=\$(read -rsp 'Mat khau quan tri (>= 8 ky tu): ' p </dev/tty); echo; [ \${#p} -ge 8 ] && break; echo '   Mat khau qua ngan.'; done
  cat > .env <<EOF
DOMAIN=${DOMAIN_ARG}
APP_PORT=8090
POSTGRES_PASSWORD=\$(openssl rand -hex 24)
ADMIN_USERNAME=\${ADMIN_USERNAME}
ADMIN_PASSWORD='\${ADMIN_PASSWORD}'
COOKIE_SECURE=false
MAX_UPLOAD_MB=15
MAX_VIDEO_MB=2048
TOKEN_ENCRYPTION_KEY=local-dev-token-encryption-key-000000
BOT_API_SECRET=\$(openssl rand -hex 32)
IMPORT_SECRET=\$(openssl rand -hex 24)
SITE_URL=http://${DOMAIN_ARG}
EOF
  chmod 600 .env; echo '    .env da tao'
fi"

echo "==> 4/7. Build + khởi động (migrations tự chạy)"
ssh "$TARGET" "cd '$APP_DIR' && docker compose up -d --build"

echo "==> 4b. Sao lưu dữ liệu hiện có trên VPS (để quay lại được)"
ssh "$TARGET" "cd '$APP_DIR' && bash scripts/backup.sh --with-videos || echo '    (chua co du lieu de sao luu — bo qua)'"

echo "==> 5/7. Nạp CSDL (dữ liệu bài viết + bot + người dùng)"
scp "$SQL_FILE" "$TARGET:/tmp/chongtoico-data.sql"
ssh "$TARGET" "cd '$APP_DIR' && docker compose exec -T db psql -U chongtoico -d chongtoico -v ON_ERROR_STOP=1 < /tmp/chongtoico-data.sql && rm -f /tmp/chongtoico-data.sql && echo '    Da nap CSDL'"

echo "==> 6/7. Nạp media (ảnh + video) vào volume uploads"
scp "$MEDIA_FILE" "$TARGET:/tmp/chongtoico-uploads.tar.gz"
ssh "$TARGET" "cd '$APP_DIR' && docker compose exec -T app tar -C /data/uploads -xzf - < /tmp/chongtoico-uploads.tar.gz && rm -f /tmp/chongtoico-uploads.tar.gz && echo '    Da nap media'"

echo "==> 7/7. Kiểm tra"
ssh "$TARGET" "cd '$APP_DIR' && APP_PORT=\$(grep -E '^APP_PORT=' .env | cut -d= -f2- || echo 8090); for i in \$(seq 1 60); do curl -fsS \"http://127.0.0.1:\$APP_PORT/healthz\" >/dev/null 2>&1 && break; sleep 2; done; curl -fsS \"http://127.0.0.1:\$APP_PORT/healthz\"; echo; docker compose ps"

echo
echo "Xong! Kiểm tra: curl -s http://127.0.0.1:8090/api/home | head -c 300"
