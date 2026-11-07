#!/usr/bin/env bash
# Cài đặt Chongtoico lên VPS Ubuntu/Debian (chạy bằng root trong Termius):
#   curl -fsSL https://raw.githubusercontent.com/binh2906dz/chongtoico/main/scripts/install.sh | bash
# Ghi đè nếu cần: REPO_URL=... APP_DIR=... bash install.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/binh2906dz/chongtoico.git}"
APP_DIR="${APP_DIR:-/opt/chongtoico}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Hãy chạy bằng root (sudo -i)." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y git
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Cài Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Cập nhật mã nguồn tại $APP_DIR"
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Tải mã nguồn về $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "==> Tạo file .env"
  read -rp "Tên miền (vd: admin.example.com): " DOMAIN </dev/tty
  read -rp "Tên đăng nhập admin [admin]: " ADMIN_USERNAME </dev/tty
  ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
  while true; do
    read -rsp "Mật khẩu admin (không chứa dấu nháy đơn '): " ADMIN_PASSWORD </dev/tty
    echo
    if [ ${#ADMIN_PASSWORD} -ge 8 ] && [[ "$ADMIN_PASSWORD" != *"'"* ]]; then break; fi
    echo "Mật khẩu phải từ 8 ký tự và không chứa dấu nháy đơn."
  done
  cat > .env <<EOF
DOMAIN=${DOMAIN}
PUBLIC_URL=
SECRET_KEY=$(openssl rand -hex 32)
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD='${ADMIN_PASSWORD}'
POSTGRES_DB=chongtoico
POSTGRES_USER=chongtoico
POSTGRES_PASSWORD=$(openssl rand -hex 24)
COOKIE_SECURE=true
EOF
  chmod 600 .env
fi

echo "==> Build và khởi động"
docker compose up -d --build
docker compose ps

DOMAIN_SET="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
echo
echo "Xong! Mở https://${DOMAIN_SET} để đăng nhập."
echo "Xem log: cd $APP_DIR && docker compose logs -f backend"
