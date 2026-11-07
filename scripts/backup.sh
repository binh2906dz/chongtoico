#!/usr/bin/env bash
# Sao lưu Chống Tối Cổ: cơ sở dữ liệu + ảnh (mặc định KHÔNG gồm video vì rất nặng).
#   bash /opt/chongtoico/scripts/backup.sh                # DB + ảnh
#   bash /opt/chongtoico/scripts/backup.sh --with-videos  # thêm cả thư mục video
# Chạy tự động mỗi ngày 3h sáng (crontab -e):
#   0 3 * * * bash /opt/chongtoico/scripts/backup.sh >> /var/log/chongtoico-backup.log 2>&1
# Nên chép thư mục sao lưu ra máy khác / dịch vụ lưu trữ — sao lưu nằm cùng VPS không cứu được khi mất VPS.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/chongtoico}"
BACKUP_DIR="${BACKUP_DIR:-/opt/chongtoico-backups}"
KEEP="${KEEP:-7}"
WITH_VIDEOS=0
[ "${1:-}" = "--with-videos" ] && WITH_VIDEOS=1

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"

echo "==> [$TS] Sao lưu cơ sở dữ liệu"
docker compose exec -T db pg_dump -U chongtoico -d chongtoico --no-owner | gzip > "$BACKUP_DIR/db-$TS.sql.gz.part"
mv "$BACKUP_DIR/db-$TS.sql.gz.part" "$BACKUP_DIR/db-$TS.sql.gz"

echo "==> Sao lưu ảnh (avatar, album, ảnh bài viết, ảnh bìa video, quảng cáo)"
docker compose exec -T app tar -C /data/uploads --exclude=./videos -czf - . > "$BACKUP_DIR/files-$TS.tar.gz.part"
mv "$BACKUP_DIR/files-$TS.tar.gz.part" "$BACKUP_DIR/files-$TS.tar.gz"

if [ "$WITH_VIDEOS" = 1 ]; then
  echo "==> Sao lưu video (có thể rất lâu và tốn dung lượng)"
  docker compose exec -T app tar -C /data/uploads -cf - --exclude='*.part' videos > "$BACKUP_DIR/videos-$TS.tar.part"
  mv "$BACKUP_DIR/videos-$TS.tar.part" "$BACKUP_DIR/videos-$TS.tar"
fi

echo "==> Giữ lại $KEEP bản mới nhất mỗi loại"
for prefix in db files videos; do
  ls -1t "$BACKUP_DIR"/"$prefix"-* 2>/dev/null | grep -v '\.part$' | tail -n +"$((KEEP + 1))" | xargs -r rm -f
done
rm -f "$BACKUP_DIR"/*.part

echo "OK: $(du -sh "$BACKUP_DIR" | cut -f1) trong $BACKUP_DIR"
df -h "$BACKUP_DIR" | tail -n 1
