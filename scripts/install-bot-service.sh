#!/usr/bin/env bash
# Cài dịch vụ bot Telegram chạy ngoài Docker (systemd) trên VPS.
#
# Yêu cầu: đã có Node.js >= 22 trên VPS, đã chạy `npm ci && npm run build` trong bot/.
#
# Chạy trên VPS: bash scripts/install-bot-service.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chongtoico}"
DOMAIN_ARG="${1:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "Chưa có Node.js trên VPS. Cài Node 22 trước:" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs" >&2
  exit 1
fi

cd "$APP_DIR/bot"

if [ ! -d node_modules ]; then
  echo "==> npm ci"
  npm ci
fi

if [ ! -f dist/main.js ]; then
  echo "==> npm run build"
  npm run build
fi

DOMAIN_ARG=$(grep -E '^DOMAIN=' "$APP_DIR/.env" | cut -d= -f2- || echo "localhost")
SITE_URL="https://${DOMAIN_ARG}"

cat > /etc/systemd/system/chongtoico-bot.service <<EOF
[Unit]
Description=Chong Toi Co - Telegram bot
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=$APP_DIR/bot
EnvironmentFile=$APP_DIR/.env
Environment=BOT_API_URL=http://127.0.0.1:8090
Environment=BOT_INTERNAL_PORT=8091
Environment=BOT_INTERNAL_HOST=127.0.0.1
Environment=WEB_BASE_URL=$SITE_URL
Environment=BOT_ENABLE_TELEGRAM=true
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/chongtoico-bot.log
StandardError=append:/var/log/chongtoico-bot.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now chongtoico-bot

sleep 10
echo "==> trạng thái:"
systemctl status chongtoico-bot --no-pager | head -8 || true
echo "==> log:"
tail -10 /var/log/chongtoico-bot.log 2>/dev/null || true
echo "==> health:"
curl -s http://127.0.0.1:8091/internal/health || true
echo
