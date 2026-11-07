# LUẬT VÀ BỐI CẢNH — Chongtoico

> **File gốc, ưu tiên cao nhất.** Mọi phiên chat / AI phải đọc hết file này **trước khi làm bất cứ việc gì**.
> Nếu file khác (kể cả `huongdan.txt`) mâu thuẫn với file này thì **file này đúng**.

- Repo: https://github.com/binh2906dz/chongtoico (nhánh `main`)
- Chủ dự án: `binh2906dz`
- Hệ thống cũ (tham khảo, không dùng chung code): https://github.com/binh2906dz/telegram-bot-dashboard

---

## 1. Mục tiêu hệ thống

_Chưa có — chờ chủ dự án mô tả._

## 2. Cách hoạt động

_Chưa có — chờ chủ dự án mô tả._

Đã biết chắc: hệ thống mới **hoạt động hoàn toàn khác** hệ thống cũ. Không được suy luận cách hoạt động từ hệ thống cũ.

## 3. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| _(chưa có)_ | |

## 4. Luật nghiệp vụ bất biến

_Chưa có — chờ chủ dự án mô tả._ Đánh số `N1`, `N2`, … để tham chiếu.

## 5. Luật làm việc với AI

- **L1 — Đọc trước.** Mỗi phiên mới: đọc hết file này trước khi trả lời hoặc làm bất cứ việc gì.
- **L2 — Ngôn ngữ.** Luôn trả lời chủ dự án bằng **tiếng Việt**.
- **L3 — Không code khi chưa chốt.** Quy trình bắt buộc: thảo luận → chủ dự án chốt → ghi vào mục 6 → mới làm. Khi chủ dự án nói "chưa làm", "thảo luận trước" thì **chỉ thảo luận**, không tạo/sửa file code.
- **L4 — Đúng phạm vi.** Chỉ làm đúng việc được yêu cầu. Không tự thêm tính năng, không tự refactor ngoài phạm vi. Có ý tưởng thì đề xuất, chờ duyệt.
- **L5 — Gặp mâu thuẫn thì hỏi.** Yêu cầu mới trái với luật / quyết định trong file này → hỏi lại chủ dự án, không tự quyết.
- **L6 — Đẩy code.** Thay đổi đã được duyệt: commit + push lên `main`, rồi đưa chủ dự án lệnh cập nhật server.
- **L7 — Bí mật.** Không bao giờ ghi token bot, mật khẩu, khoá bí mật thật vào repo hay vào file này.
- **L8 — Giữ lịch sử.** Cập nhật file này khi có quyết định / luật mới. Không xoá nội dung cũ: đánh dấu `(đã thay thế bởi …)` thay vì xoá.
- **L9 — Luật do chủ dự án quyết.** AI chỉ được soạn đề xuất luật; luật chỉ có hiệu lực khi chủ dự án đồng ý.
- **L10 — Báo cáo trung thực.** Luôn nói rõ cái gì đã kiểm tra / chạy thử được, cái gì chưa.
- **L11 — Không đụng repo cũ.** Không sửa `telegram-bot-dashboard` trừ khi chủ dự án yêu cầu rõ.

## 6. Quyết định đã chốt

| Ngày | Quyết định |
|---|---|
| 2026-11-07 | Xây hệ thống mới, code mới hoàn toàn, ở repo riêng `chongtoico`. |
| 2026-11-07 | Dữ liệu hệ thống cũ (`data.db`) sẽ được chuyển sang hệ thống mới — làm sau khi chốt cấu trúc dữ liệu. |
| 2026-11-07 | Chủ dự án giao AI chọn công nghệ và cách triển khai — **cần xem lại** sau khi có mô tả hệ thống (xem mục 7). |

## 7. Câu hỏi còn mở

- Hệ thống mới làm gì, cho ai, luồng hoạt động ra sao? (mục 1–4)
- Bộ khung code đã đẩy ở commit `b22c5f7` (FastAPI + aiogram 3 + PostgreSQL + Redis + React + Caddy, theo giả định "quản lý nhiều bot Telegram") được tạo **trước khi** có mô tả hệ thống → giữ, sửa hay xoá?
- Tên miền dùng cho hệ thống mới? Cùng VPS với hệ thống cũ hay VPS khác? (ảnh hưởng cổng 80/443)

## 8. Bối cảnh môi trường

- Chủ dự án làm việc trực tiếp trên GitHub, chạy server qua **Termius**, đã có sẵn **hosting và tên miền**.
- Máy Windows của chủ dự án: có Git, Node.js; **không** có Python, Docker, GitHub CLI → AI không chạy thử backend tại máy được.
- Git commit trong repo này dùng tên `binh2906dz <binh2906dz@users.noreply.github.com>`.
- Để rule Cursor tự nạp file này, cần mở **thư mục `chongtoico`** làm workspace trong Cursor.

## 9. Nhật ký thay đổi file này

- **2026-11-07** — Tạo file: khung 9 mục, luật làm việc L1–L11, các quyết định và câu hỏi mở ban đầu.
