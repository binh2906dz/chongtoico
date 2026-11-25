#!/usr/bin/env bash
# Giải mã token bot từ CSDL và ghi vào .env (dạng "id:token,id:token,...").
#
# Token trong CSDL được mã hoá AES-256-GCM với khoá TOKEN_ENCRYPTION_KEY.
# Bot service cần token dạng rõ trong TELEGRAM_BOT_TOKENS.
#
# Chạy trên VPS (trong thư mục /opt/chongtoico): bash scripts/export-bot-tokens.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chongtoico}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Không có .env trong $APP_DIR" >&2
  exit 1
fi

PG_PASS=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
ENC_KEY=$(grep -E '^TOKEN_ENCRYPTION_KEY=' .env | cut -d= -f2- || true)

if [ -z "$ENC_KEY" ]; then
  echo "Thiếu TOKEN_ENCRYPTION_KEY trong .env — không giải mã được token." >&2
  exit 1
fi

# Script Node chạy trong container app (nơi có node_modules + pg).
cat > /tmp/dump-tokens.mjs <<'EOF'
import { createDecipheriv, scryptSync } from "node:crypto";
import pg from "pg";

const ALGO = "aes-256-gcm";
const KEY = process.env.TOKEN_ENCRYPTION_KEY || "";

const deriveKey = (salt) => scryptSync(KEY, salt, 32);

function decryptToken(value) {
  if (!value || !KEY) return null;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const enc = Buffer.from(parts[4], "base64url");
    const d = createDecipheriv(ALGO, deriveKey(salt), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const client = new pg.Client({
  connectionString: "postgres://chongtoico:" + process.env.PG_PASS + "@db:5432/chongtoico",
});
await client.connect();
const res = await client.query(
  "SELECT id, token_encrypted FROM telegram_bots WHERE token_encrypted IS NOT NULL AND status <> 'ban' ORDER BY sort_order, id",
);
const out = [];
for (const row of res.rows) {
  const token = decryptToken(row.token_encrypted);
  if (token) out.push(`${row.id}:${token}`);
}
await client.end();
console.log(out.join(","));
EOF

CONTAINER=$(docker compose ps --format '{{.Name}}' app | head -1)
docker cp /tmp/dump-tokens.mjs "$CONTAINER:/app/server/dump-tokens.mjs"

TOKENS=$(docker compose exec -T -e PG_PASS="$PG_PASS" -e TOKEN_ENCRYPTION_KEY="$ENC_KEY" \
  app node /app/server/dump-tokens.mjs | tr -d '\r' | tail -1)

docker compose exec -T app rm -f /app/server/dump-tokens.mjs >/dev/null 2>&1 || true
rm -f /tmp/dump-tokens.mjs

if [ -z "$TOKENS" ]; then
  echo "Không giải mã được token nào." >&2
  exit 1
fi

COUNT=$(echo "$TOKENS" | tr ',' '\n' | grep -c ':')
echo "Đã giải mã $COUNT token bot."

if grep -q '^TELEGRAM_BOT_TOKENS=' .env; then
  sed -i "s|^TELEGRAM_BOT_TOKENS=.*|TELEGRAM_BOT_TOKENS=$TOKENS|" .env
else
  echo "TELEGRAM_BOT_TOKENS=$TOKENS" >> .env
fi
chmod 600 .env
echo "Đã cập nhật TELEGRAM_BOT_TOKENS trong .env"
