# LUẬT VÀ BỐI CẢNH — Chongtoico

> ## ⚠️ LUẬT SỐ 1 — BẮT BUỘC TUYỆT ĐỐI
> **Luôn luôn đọc hết file này TRƯỚC TIÊN**, trước khi trả lời, lập kế hoạch, hay làm bất cứ việc gì — ở mọi phiên chat, mọi lần nhận việc mới.
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

- **L1 — Đọc file luật trước tiên (Luật số 1).** Mỗi phiên mới và mỗi lần nhận việc mới: đọc hết file này trước khi trả lời hoặc làm bất cứ việc gì. Không có ngoại lệ.
- **L2 — Ngôn ngữ.** Luôn trả lời chủ dự án bằng **tiếng Việt**.
- **L3 — Không code khi chưa chốt.** Quy trình bắt buộc: thảo luận → chủ dự án chốt → ghi vào mục 6 → mới làm. Khi chủ dự án nói "chưa làm", "thảo luận trước" thì **chỉ thảo luận**, không tạo/sửa file code.
- **L4 — Đúng phạm vi.** Chỉ làm đúng việc được yêu cầu. Không tự thêm tính năng, không tự refactor ngoài phạm vi. Có ý tưởng thì đề xuất, chờ duyệt.
- **L5 — Gặp mâu thuẫn thì hỏi.** Yêu cầu mới trái với luật / quyết định trong file này → hỏi lại chủ dự án, không tự quyết.
- **L6 — Đẩy code.** Thay đổi đã được duyệt: commit + push lên `main`, rồi đưa chủ dự án lệnh cập nhật server.
- **L7 — Bí mật.** Không bao giờ ghi token bot, mật khẩu, khoá bí mật thật vào repo hay vào file này.
- **L8 — Giữ lịch sử.** Không xoá nội dung cũ trong file này: đánh dấu `(đã thay thế bởi …)` thay vì xoá.
- **L9 — Luật do chủ dự án quyết.** AI chỉ được soạn đề xuất luật; luật chỉ có hiệu lực khi chủ dự án đồng ý.
- **L10 — Báo cáo trung thực.** Luôn nói rõ cái gì đã kiểm tra / chạy thử được, cái gì chưa.
- **L11 — Không đụng repo cũ.** Không sửa `telegram-bot-dashboard` trừ khi chủ dự án yêu cầu rõ.
- **L12 — Mọi thay đổi đều phải ghi nhật ký.** Mỗi lần thêm code, sửa lỗi, đổi cấu hình, đổi quyết định: ghi một mục vào **mục 10 (Nhật ký làm việc)** ngay trong phiên đó, theo mẫu ở mục 10. Với sửa lỗi bắt buộc ghi **nguyên nhân gốc** và **bài học / cách tránh** để lần sau không mắc lỗi tương tự. Bài học dùng chung thì chép thêm vào **mục 9 (Bài học & lỗi đã gặp)**.
- **L13 — Liên tục kiểm tra và cập nhật bối cảnh.**
  - Trước khi bắt đầu một việc: đối chiếu mục 4, 6, 9 xem việc này có đụng luật, quyết định hay lỗi cũ nào không.
  - Trong khi làm: phát hiện điều mới (về môi trường, thư viện, server, dữ liệu, thói quen làm việc của chủ dự án) → bổ sung ngay vào mục 8 (Bối cảnh) hoặc mục 9 (Bài học).
  - Trước khi kết thúc việc: kiểm tra lại file này còn đúng với thực tế không (code, server, quyết định); chỗ nào lỗi thời thì cập nhật hoặc đánh dấu thay thế.

## 6. Quyết định đã chốt

| Ngày | Quyết định |
|---|---|
| 2026-11-07 | Xây hệ thống mới, code mới hoàn toàn, ở repo riêng `chongtoico`. |
| 2026-11-07 | Dữ liệu hệ thống cũ (`data.db`) sẽ được chuyển sang hệ thống mới — làm sau khi chốt cấu trúc dữ liệu. |
| 2026-11-07 | Chủ dự án giao AI chọn công nghệ và cách triển khai — **cần xem lại** sau khi có mô tả hệ thống (xem mục 7). |
| 2026-11-07 | Luật và bối cảnh nằm trong **một file duy nhất** là file này; nhật ký làm việc cũng ghi tại đây (mục 10). |

## 7. Câu hỏi còn mở

- Hệ thống mới làm gì, cho ai, luồng hoạt động ra sao? (mục 1–4)
- Bộ khung code đã đẩy ở commit `b22c5f7` (FastAPI + aiogram 3 + PostgreSQL + Redis + React + Caddy, theo giả định "quản lý nhiều bot Telegram") được tạo **trước khi** có mô tả hệ thống → giữ, sửa hay xoá?
- Tên miền dùng cho hệ thống mới? Cùng VPS với hệ thống cũ hay VPS khác? (ảnh hưởng cổng 80/443)

## 8. Bối cảnh môi trường

- Chủ dự án làm việc trực tiếp trên GitHub, chạy server qua **Termius**, đã có sẵn **hosting và tên miền**.
- Máy Windows của chủ dự án: có Git, Node.js; **không** có Python, Docker, GitHub CLI → AI không chạy thử backend tại máy được.
- Thư mục repo trên máy: `C:\Users\Binh2\OneDrive\Desktop\chongtoico` (nằm trong OneDrive).
- Git commit trong repo này dùng tên `binh2906dz <binh2906dz@users.noreply.github.com>` (đã cấu hình riêng cho repo).
- Để rule Cursor tự nạp file này, cần mở **thư mục `chongtoico`** làm workspace trong Cursor.
- `huongdan.txt` = tài liệu kỹ thuật (kiến trúc, deploy) của bộ khung hiện tại; xếp sau file này.

## 9. Bài học & lỗi đã gặp

Mỗi dòng: **lỗi / tình huống** → **cách tránh**.

- **B1 — Viết code trước khi thảo luận.** Đã dựng và push bộ khung (`b22c5f7`) dựa trên giả định, trong khi hệ thống mới hoạt động khác hoàn toàn. → Luôn hỏi và chốt mục tiêu, cách hoạt động trước (L3); không suy luận từ hệ thống cũ.
- **B2 — Commit thất bại: "Author identity unknown".** Máy chưa cấu hình tên tác giả git. → Repo mới phải chạy `git config user.name binh2906dz` và `git config user.email binh2906dz@users.noreply.github.com` trước khi commit.
- **B3 — `git fetch` trong repo cũ báo "Permission denied" với `.git/FETCH_HEAD`.** Nghi do OneDrive khoá file. Push vẫn chạy. → Nếu pull/fetch lỗi, thử lại hoặc tạm dừng đồng bộ OneDrive; không kết luận mất quyền GitHub.
- **B4 — Pyright bỏ qua đường dẫn tuyệt đối trong `include`.** Chạy kiểm tra ra "0 lỗi" nhưng thực ra không quét file nào. → Chạy `npx pyright` ngay trong thư mục `backend` với đường dẫn tương đối; luôn kiểm tra danh sách file đã quét.
- **B5 — Pyright báo nhầm `alembic` "unknown import symbol".** Do thư mục `alembic/` của dự án trùng tên thư viện chưa cài trên máy. → Đây là báo nhầm khi máy thiếu thư viện, không phải lỗi code.

## 10. Nhật ký làm việc

Mẫu mỗi mục:

```
### YYYY-MM-DD — <Thêm | Sửa lỗi | Thay đổi | Quyết định> — <tiêu đề ngắn>
- Việc đã làm:
- Lý do:
- Nguyên nhân gốc (nếu sửa lỗi):
- Bài học / cách tránh:
- Đã kiểm tra: <cái gì đã chạy thử, cái gì chưa>
- File / commit:
```

### 2026-11-07 — Thêm — Bộ khung hệ thống
- Việc đã làm: Docker Compose (Caddy + FastAPI + PostgreSQL + Redis), aiogram 3 multi-bot webhook có secret, migration 0001, API auth/bots/stats, giao diện React (đăng nhập, tổng quan, quản lý bot), `scripts/install.sh`, `scripts/update.sh`, `huongdan.txt`.
- Lý do: chủ dự án tạo repo mới, giao AI chọn công nghệ.
- Bài học / cách tránh: làm trước khi có mô tả hệ thống → xem B1. Trạng thái: chờ chủ dự án quyết giữ / sửa / xoá.
- Đã kiểm tra: frontend build thành công; Pyright không thấy lỗi cú pháp; **chưa chạy** backend, DB, bot (máy không có Python/Docker).
- File / commit: `b22c5f7`, `37daf78`.

### 2026-11-07 — Thêm — Tạo file luật và bối cảnh
- Việc đã làm: tạo file này (luật L1–L11, quyết định, câu hỏi mở, bối cảnh); rule Cursor bắt đọc file này trước.
- Lý do: chủ dự án yêu cầu luật và bối cảnh nằm trong một file trên GitHub để không bao giờ quên.
- File / commit: `a344d34`.

### 2026-11-07 — Thay đổi — Bổ sung luật bắt buộc
- Việc đã làm: nâng L1 thành "Luật số 1" ở đầu file; thêm L12 (mọi thay đổi phải ghi nhật ký, sửa lỗi phải ghi nguyên nhân + bài học), L13 (liên tục kiểm tra, cập nhật bối cảnh); thêm mục 9 (Bài học) với B1–B5 rút từ phiên làm việc, mục 10 (Nhật ký làm việc) có mẫu ghi.
- Lý do: chủ dự án yêu cầu.
- File / commit: commit này.
