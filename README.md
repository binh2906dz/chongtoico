# Chống Tối Cổ

Diễn đàn cộng đồng: diễn đàn (chủ đề, bài viết, thích, hot trong ngày / trending tuần), chat cộng đồng thời gian thực, kho album ảnh, bảng xếp hạng thành viên, chat CSKH, trang quản trị.

Công nghệ: Node.js + TypeScript + Fastify + Socket.IO + Drizzle ORM + PostgreSQL, giao diện React + Vite + Tailwind. Chạy bằng Docker Compose, song song với hệ thống cũ trên cùng VPS (Nginx cũ chuyển tên miền phụ vào cổng nội bộ).

Luật làm việc và bối cảnh: [`LUAT_VA_BOI_CANH.md`](LUAT_VA_BOI_CANH.md) — đọc trước tiên. Tài liệu kỹ thuật: [`huongdan.txt`](huongdan.txt).

## Cài lên VPS (root, trong Termius)

1. Tạo bản ghi DNS **A** cho tên miền phụ (vd `beta.tenmiencu.com`) trỏ về IP VPS.
2. Chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/binh2906dz/chongtoico/main/scripts/install.sh | bash
```

Script cài Docker (nếu thiếu), tải code về `/opt/chongtoico`, hỏi tên miền phụ + tài khoản quản trị, khởi động, thêm site Nginx riêng cho tên miền phụ và (tuỳ chọn) cấp HTTPS bằng certbot. Web cũ không bị đụng tới.

## Cập nhật

```bash
bash /opt/chongtoico/scripts/update.sh
```

## Chạy thử trên máy (chỉ cần Node.js)

```bash
cd frontend && npm install && npm run build
cd ../server && npm install
# PowerShell: $env:ADMIN_USERNAME="admin"; $env:ADMIN_PASSWORD="matkhau-thu"; npm run dev
ADMIN_USERNAME=admin ADMIN_PASSWORD=matkhau-thu npm run dev
```

Mở http://127.0.0.1:8090. Dữ liệu chạy thử nằm ở `server/data/` (PGlite, không cần cài PostgreSQL). Kiểm thử tự động: `cd server && npm test`.
