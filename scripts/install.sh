#!/usr/bin/env bash
# Cài Chống Tối Cổ lên VPS đang chạy hệ thống cũ (Ubuntu/Debian, chạy bằng root trong Termius):
#   curl -fsSL https://raw.githubusercontent.com/binh2906dz/chongtoico/main/scripts/install.sh | bash
#
# Không đụng hệ thống cũ: không dừng service "bot", không sửa site Nginx cũ, không chiếm cổng 80/443.
# Chỉ thêm 1 file /etc/nginx/sites-available/chongtoico cho tên miền phụ (DOMAIN trong .env).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/binh2906dz/chongtoico.git}"
APP_DIR="${APP_DIR:-/opt/chongtoico}"
NGINX_SITE="/etc/nginx/sites-available/chongtoico"

if [ "$(id -u)" -ne 0 ]; then
  echo "Hãy chạy bằng root (sudo -i)." >&2
  exit 1
fi

command -v git >/dev/null 2>&1 || { apt-get update -y && apt-get install -y git; }
command -v openssl >/dev/null 2>&1 || { apt-get update -y && apt-get install -y openssl; }

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Cài Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Cập nhật mã nguồn tại $APP_DIR"
  # core.autocrlf=input: checkout giữ LF, không tạo CRLF trên Linux (B74).
  git -C "$APP_DIR" config core.autocrlf input
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Tải mã nguồn về $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  git -C "$APP_DIR" config core.autocrlf input
fi
cd "$APP_DIR"

chmod +x "$APP_DIR"/scripts/*.sh

if [ ! -f .env ]; then
  echo "==> Tạo file .env"
  read -rp "Tên miền phụ cho hệ thống mới (vd: beta.tenmiencu.com): " DOMAIN </dev/tty
  read -rp "Cổng nội bộ [8090]: " APP_PORT </dev/tty
  APP_PORT="${APP_PORT:-8090}"
  read -rp "Tên đăng nhập quản trị [admin]: " ADMIN_USERNAME </dev/tty
  ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
  while true; do
    read -rsp "Mật khẩu quản trị (>= 8 ký tự, không chứa dấu nháy đơn '): " ADMIN_PASSWORD </dev/tty
    echo
    if [ ${#ADMIN_PASSWORD} -ge 8 ] && [[ "$ADMIN_PASSWORD" != *"'"* ]]; then break; fi
    echo "Mật khẩu chưa hợp lệ."
  done
  cat > .env <<EOF
DOMAIN=${DOMAIN}
APP_PORT=${APP_PORT}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD='${ADMIN_PASSWORD}'
COOKIE_SECURE=false
MAX_UPLOAD_MB=15
MAX_VIDEO_MB=2048
EOF
  chmod 600 .env
fi

DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
APP_PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2-)"
APP_PORT="${APP_PORT:-8090}"

if ss -ltn "( sport = :${APP_PORT} )" | grep -q LISTEN && ! docker compose ps --status running 2>/dev/null | grep -q app; then
  echo "Cổng ${APP_PORT} đang bị chương trình khác dùng. Sửa APP_PORT trong $APP_DIR/.env rồi chạy lại." >&2
  exit 1
fi

echo "==> Build và khởi động (lần đầu mất vài phút)"
docker compose up -d --build
docker compose ps

echo "==> Chờ ứng dụng sẵn sàng..."
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
    echo "Ứng dụng đã chạy tại 127.0.0.1:${APP_PORT}"
    break
  fi
  sleep 2
done

if command -v nginx >/dev/null 2>&1; then
  if [ ! -f "$NGINX_SITE" ]; then
    echo "==> Thêm site Nginx cho ${DOMAIN} (không sửa site cũ)"
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 200M;

    location ^~ /api/admin/articles {
        client_max_body_size 2100M;
        client_body_timeout 3600s;
        proxy_request_buffering off;
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/chongtoico
    if nginx -t; then
      systemctl reload nginx
    else
      echo "Cấu hình Nginx lỗi -> gỡ site mới để không ảnh hưởng web cũ." >&2
      rm -f /etc/nginx/sites-enabled/chongtoico
      exit 1
    fi
  fi

  read -rp "Cấp HTTPS miễn phí cho ${DOMAIN} bằng certbot ngay bây giờ? (DNS phải trỏ về VPS) [y/N]: " WANT_SSL </dev/tty
  if [[ "${WANT_SSL:-n}" =~ ^[Yy]$ ]]; then
    command -v certbot >/dev/null 2>&1 || { apt-get update -y && apt-get install -y certbot python3-certbot-nginx; }
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
      sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' .env
      docker compose up -d
      echo "Đã bật HTTPS: https://${DOMAIN}"
    else
      echo "Certbot lỗi. Web vẫn chạy bằng http://${DOMAIN}. Kiểm tra DNS rồi chạy lại: certbot --nginx -d ${DOMAIN}" >&2
    fi
  fi
else
  echo "Không thấy Nginx. Hệ thống mới đang chạy ở http://127.0.0.1:${APP_PORT} (chỉ truy cập từ VPS)." >&2
fi

echo
echo "Xong! Mở http://${DOMAIN} (hoặc https nếu đã cấp chứng chỉ)."
echo "Xem log:   cd $APP_DIR && docker compose logs -f app"
echo "Cập nhật:  bash $APP_DIR/scripts/update.sh"
