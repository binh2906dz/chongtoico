# Chongtoico

Nền tảng quản lý nhiều bot Telegram: FastAPI + aiogram 3 + PostgreSQL + Redis, giao diện quản trị React, Caddy tự cấp HTTPS, chạy bằng Docker Compose.

## Cài lên VPS (Ubuntu/Debian, quyền root)

1. Trỏ bản ghi DNS **A** của tên miền về IP VPS.
2. Đảm bảo cổng **80** và **443** đang trống (không có Nginx/Apache khác chiếm).
3. Chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/binh2906dz/chongtoico/main/scripts/install.sh | bash
```

Script sẽ cài Docker, tải code về `/opt/chongtoico`, hỏi tên miền + tài khoản admin, tự sinh khoá bí mật rồi khởi động.

## Cập nhật

```bash
bash /opt/chongtoico/scripts/update.sh
```

## Lệnh hay dùng

```bash
cd /opt/chongtoico
docker compose ps                 # trạng thái các dịch vụ
docker compose logs -f backend    # log backend + bot
docker compose restart backend    # khởi động lại backend
```

Tài liệu bàn giao chi tiết: [`huongdan.txt`](huongdan.txt).
