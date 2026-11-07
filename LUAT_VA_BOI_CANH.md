# LUẬT VÀ BỐI CẢNH — Chongtoico

> ## ⚠️ LUẬT SỐ 1 — BẮT BUỘC TUYỆT ĐỐI
> **Luôn luôn đọc hết file này TRƯỚC TIÊN**, trước khi trả lời, lập kế hoạch, hay làm bất cứ việc gì — ở mọi phiên chat, mọi lần nhận việc mới.
> Nếu file khác (kể cả `huongdan.txt`) mâu thuẫn với file này thì **file này đúng**.

- Repo: https://github.com/binh2906dz/chongtoico (nhánh `main`)
- Chủ dự án: `binh2906dz`
- Hệ thống cũ (tham khảo, không dùng chung code): https://github.com/binh2906dz/telegram-bot-dashboard

---

## 1. Mục tiêu hệ thống

Nền tảng cộng đồng có **bộ chức năng tham khảo theo shiperx.net**, sửa một ít, gồm: diễn đàn (chủ đề, bài viết, "Có gì mới", hot trong ngày / trending tuần), kênh chat cộng đồng thời gian thực, kho album ảnh, bảng xếp hạng thành viên, khung chat CSKH, app Android.

- **Nội dung hợp pháp** — không phải nội dung người lớn (xem N1).
- **Tên và giao diện riêng** — chỉ học bố cục / chức năng, không chép tên, logo, chữ, mã nguồn của shiperx (xem N2).
- Hệ thống mới nhưng **dùng lại một số dữ liệu cũ** từ `data.db` (cụ thể dữ liệu nào: xem mục 7).

_Chi tiết từng chức năng: ~~chờ chủ dự án mô tả~~ → bản đầu đã code theo shiperx (2026-11-07), chủ dự án sẽ chỉnh sửa / thêm sau._

## 2. Cách hoạt động

Đã biết chắc: hệ thống mới **hoạt động hoàn toàn khác** hệ thống cũ. Không được suy luận cách hoạt động từ hệ thống cũ.

Bản đầu (2026-11-07), chi tiết kỹ thuật ở `huongdan.txt`:
- **Khách** xem được diễn đàn, chat, album công khai, xếp hạng; nhắn CSKH được. Muốn đăng bài / chat / thích / xem album "chỉ thành viên" phải đăng ký, đăng nhập.
- **Diễn đàn:** chuyên mục → chủ đề → bài trả lời. Thích bài (không tự thích). Chủ bài sửa / xoá bài mình; xoá bài đầu = xoá cả chủ đề. Trang chủ có 3 tab: Mới ra lò, Hot trong ngày (nhiều bài trong 24 giờ), Trending tuần (7 ngày).
- **Chat cộng đồng:** nhiều kênh, tin đến ngay (realtime), đếm người online. Kênh "chỉ BQT" thì thành viên chỉ đọc.
- **Kho album:** BQT (mod / admin) tạo album, tải ảnh, đánh dấu HOT (hiện ở banner trang chủ), đặt công khai hoặc chỉ thành viên.
- **Bảng xếp hạng:** Vinh danh (được thích nhiều), Cao thủ phím (nhiều bài), Lính mới, Phòng giam (đang bị khoá + lý do).
- **CSKH:** nút nổi góc phải; khách / thành viên nhắn, BQT trả lời trong Quản trị > CSKH, tin đến ngay.
- **Quản trị:** tổng quan số liệu, thành viên (đổi quyền, khoá có thời hạn / vĩnh viễn, mở khoá), chuyên mục, kênh chat, album, CSKH.

## 3. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| BQT | Ban quản trị = vai trò `mod` (điều hành viên) và `admin` (quản trị viên) |
| Khoá tài khoản | Thành viên vẫn đăng nhập / đọc / nhắn CSKH, nhưng không đăng bài, chat, thích. Hiện ở "Phòng giam" |
| Album HOT | Album hiện ở banner trang chủ |
| Tên miền phụ | Vd `beta.<tên miền cũ>` — nơi chạy thử hệ thống mới trước ngày thay hệ thống cũ |

## 4. Luật nghiệp vụ bất biến

Đánh số `N1`, `N2`, … để tham chiếu.

- **N1 — Nội dung hợp pháp.** Hệ thống không dùng cho nội dung khiêu dâm / người lớn, không có cơ chế lách chặn tên miền.
- **N2 — Thương hiệu riêng.** Không sao chép tên, logo, giao diện y hệt, nội dung chữ hay mã nguồn của shiperx.net.
- **N3 — Không đụng hệ thống cũ đang chạy.** Trong lúc xây hệ thống mới: web / bot cũ phải chạy bình thường. Không dừng service `bot`, không chiếm cổng 80/443 của Nginx cũ, không đổi DNS tên miền chính, không ghi vào `data.db` thật (chỉ đọc từ bản sao).
- **N4 — Hoàn thành rồi mới thay.** Chỉ chuyển tên miền chính sang hệ thống mới khi hệ thống mới đã xong, đã chạy thử đầy đủ và **chủ dự án đồng ý** chuyển. Hệ thống cũ được giữ lại để quay về nếu có sự cố.

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
| 2026-11-07 | Bộ chức năng tham khảo shiperx.net (làm giống hầu hết, sửa một ít), **nội dung hợp pháp**, **tên và giao diện riêng** (N1, N2). |
| 2026-11-07 | Hệ thống mới có liên quan đến **một số dữ liệu cũ**. |
| 2026-11-07 | Hệ thống cũ **tiếp tục chạy** trong lúc xây hệ thống mới; chỉ thay khi hệ thống mới hoàn thành và chủ dự án đồng ý (N3, N4). |
| 2026-11-07 | Chủ đề: **cộng đồng chung, nhiều chủ đề**. |
| 2026-11-07 | Chạy thử hệ thống mới trên **VPS hiện tại** (cùng VPS với hệ thống cũ). Chủ dự án chưa có tên miền mới. |
| 2026-11-07 | Tên thương hiệu: **Chống Tối Cổ** (repo `chongtoico`). |
| 2026-11-07 | Chủ dự án: **code toàn bộ chức năng như shiperx trước**, sau đó chủ dự án tự chỉnh sửa / thêm chức năng. App Android và kết nối Telegram / dữ liệu cũ làm sau. |
| 2026-11-07 | Công nghệ (AI chọn, thay bộ khung `b22c5f7`): máy chủ **Node.js 22 + TypeScript + Fastify + Socket.IO + Drizzle ORM + PostgreSQL 16**; giao diện **React + Vite + Tailwind**. Chạy thử tại máy bằng **PGlite** (PostgreSQL chạy trong Node, không cần cài). Lý do: máy chủ dự án chỉ có Node → AI chạy thử được toàn bộ (L10); một ngôn ngữ cho cả hai phía; chat thời gian thực sẵn có. Bỏ Python/aiogram/Redis/Caddy. |
| 2026-11-07 | Triển khai: Docker Compose (`app` + `db`) trên VPS hiện tại, `app` chỉ mở `127.0.0.1:8090`; Nginx cũ thêm một khối `server` cho tên miền phụ chuyển vào cổng này (N3). |
| 2026-11-07 | Dữ liệu cũ cần dùng: chủ dự án **chọn sau**. Bộ khung `b22c5f7`: AI **đánh giá lại khi đã rõ chức năng** rồi đề xuất giữ / sửa / xoá. |
| 2026-11-07 | Bộ khung `b22c5f7` (Python): **đã xoá**, thay bằng bản Node.js. Phiên bản thực tế trong Docker: **Node 24**, **PostgreSQL 17** (dòng "Node.js 22 / PostgreSQL 16" ở trên đã thay thế bởi dòng này). |
| 2026-11-07 | Cách làm hiện tại: **tập trung code trước, kiểm thử sau**. AI chỉ chạy kiểm tra nhanh (biên dịch `tsc` / `npm run build`) để không đẩy code hỏng; không mở trình duyệt, không viết thêm bài kiểm thử lớn cho tới khi chủ dự án yêu cầu giai đoạn kiểm thử. Vẫn phải báo trung thực cái gì chưa chạy thử (L10). |

## 7. Câu hỏi còn mở

- ~~Hệ thống mới làm gì?~~ (đã trả lời một phần ở mục 1, ngày 2026-11-07). ~~Chủ đề?~~ → cộng đồng chung (mục 6). Còn mở: chi tiết từng chức năng và phần "sửa một ít" so với shiperx?
- ~~Tên thương hiệu mới?~~ → **Chống Tối Cổ** (mục 6).
- ~~Duyệt bản nháp danh sách chức năng~~ → chủ dự án chọn "code toàn bộ như shiperx trước" (mục 6). Còn mở: chủ dự án xem bản đầu rồi báo chỗ cần sửa / thêm.
- Dùng lại **những dữ liệu cũ nào** (người dùng Telegram, bot, album, người đăng ký, …)? — chủ dự án chọn sau.
- ~~Chạy thử ở đâu?~~ → VPS hiện tại (mục 6). Còn mở: tên miền phụ cụ thể (vd `beta.<tên miền cũ>`) — chủ dự án tạo bản ghi DNS A rồi chạy `scripts/install.sh`.
- ~~Bộ khung code `b22c5f7`~~ → đã xoá, thay bằng bản Node.js (mục 6).
- Hệ thống cũ có đang dùng Cloudflare / HTTPS kiểu gì? (ảnh hưởng cách cấp HTTPS cho tên miền phụ; `install.sh` mặc định dùng certbot.)

## 8. Bối cảnh môi trường

- Chủ dự án làm việc trực tiếp trên GitHub, chạy server qua **Termius**, đã có sẵn **hosting và tên miền**.
- Máy Windows của chủ dự án: có Git, Node.js v26 / npm 11; **không** có Python, Docker, GitHub CLI. ~~AI không chạy thử backend tại máy được~~ → từ bản Node.js: chạy thử được toàn bộ bằng PGlite (`server/data/`, đã gitignore); **không** chạy thử được Docker / Nginx / certbot.
- VPS: hệ thống cũ = service systemd `bot` (Gunicorn `127.0.0.1:5000`) sau Nginx, thư mục `/root/telegram-bot-dashboard`, Nginx site `/etc/nginx/sites-available/bot`. Hệ thống mới: `/opt/chongtoico`, cổng `127.0.0.1:8090`, Nginx site `chongtoico`.
- npm 11 trên máy **không chạy script cài đặt** (install scripts) mặc định — `sharp`, `tsx`, PGlite vẫn chạy được vì dùng gói dựng sẵn.
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
- **B6 — App không khởi động: "Method 'GET' already declared for route '/favicon.svg'".** `@fastify/static` với `wildcard: false` đã tự tạo route cho mọi file trong thư mục giao diện; khai báo tay thêm route trùng. → Không tự khai báo route cho file tĩnh; nhớ rằng file giao diện chỉ được nạp lúc khởi động (build lại phải restart app). Kiểm thử bằng `app.inject` không bắt được lỗi này vì test không có thư mục giao diện → luôn chạy thử app thật (`npm run dev`) sau khi sửa `app.ts`.
- **B7 — Màu chữ Tailwind không ăn trên thẻ `<a>`.** CSS tự viết ngoài `@layer` (`a { color: inherit }`) luôn thắng class Tailwind v4 (nằm trong layer). → CSS nền tự viết phải đặt trong `@layer base { ... }`; class tái sử dụng dùng `@utility`.
- **B8 — `setHeaders` của `@fastify/static` v10 nhận `FastifyReply`, không phải `ServerResponse`.** → Dùng `res.header(...)`, không dùng `res.setHeader(...)`.

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
- File / commit: `642218b`.

### 2026-11-07 — Quyết định — Định hướng hệ thống và cách thay hệ thống cũ
- Việc đã làm: ghi mục tiêu (mục 1), luật nghiệp vụ N1–N4, quyết định mới (mục 6), cập nhật câu hỏi mở (mục 7).
- Lý do: chủ dự án chốt: bộ chức năng tham khảo shiperx.net với nội dung hợp pháp, tên/giao diện riêng, dùng một số dữ liệu cũ; hệ thống cũ chạy tiếp đến khi hệ thống mới hoàn thành.
- Bài học / cách tránh: shiperx.net là trang nội dung người lớn đội lốt cộng đồng tài xế → chỉ tham khảo chức năng, không tham khảo nội dung (N1, N2).
- Đã kiểm tra: chỉ sửa tài liệu, không có code.
- File / commit: `ac604e9`.

### 2026-11-07 — Quyết định — Chủ đề, nơi chạy thử, dữ liệu cũ, bộ khung
- Việc đã làm: ghi vào mục 6: cộng đồng chung; chạy thử trên VPS hiện tại (chưa có tên miền mới); dữ liệu cũ chọn sau; bộ khung `b22c5f7` để AI đánh giá lại sau. Cập nhật mục 7.
- Lý do: chủ dự án trả lời câu hỏi mở.
- Bài học / cách tránh: chạy chung VPS → không được để hệ thống mới chiếm cổng 80/443 (N3); tên miền phụ của tên miền cũ dùng được để chạy thử mà không cần mua tên miền mới.
- Đã kiểm tra: chỉ sửa tài liệu, không có code.
- File / commit: `4e099bb`.

### 2026-11-07 — Quyết định — Tên thương hiệu
- Việc đã làm: ghi tên thương hiệu **Chống Tối Cổ** vào mục 6; cập nhật mục 7 (thêm việc chờ duyệt danh sách chức năng).
- Lý do: chủ dự án chốt tên.
- Đã kiểm tra: chỉ sửa tài liệu, không có code.
- File / commit: `4ba45e3`.

### 2026-11-07 — Thêm — Bản đầu hệ thống Chống Tối Cổ (toàn bộ chức năng như shiperx)
- Việc đã làm:
  - Xoá bộ khung Python `b22c5f7` (backend/, Caddyfile, giao diện quản lý bot).
  - Máy chủ mới `server/` (Node.js + TypeScript + Fastify + Socket.IO + Drizzle + PostgreSQL): 13 bảng, migration `server/drizzle/0000_init.sql`; đăng ký / đăng nhập (phiên trong DB); diễn đàn (chuyên mục, chủ đề, trả lời, sửa / xoá, thích, ghim / khoá, hot 24h, trending 7 ngày, tìm kiếm, chèn ảnh); chat cộng đồng realtime nhiều kênh + đếm online; kho album (công khai / chỉ thành viên, HOT, ảnh bìa, ảnh webp + thumbnail); bảng xếp hạng 4 tab; thống kê; trang cá nhân (ảnh đại diện, giới thiệu, đổi mật khẩu); CSKH realtime cho khách và thành viên; quản trị (tổng quan, thành viên / quyền / khoá, chuyên mục, kênh chat, album, CSKH, tính lại bộ đếm); chống CSRF bằng header, rate limit.
  - Giao diện mới `frontend/` (React): toàn bộ trang theo bố cục shiperx nhưng tên, logo, màu, chữ riêng (N2).
  - Triển khai: `Dockerfile` một image, `docker-compose.yml` (app + db, chỉ mở 127.0.0.1:8090), `scripts/install.sh` (thêm site Nginx riêng cho tên miền phụ, certbot tuỳ chọn, không đụng site cũ — N3), `scripts/update.sh`.
  - Viết lại `README.md`, `huongdan.txt`; cập nhật mục 1, 2, 3, 6, 7, 8, 9 file này.
- Lý do: chủ dự án yêu cầu "code toàn bộ như bên shiperx, sau đó tự chỉnh sửa".
- Nguyên nhân gốc (lỗi gặp khi làm): route file tĩnh bị khai báo trùng (B6); CSS ngoài layer đè màu Tailwind (B7); sai kiểu `setHeaders` (B8). Đều đã sửa trước khi push.
- Bài học / cách tránh: B6, B7, B8.
- Đã kiểm tra:
  - `server`: `npm test` 16/16 bài kiểm thử API qua (PGlite trong bộ nhớ); `tsc` không lỗi.
  - `frontend`: `npm run build` (tsc + vite) không lỗi.
  - Chạy app thật tại máy (PGlite trên đĩa) + trình duyệt: trang chủ, đăng nhập, trang chủ đề, gửi trả lời, kho album, quản trị hiển thị và hoạt động đúng.
  - Script socket: tin chat đẩy realtime tới người khác, đếm online đúng, CSKH admin trả lời đẩy realtime tới khách.
  - **Chưa chạy thử:** `docker build` / `docker compose` (máy không có Docker), `install.sh` / `update.sh` / Nginx / certbot trên VPS thật, PostgreSQL thật (chỉ PGlite), giao diện trên điện thoại thật.
- File / commit: `c9bc793`.

### 2026-11-07 — Quyết định — Code trước, kiểm thử sau
- Việc đã làm: thêm dòng quyết định vào mục 6.
- Lý do: chủ dự án yêu cầu "hiện tại tập trung code trước, test sau".
- File / commit: commit ghi quyết định này.
