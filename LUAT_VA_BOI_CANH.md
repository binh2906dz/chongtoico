# LUẬT VÀ BỐI CẢNH — Chongtoico

> ## ⚠️ LUẬT SỐ 1 — BẮT BUỘC TUYỆT ĐỐI
> **Luôn luôn đọc hết file này TRƯỚC TIÊN**, trước khi trả lời, lập kế hoạch, hay làm bất cứ việc gì — ở mọi phiên chat, mọi lần nhận việc mới.
> Nếu file khác (kể cả `huongdan.txt`) mâu thuẫn với file này thì **file này đúng**.

- Repo: https://github.com/binh2906dz/chongtoico (nhánh `main`)
- Chủ dự án: `binh2906dz`
- Hệ thống cũ (tham khảo, không dùng chung code): https://github.com/binh2906dz/telegram-bot-dashboard

---

## 1. Mục tiêu hệ thống

Nền tảng cộng đồng có **bộ chức năng tham khảo theo shiperx.net**, sửa một ít, gồm: diễn đàn (chủ đề, bài viết, "Có gì mới", hot trong ngày / trending tuần), kênh chat cộng đồng thời gian thực, **mục bài viết đa phương tiện (nhiều ảnh + nhiều video, xem mục 6 ngày 2026-11-12)**, ~~bảng xếp hạng thành viên~~ (đã bỏ 2026-11-08), khung chat CSKH, app Android.

- **Nội dung hợp pháp** — không phải nội dung người lớn (xem N1).
- **Tên và giao diện riêng** — chỉ học bố cục / chức năng, không chép tên, logo, chữ, mã nguồn của shiperx (xem N2).
- Hệ thống mới nhưng **dùng lại một số dữ liệu cũ** từ `data.db` (cụ thể dữ liệu nào: xem mục 7).

_Chi tiết từng chức năng: ~~chờ chủ dự án mô tả~~ → bản đầu đã code theo shiperx (2026-11-07), chủ dự án sẽ chỉnh sửa / thêm sau._

## 2. Cách hoạt động

Đã biết chắc: hệ thống mới **hoạt động hoàn toàn khác** hệ thống cũ. Không được suy luận cách hoạt động từ hệ thống cũ.

Bản đầu (2026-11-07), chi tiết kỹ thuật ở `huongdan.txt`:
- **Khách** xem được diễn đàn, chat, album công khai, ~~xếp hạng~~; nhắn CSKH được. Muốn đăng bài / chat / thích / xem album "chỉ thành viên" phải đăng ký, đăng nhập.
- **Diễn đàn:** chuyên mục → chủ đề → bài trả lời. Thích bài (không tự thích). Chủ bài sửa / xoá bài mình; xoá bài đầu = xoá cả chủ đề. Trang chủ có 3 tab: Mới ra lò, Hot trong ngày (nhiều bài trong 24 giờ), Trending tuần (7 ngày).
- **Chat cộng đồng:** nhiều kênh, tin đến ngay (realtime), đếm người online. Kênh "chỉ BQT" thì thành viên chỉ đọc.
- **Kho album:** BQT (mod / admin) tạo album, tải ảnh, đánh dấu HOT (hiện ở banner trang chủ), đặt công khai hoặc chỉ thành viên.
- ~~**Bảng xếp hạng:** Vinh danh (được thích nhiều), Cao thủ phím (nhiều bài), Lính mới, Phòng giam (đang bị khoá + lý do).~~ (đã bỏ 2026-11-08 — chủ dự án yêu cầu; người bị khoá vẫn hiện lý do trên trang cá nhân)
- **CSKH:** nút nổi góc phải; khách / thành viên nhắn, BQT trả lời trong Quản trị > CSKH, tin đến ngay.
- **Quản trị:** tổng quan số liệu, thành viên (đổi quyền, khoá có thời hạn / vĩnh viễn, mở khoá), chuyên mục, kênh chat, ~~album~~ (thay bằng **bài viết** — mục 6 ngày 2026-11-12), CSKH.

Bản 3 (2026-11-12) — gộp video + album thành **mục bài viết đa phương tiện**:
- **Bài viết:** một bài viết chứa **nhiều ảnh và nhiều video** (hoặc chỉ ảnh, hoặc chỉ video). Chỉ admin đăng. Trang `/bai-viet` (danh sách + lọc chuyên mục + đám mây thẻ + tab sắp xếp + tìm kiếm), `/bai-viet/:id` (chi tiết, gallery ảnh, video, bình luận, bình chọn, yêu thích, xem sau, chia sẻ, báo vi phạm, bài liên quan), `/bai-viet/da-xem`, `/bai-viet/yeu-thich`.
- **Ảnh bìa do admin chọn** — danh sách ngoài (thẻ trang chủ, banner trượt, khối "Bài viết mới nhất") chỉ hiện **1 ảnh hoặc 1 video** do admin chọn.
- ~~**Kho album**~~ và ~~**mảng video**~~ (đã gộp 2026-11-12 — xem mục 6).

Bản 2 (2026-11-07) — lai thêm mảng video:
- **Trang chủ = video:** thanh thể loại, "Xem nhiều hôm nay", "Video mới nhất"; bên dưới là chủ đề, chat, album nổi bật, thống kê (xếp hạng và thẻ ứng dụng đã bỏ 2026-11-08). (Đã thay thế 2026-11-08 bởi: banner trượt video / album HOT + cột "Hay nhất tuần" → thể loại → Xem nhiều hôm nay → Album mới → Đang được xem → Mới nhất → Hay nhất tuần → Có thể bạn chưa xem → Thẻ → khối Cộng đồng gọn: chủ đề + chat + thống kê.)
- **Video:** chỉ **admin** đăng (Quản trị > Video). Trang `/video` có 4 kiểu xếp: Xem nhiều hôm nay (lượt xem trong ngày, giờ Việt Nam), Mới nhất, Hay nhất (tỉ lệ thích), Hot nhất (lượt xem 7 ngày). Lọc theo thể loại, tìm theo tiêu đề. Trang xem video: trình phát, 👍/👎 + tỉ lệ %, bình luận (thành viên), video liên quan.
- **Video đã xem:** thành viên lưu trên máy chủ; khách lưu trên trình duyệt.
- **Theo dõi:** đăng hoặc trả lời chủ đề thì tự theo dõi chủ đề đó; nút Theo dõi / Bỏ theo dõi trong chủ đề; theo dõi thành viên ở trang cá nhân. Trang "Đang theo dõi": chủ đề theo dõi (xếp theo bài mới nhất), chủ đề mới của người mình theo dõi, danh sách người mình theo dõi. **Chưa có thông báo.**
- **Trình soạn thảo:** thanh công cụ đậm / nghiêng / gạch chân / gạch ngang / trích dẫn / ẩn nội dung / code / liên kết / ảnh / emoji, tab Xem trước. Nội dung lưu dạng mã BBCode (`[b]..[/b]`, `[quote=tên]..[/quote]`, `[spoiler]..[/spoiler]`, `[url=..]..[/url]`, `[code]..[/code]`, `[img:mã]`); hiển thị bằng React, không chèn HTML thô.

## 3. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| BQT | Ban quản trị = vai trò `mod` (điều hành viên) và `admin` (quản trị viên) |
| Khoá tài khoản | Thành viên vẫn đăng nhập / đọc / nhắn CSKH, nhưng không đăng bài, chat, thích. Hiện ở "Phòng giam" |
| Album HOT | ~~Album hiện ở banner trang chủ~~ (đã thay bằng **bài viết HOT** — mục 6 ngày 2026-11-12) |
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
| 2026-11-07 | Web **lai giữa shiperx và một web chia sẻ video** (chủ dự án đưa xnhau.pink làm mẫu — đó là web clip sex có thể loại phạm pháp; **chỉ lấy cách tổ chức trang video, không lấy bất kỳ nội dung, tên thể loại hay cơ chế né chặn nào** — N1, N2). |
| 2026-11-07 | Mảng video: **chỉ admin được đăng**, thành viên không đăng. Có: thể loại video (admin quản lý), danh sách Xem nhiều hôm nay / Mới nhất / Hay nhất / Hot nhất, lượt xem + thích/không thích (tỉ lệ %), bình luận dưới video, lịch sử video đã xem. File video **lưu trên VPS** (không nhúng link). Chỉ nhận mp4/webm/mov để trình duyệt phát trực tiếp; ảnh bìa + thời lượng do trình duyệt của admin tạo khi tải lên (không cần ffmpeg trên VPS). |
| 2026-11-07 | Trang chủ: **video là chính** (lưới video); diễn đàn, chat, album, xếp hạng ở mục riêng. |
| 2026-11-08 | **Bỏ bảng xếp hạng** (cả giao diện lẫn API `/api/members/rankings`) và **bỏ thẻ "Ứng dụng Chống Tối Cổ / App Android sắp ra mắt"** ở trang chủ. Kế hoạch làm app Android sau: chưa rõ còn giữ không (mục 7). |
| 2026-11-08 | Sau đánh giá toàn bộ web, chủ dự án chọn **sửa**: lỗi giả mạo IP (chỉ tin IP do Nginx gắn), "Xem nhiều hôm nay" bỏ video 0 lượt (thiếu thì bù theo tổng lượt xem), admin đặt lại mật khẩu thành viên, script sao lưu DB + video, sắp xếp lại file video sau khi tải (ffmpeg `faststart`, không chuyển mã), dọn dẹp (đếm online theo người, xoá ảnh rác, dọn phiên hết hạn). **Chưa làm**: ảnh/tiêu đề xem trước khi chia sẻ link (chủ dự án không chọn). |
| 2026-11-08 | Chủ dự án chọn **thêm** (lấy cách tổ chức từ xnhau / shiperx): báo vi phạm (video / bình luận / bài viết) + hàng chờ BQT; yêu thích / xem sau; nút chia sẻ; thẻ (tag) video + trang tag; "Hay nhất tuần" + "Đang được xem"; khung "Album mới" trên trang chủ; thanh thông báo đầu trang (admin sửa); trang Nội quy + Yêu cầu gỡ nội dung; thông báo (trả lời / trích dẫn / bình luận); thích / không thích bình luận video; video "chỉ thành viên"; ô quảng cáo do admin quản lý. |
| 2026-11-08 | **Gợi ý ngẫu nhiên** để nội dung cũ không bị chìm: video liên quan trộn video cùng thể loại với video ngẫu nhiên; trang chủ có khung video ngẫu nhiên; trang chủ đề (bài viết) có khung "Video đề xuất" ngẫu nhiên. |
| 2026-11-08 | **Làm đẹp giao diện** (web chủ yếu đăng ảnh / video, cần hút người xem; chủ dự án thích thẩm mỹ shiperx — chỉ học cách làm nội dung nổi bật, không chép giao diện / chữ, N2): màu **đỏ – hồng trên nền đen**; **banner trượt lớn** đầu trang chủ (video / album HOT); **thẻ video / album mới** (to hơn, nhãn HOT / MỚI / HD, lượt xem đè lên ảnh); **khung mờ lúc tải** (skeleton); **trang chủ ảnh + video lên trên**, chủ đề diễn đàn + chat dồn xuống dưới gọn lại. **Tối ưu**: tách nhỏ code (khách không tải phần Quản trị / trình soạn thảo), máy chủ nhớ tạm trang chủ 30 giây cho khách, ảnh bìa nhiều cỡ. **Không làm**: xem trước video khi rê chuột, hàng vuốt ngang, thanh điều hướng đáy, lightbox mới, cuộn vô hạn. |
| 2026-11-07 | Thêm: **theo dõi chủ đề / theo dõi thành viên** (trang "Đang theo dõi"), **trình soạn thảo đẹp hơn** (đậm, nghiêng, gạch, trích dẫn, ẩn nội dung, liên kết, ảnh, emoji). Chưa làm thông báo, tin nhắn riêng, báo vi phạm. Phần "sửa giao diện/chức năng có sẵn": chờ chủ dự án mô tả. |
| 2026-11-12 | **Quyền đăng bài: chỉ ADMIN.** Chủ dự án chốt: tài khoản người dùng (member) **không được đăng bài viết / chủ đề, không được trả lời trong chủ đề, không được tải ảnh lên**; **mod và admin mới được tạo album**; **chỉ admin** được đăng bài viết, đăng video, tải ảnh lên. Thực hiện ở **cả máy chủ (API) và giao diện** — ẩn nút ở giao diện không đủ, phải chặn ở API. Thành viên vẫn xem, thích, bình luận video, đăng tin nhắn chat. |
| 2026-11-12 | **Gộp "Video" và "Album" thành một mục "Bài viết".** Chủ dự án chốt: giữ nguyên cấu trúc diễn đàn, nhưng hợp nhất mảng video + album thành **một loại nội dung: bài viết**. Xoá nhãn "📸 Album mới" / "🆕 Video mới nhất" → **"Bài viết mới nhất"**. Một bài viết **có thể chứa nhiều ảnh VÀ nhiều video** (hoặc chỉ ảnh, hoặc chỉ video). Khi hiển thị ra ngoài (thẻ trang chủ, banner trượt) **chỉ hiện 1 ảnh hoặc 1 video do admin chọn làm ảnh bìa** (`articles.coverType` = none/image/video, `coverImageKey`, `coverDuration`). Dữ liệu video + album cũ **xoá sạch** (không chuyển sang). Bảng DB mới: `articles`, `article_images`, `article_videos`, `article_categories`, `article_tags`, `article_tag_links`, `article_votes`, `article_comments`, `article_comment_votes`, `article_saves`, `article_view_days`, `article_history` (thay `videos` / `albums` / `album_images` / `video_*`). Migration `0003_articles.sql`. URL: `/bai-viet`, `/bai-viet/:id`, `/bai-viet/da-xem`, `/bai-viet/yeu-thich`, `/bai-viet/tag/:slug`. |

## 7. Câu hỏi còn mở

- ~~Hệ thống mới làm gì?~~ (đã trả lời một phần ở mục 1, ngày 2026-11-07). ~~Chủ đề?~~ → cộng đồng chung (mục 6). Còn mở: chi tiết từng chức năng và phần "sửa một ít" so với shiperx?
- ~~Tên thương hiệu mới?~~ → **Chống Tối Cổ** (mục 6).
- ~~Duyệt bản nháp danh sách chức năng~~ → chủ dự án chọn "code toàn bộ như shiperx trước" (mục 6). Còn mở: chủ dự án xem bản đầu rồi báo chỗ cần sửa / thêm.
- Dùng lại **những dữ liệu cũ nào** (người dùng Telegram, bot, album, người đăng ký, …)? — chủ dự án chọn sau.
- ~~Chạy thử ở đâu?~~ → VPS hiện tại (mục 6). Còn mở: tên miền phụ cụ thể (vd `beta.<tên miền cũ>`) — chủ dự án tạo bản ghi DNS A rồi chạy `scripts/install.sh`.
- ~~Bộ khung code `b22c5f7`~~ → đã xoá, thay bằng bản Node.js (mục 6).
- Hệ thống cũ có đang dùng Cloudflare / HTTPS kiểu gì? (ảnh hưởng cách cấp HTTPS cho tên miền phụ; `install.sh` mặc định dùng certbot.)
- Đã bỏ thẻ ứng dụng ở trang chủ (2026-11-08). Còn làm **app Android** sau này không?

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
- **B9 — PowerShell 5.1 `Set-Content -Encoding utf8` chèn BOM (EF BB BF) vào đầu file.** Máy dự án dùng PowerShell 5.1. → Sửa file bằng công cụ sửa file của editor, không dùng `Set-Content`/`Out-File`; nếu lỡ dùng thì kiểm tra 3 byte đầu và bỏ BOM.
- **B10 — `trustProxy: true` cho phép giả mạo IP.** Fastify tin mọi `X-Forwarded-For` → kẻ xấu đổi IP tuỳ ý, vượt giới hạn đăng nhập / chống spam / chống đếm trùng lượt xem. → Sau reverse proxy chỉ tin đúng IP/dải mạng của proxy (`TRUST_PROXY`, mặc định loopback + dải nội bộ Docker); Fastify không nhận số hop dạng số, phải là chuỗi IP/CIDR.
- **B12 — Tách code theo trang (lazy) làm tab đang mở hỏng sau khi cập nhật web.** Mỗi lần build, tên file trang đổi; tab cũ xin file cũ không còn → trang trắng. Ngoài ra trang vừa import tĩnh vừa lazy thì Vite không tách được (cảnh báo `INEFFECTIVE_DYNAMIC_IMPORT`). → Bọc `lazy` để tự tải lại trang một lần khi thiếu file (`App.tsx`); trang nào trang chủ đã import tĩnh thì import tĩnh luôn.
- **B11 — Dọn file "rác" có thể xoá nhầm file đang dùng.** Ảnh trình soạn thảo (bảng `uploads`) được nhắc bằng `[img:key]` ở nhiều nơi (bài viết, cài đặt trang, mô tả video). → Job dọn phải kiểm tra MỌI nơi có thể chứa `[img:..]`; thêm chỗ mới dùng trình soạn thảo thì cập nhật `maintenance.ts`.
- **B13 — `DROP TABLE ... CASCADE` tự xoá khoá ngoại trỏ tới bảng bị xoá.** Câu `ALTER TABLE notifications DROP CONSTRAINT ...` chạy sau đó báo "constraint does not exist". → Luôn dùng `DROP CONSTRAINT IF EXISTS` trong migration.
- **B14 — Dọn file media lỗi làm hỏng cả request.** `rm()` file bị khoá (Windows + OneDrive/antivirus, hoặc trình duyệt đang đọc) ném EBUSY/EPERM → request xoá bài viết trả 500 dù dữ liệu đã xoá xong. → `removeImage` / `removeVideoFile` phải nuốt lỗi xoá file (file sót lại vô hại), không làm hỏng request.
- **B15 — `drizzle-kit generate` hỏi tương tác (đổi tên bảng) chết trong môi trường không có TTY.** → Với thay đổi lớn, tự viết SQL migration + snapshot + entry trong `_journal.json` thay vì chạy `generate` ở chế độ tương tác.

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
- File / commit: `2c5ee49`.

### 2026-11-07 — Thêm — Mảng video, theo dõi, trình soạn thảo mới
- Việc đã làm:
  - Máy chủ: 8 bảng mới (`video_categories`, `videos`, `video_votes`, `video_comments`, `video_view_days`, `video_history`, `thread_watches`, `user_follows`) + migration `0001_video_follow.sql`; `routes/videos.ts` (danh sách 4 kiểu xếp, chi tiết + đếm lượt xem theo ngày, bình chọn, bình luận, lịch sử, admin tải video dạng stream xuống đĩa + kiểm tra byte đầu file, sửa / đổi ảnh bìa / xoá, CRUD thể loại); `routes/follow.ts`; tự theo dõi khi đăng / trả lời; `/api/home` trả thêm video; file video phục vụ ở `/media/v/` bằng `@fastify/static` thứ hai (hỗ trợ tua — HTTP Range); ảnh bìa ở `/media/t/`; seed 10 thể loại video; biến `MAX_VIDEO_MB` (mặc định 2048).
  - Giao diện: trang chủ video, `/video`, `/video/the-loai/:slug`, `/video/:id`, `/video/da-xem`, `/dang-theo-doi`; tìm kiếm ra cả video lẫn chủ đề; nút theo dõi ở chủ đề và trang cá nhân; trình soạn thảo BBCode + xem trước + emoji; nút Trích dẫn dùng `[quote=tên]`; Quản trị thêm tab Video (tải lên có thanh tiến trình + huỷ, tự lấy khung hình làm ảnh bìa, chọn khung khác / ảnh từ máy) và Thể loại video; vào thẳng tab bằng `/quan-tri?tab=videos`.
  - Triển khai: `install.sh` thêm khối Nginx riêng cho `/api/admin/videos` (tối đa 2100 MB, không đệm, chờ 1 giờ); `docker-compose.yml` và `.env.example` thêm `MAX_VIDEO_MB`.
- Lý do: chủ dự án chọn lai shiperx + mảng video (mục 6), thêm theo dõi và trình soạn thảo.
- Bài học / cách tránh: B9.
- Đã kiểm tra (theo quyết định "code trước, test sau"): `tsc` máy chủ không lỗi; `npm run build` giao diện không lỗi; khởi động app thật một lần (theo B6): migration chạy, seed tạo thể loại, `/healthz`, `/api/home`, `/api/videos/categories`, `/video` trả 200.
  - **Chưa chạy thử:** tải video thật, phát và tua video, bình chọn, bình luận, lịch sử, theo dõi, trình soạn thảo trên trình duyệt; bộ kiểm thử `npm test` chưa chạy lại và chưa có bài kiểm thử cho phần mới; Nginx với file lớn trên VPS thật.
- File / commit: `23920b4`.

### 2026-11-08 — Thay đổi — Bỏ bảng xếp hạng và thẻ ứng dụng
- Việc đã làm: xoá `RankingsPanel` (Sidebar.tsx), kiểu `Rankings`/`RankUser`, thẻ `AppCard` (nút cài PWA + "App Android sắp ra mắt") khỏi trang chủ; máy chủ xoá hàm `rankings()`, route `/api/members/rankings`, trường `rankings` trong `/api/home`; 2 bài kiểm thử đổi sang kiểm tra trạng thái khoá trên trang cá nhân thay cho bảng xếp hạng. File `manifest.webmanifest` vẫn giữ (trình duyệt vẫn cho "thêm vào màn hình chính").
- Lý do: chủ dự án yêu cầu "xóa phần bảng xếp hạng và ứng dụng".
- Đã kiểm tra: `tsc` máy chủ và `npm run build` giao diện không lỗi; không còn chỗ nào dùng `rankings` / `AppCard`. **Chưa chạy** `npm test`, chưa xem trên trình duyệt.
- File / commit: `fe65946`.

### 2026-11-08 — Sửa lỗi + Thêm — Đánh giá toàn bộ web, bản "lai" shiperx + xnhau
- Việc đã làm:
  - **Sửa:** `TRUST_PROXY` thành danh sách IP/dải mạng (mặc định loopback + dải nội bộ), `docker-compose.yml` không còn ép `"true"`; đếm online khách theo cookie khách / IP thay vì từng tab; "Xem nhiều hôm nay" hiện số lượt hôm nay trên thẻ (video có lượt hôm nay đứng trước, còn lại bù theo tổng lượt xem — thứ tự này đã có từ trước); admin đặt lại mật khẩu thành viên (`POST /api/admin/users/:id/password`, xoá mọi phiên); `maintenance.ts` dọn định kỳ (phiên hết hạn, ảnh trình soạn thảo không còn dùng, lượt xem theo ngày > 60 ngày, thông báo đã đọc > 90 ngày); `scripts/backup.sh` (pg_dump + ảnh, tuỳ chọn video, giữ 7 bản); `ffmpeg.ts` + Dockerfile cài ffmpeg: faststart mp4/mov sau khi tải (chỉ remux, không chuyển mã), tự lấy thời lượng / ảnh bìa khi thiếu.
  - **Thêm (máy chủ):** migration `0002_engagement.sql` (bảng `video_tags`, `video_tag_links`, `video_saves`, `video_comment_votes`, `reports`, `notifications`, `site_settings`; cột `videos.visibility`, `video_comments.parent_id/like_count/dislike_count`); kiểu xếp `week` (Hay nhất tuần) và `random`; "Đang được xem" (bộ nhớ, 30 phút); video đề xuất = cùng thể loại + ngẫu nhiên; `/api/videos/random`, `/watching`, `/tags`, `/saved`, `/:id/save`, vote + trả lời bình luận; video chỉ thành viên (chặn cả file `/media/v/`); `routes/notifications.ts` + `notify.ts` (trả lời chủ đề đang theo dõi, trích dẫn, người mình theo dõi đăng chủ đề, trả lời bình luận, theo dõi mình — đẩy realtime); `routes/site.ts` (cài đặt trang: thanh thông báo, 4 ô quảng cáo ảnh + link, nội dung Nội quy / Gỡ nội dung; báo vi phạm + hàng chờ); `/api/forum/posts/:id/locate`; `/api/home` thêm week / random / watching / tags / latestAlbums.
  - **Thêm (giao diện):** chuông thông báo + trang `/thong-bao`; thanh thông báo đầu trang; ô quảng cáo (đầu trang, giữa trang chủ, dưới video, cột phải video); trang video: Yêu thích / Xem sau, chia sẻ (sao chép link, Facebook, Zalo, Telegram), báo vi phạm, tag, bình luận có trả lời + 👍/👎, khung đề xuất có nút "Đổi video khác", màn khoá cho video chỉ thành viên; `/video` thêm tab Hay nhất tuần + Ngẫu nhiên, lọc theo tag, `/video/tag`; `/video/yeu-thich`; trang chủ thêm Đang được xem, Hay nhất tuần, Có thể bạn chưa xem (ngẫu nhiên), Thẻ phổ biến, Album mới; trang chủ đề thêm báo vi phạm bài viết, khung "Video đề xuất" ngẫu nhiên, tự cuộn tới bài từ thông báo (`/bai/:id`); trang `/noi-quy`, `/go-noi-dung` (form gửi yêu cầu); Quản trị thêm tab Báo vi phạm, Cài đặt trang, nút Đặt lại MK, nhập tag + "chỉ thành viên" khi đăng / sửa video.
- Lý do: chủ dự án yêu cầu đánh giá lại toàn bộ logic và lai hoàn hảo hai web; chọn danh sách sửa + thêm ở mục 6; thêm ý "bài cũ bị quên → đề xuất video ngẫu nhiên".
- Nguyên nhân gốc (lỗi bảo mật): `trustProxy: true` tin mọi `X-Forwarded-For` (B10).
- Bài học / cách tránh: B10, B11.
- Đã kiểm tra (theo "code trước, test sau"): `tsc` máy chủ không lỗi; `npm run build` giao diện không lỗi; `npm test` 16/16 bài cũ vẫn qua; khởi động app thật trên dữ liệu PGlite cũ: migration 0002 chạy được, `/healthz`, `/api/site`, `/api/home`, `/api/videos?sort=week|random`, `/api/videos/tags`, `/api/videos/watching` trả 200.
  - **Chưa chạy thử:** mọi chức năng mới trên trình duyệt; thông báo realtime; báo vi phạm; tag; yêu thích; vote / trả lời bình luận; video chỉ thành viên chặn file; ffmpeg faststart (máy dev không có ffmpeg — chỉ chạy trong Docker); `docker build` với ffmpeg; `backup.sh` và khôi phục trên VPS; chưa có bài kiểm thử cho phần mới.
- File / commit: `698bf49`.

### 2026-11-08 — Thay đổi — Làm đẹp giao diện + tối ưu tốc độ
- Việc đã làm:
  - **Giao diện:** màu đỏ – hồng (`#ff2d55` → `#ff4fa3`) trên nền đen (`index.css`, favicon, manifest); banner trượt lớn đầu trang chủ (`components/Hero.tsx`: xen kẽ video xem nhiều hôm nay + album HOT, tự chuyển 5,5 giây, dừng khi rê chuột, vuốt trên điện thoại; máy tính có cột "Hay nhất tuần" xếp hạng 1–5); thẻ video mới (bo góc, viền sáng khi rê, nhãn 🔥 HOT / MỚI / HD-FHD / 🔒 TV, lượt xem + thời lượng đè lên ảnh, thể loại dưới tiêu đề); thẻ album mới (tiêu đề + lượt xem đè lên ảnh, nhãn HOT / MỚI, số ảnh); tiêu đề mục có vạch màu (`SectionHeader`); khung mờ lúc tải (skeleton) ở trang chủ, video, xem video, album, xem album, đã lưu, đã xem, tìm kiếm, diễn đàn, chủ đề, trang cá nhân; trang chủ sắp lại: banner → thể loại → Xem nhiều hôm nay → Album mới (12) → Đang được xem → quảng cáo → Mới nhất → Hay nhất tuần → Có thể bạn chưa xem → Thẻ → khối "Cộng đồng" gọn (chủ đề 8 bài + chat 260px + thống kê); bỏ banner "Album nổi bật" cột phải (album HOT đã lên banner trượt); khung trang rộng hơn (`max-w-7xl`), thanh menu gạch chân màu, ô tìm kiếm bo tròn; số online chuyển vào đầu trang. Không hiện "0 lượt xem" khi chưa có lượt.
  - **Máy chủ:** cờ `hot` trên thẻ video (12 video xem nhiều nhất 7 ngày, ≥ 10 lượt, tính lại 5 phút); `/api/home` nhớ tạm 30 giây cho khách; ảnh nhiều cỡ: ảnh bìa video lưu tới 1280px + bản `_s` 480px, album thêm `_s` / `_m` (1280px) — ảnh cũ tạo bản cỡ khi có người xem lần đầu (`ensureVariant`), xoá ảnh xoá mọi cỡ.
  - **Tách code:** các trang (trừ trang chủ / Video / Album) tải riêng khi mở; file JS chính 450 KB → 265 KB (gzip 131 → 81 KB), phần Quản trị (40 KB) và trình soạn thảo chỉ tải khi cần.
- Lý do: chủ dự án yêu cầu "kiểm tra và tối ưu lại web… chỉnh giao diện đẹp mắt hơn" (web chủ yếu đăng ảnh / video hot); chọn phương án ở mục 6.
- Bài học / cách tránh: B12.
- Đã kiểm tra: `tsc` máy chủ, `npm run build` giao diện không lỗi; `npm test` 16/16; chạy app thật tại máy với 12 video + 1 album mẫu (ảnh màu tự tạo, chỉ ở dữ liệu thử `server/data/`, không commit): chụp màn hình trang chủ (máy tính + điện thoại), trang xem video — hiển thị đúng; ảnh `_s` trả 200 (3 KB so với 13 KB bản gốc), `_m` trên ảnh bìa video trả 404 đúng thiết kế; `/api/home` khách lần 2 21 ms (lần 1 139 ms).
  - **Chưa chạy thử:** trên điện thoại thật; nhãn HOT với lượt xem thật (dữ liệu mẫu chưa đủ 10 lượt); tự tải lại khi thiếu file trang sau khi cập nhật web; trang quản trị sau khi đổi màu (chỉ đổi màu chữ nút, không đổi bố cục).
- File / commit: `18f3003`.

### 2026-11-12 — Sửa lỗi — Thêm nút đăng bài / đăng video dễ thấy
- Việc đã làm:
  - Thanh đầu có nút **"✍️ Đăng bài"** (menu thả xuống): thành viên → "✍️ Đăng bài viết"; admin thêm "🎬 Đăng video" và "📸 Tạo album"; khách thấy nút "✍️ Đăng bài" dẫn tới trang đăng nhập.
  - Trang chủ: thêm dải nút ngay dưới thanh thể loại (Đăng bài viết / Đăng video / Tạo album).
  - Trang `/video`: thêm nút "⬆️ Đăng video" (admin) và "✍️ Đăng bài".
  - Nút cũ ở cuối trang chủ và trang quản trị vẫn giữ nguyên.
- Lý do: chủ dự án báo "không tìm thấy nút đăng bài hay đăng video" — trước đó nút đăng bài nằm cuối trang chủ (mục Cộng đồng), nút đăng video nằm trong trang quản trị, khó thấy.
- Nguyên nhân gốc (lỗi): điều kiện JSX `{user.role === "admin" || user.role === "mod" && (...)}` bị JS hiểu là `a || (b && c)` nên mục "Tạo album" không hiện với admin (đã sửa bằng ngoặc nhọn).
- Bài học / cách tránh: luôn đặt ngoặc nhọn khi kết hợp `||` và `&&` trong điều kiện JSX.
- Đã kiểm tra: `npm run build` giao diện không lỗi; chạy app thật tại máy, đăng nhập admin: menu thả xuống hiện đủ 3 mục (Đăng bài viết / Đăng video / Tạo album), trang chủ hiện dải nút; khách chưa đăng nhập thấy nút "✍️ Đăng bài" trên thanh đầu.
  - **Chưa chạy thử:** trên điện thoại thật; không đăng bài / video thật qua giao diện mới.
- File / commit: `759fcb5`.

### 2026-11-12 — Thay đổi — Quyền đăng bài: chỉ quản trị viên
- Việc đã làm:
  - **Máy chủ** (`server/src/routes/forum.ts`): `POST /api/forum/threads` → `isAdmin(user)` bắt buộc; `POST /api/forum/threads/:id/posts` (trả lời) → `isAdmin(user)` bắt buộc; `POST /api/uploads/image` (tải ảnh lên) → `isAdmin(user)` bắt buộc. Thêm `isAdmin` vào import.
  - **Giao diện**: thêm `isAdmin()` vào `frontend/src/auth.tsx`; `Layout.tsx` (menu thả xuống) chỉ hiện cho admin, mod chỉ thấy nút "📸 Tạo album", thành viên không thấy nút đăng; `Home.tsx` (dải nút + mục "Đăng chủ đề mới"), `Videos.tsx`, `Forum.tsx`, `CategoryPage.tsx` chỉ hiện nút cho admin; `NewThread.tsx` chặn người không phải admin (thông báo + nút "Vào diễn đàn"); `ThreadPage.tsx` ẩn ô trả lời với người không phải admin.
  - **Kiểm thử** (`server/test/api.test.ts`): đổi các ca thành viên tạo chủ đề / trả lời / tải ảnh sang admin; thêm ca mới "enforces staff-only categories and admin-only posting" (thành viên tạo chủ đề → 403); album vẫn do staff (admin + mod) quản lý, giữ nguyên.
- Lý do: chủ dự án yêu cầu "quyền đăng bài viết hay video chỉ có tài khoản admin mới được đăng, tài khoản người dùng không đăng được"; hỏi thêm và được chốt: **chặn luôn cả trả lời** (diễn đàn do admin quản lý), **album vẫn cho mod** (mục 6 ngày 2026-11-12).
- Bài học / cách tránh: **chỉ ẩn nút ở giao diện là không đủ** — thành viên vẫn gọi thẳng API được; phải chặn ở máy chủ (`isAdmin` trong `auth.ts`) rồi mới ẩn nút ở giao diện. Khi đổi quyền, phải sửa cả **kiểm thử** vì test cũ mô tả hành vi cũ.
- Đã kiểm tra: `npx tsc --noEmit` (máy chủ) không lỗi; `npm run build` (giao diện) không lỗi; `npm test` 16/16 pass; chạy app thật tại máy (cổng 8090) — đăng ký tài khoản thường rồi gọi `POST /api/forum/threads` → **403 Forbidden** như mong đợi; `/healthz` trả `{"ok":true}`.
  - **Chưa chạy thử:** đăng nhập admin trên giao diện thật để xác nhận menu 3 mục; trên điện thoại thật; trên VPS.
- File / commit: `1f9dae9`.

### 2026-11-12 — Thay đổi — Gộp Video + Album thành mục "Bài viết" (đa phương tiện)
- Việc đã làm:
  - **Máy chủ — schema** (`server/src/db/schema.ts`): bỏ `videos`, `albums`, `album_images`, `video_*`; thêm `articles` (tiêu đề, mô tả, chuyên mục, `visibility`, `coverType` none/image/video, `coverImageKey`, `coverDuration`, `imageCount`, `videoCount`, `viewCount`, `likeCount`, `dislikeCount`, `commentCount`), `article_images` (nhiều ảnh, `sortOrder`), `article_videos` (nhiều video, `fileKey`, `ext`, `thumbKey`, `duration`, `sortOrder`), `article_categories`, `article_tags` + `article_tag_links`, `article_votes`, `article_comments` + `article_comment_votes`, `article_saves`, `article_view_days`, `article_history`. Bảng `notifications` đổi `videoId` → `articleId`, `videoComments` → `articleComments`.
  - **Migration** `server/drizzle/0003_articles.sql`: `DROP TABLE ... CASCADE` toàn bộ bảng video/album cũ + tạo bảng bài viết mới kèm index và khoá ngoại.
  - **Máy chủ — API** (`server/src/routes/articles.ts`, mới): danh sách công khai (sắp xếp today/hot/week/best/new/random), tìm kiếm, xem nhiều hôm nay, gợi ý ngẫu nhiên, lịch sử đã xem, yêu thích / xem sau, chi tiết, bình chọn (like/dislike), bình luận + vote bình luận; phía quản trị: tạo / sửa / xoá bài viết, **tải nhiều ảnh** (`POST /api/admin/articles/:id/images`, field `file`), **tải nhiều video** (`POST /api/admin/articles/:id/videos`, field `video`, kèm `thumb` ảnh bìa do trình duyệt tạo), **chọn ảnh bìa** (`POST /api/admin/articles/:id/cover` với `type` none/image/video + `imageId`/`videoId`), cập nhật bộ đếm ảnh/video, xoá ảnh/video và dọn file.
  - **Máy chủ — khác**: `app.ts` đăng ký `articleRoutes`, bỏ `albumRoutes`/`videoRoutes`; `seed.ts` tạo 10 chuyên mục bài viết mặc định; `routes/admin.ts`, `routes/media.ts`, `routes/members.ts`, `routes/notifications.ts`, `routes/site.ts`, `notify.ts`, `maintenance.ts` chuyển sang bài viết.
  - **Giao diện**: thêm `components/ArticleCard.tsx` (thẻ bài viết: ảnh bìa admin chọn + nhãn số ảnh/số video, nhãn HOT, thời lượng video, tỉ lệ thích), `pages/Articles.tsx` (danh sách + chip chuyên mục + đám mây thẻ + tab sắp xếp + tìm kiếm), `pages/ArticlePage.tsx` (nhiều video + gallery ảnh có lightbox + bình luận + bình chọn + yêu thích + xem sau + chia sẻ + báo vi phạm + bài viết liên quan), `pages/SavedArticles.tsx`, `pages/ArticleHistory.tsx`, `articleHistory.ts`, `pages/admin/AdminArticles.tsx` (tạo/sửa bài viết, tải nhiều ảnh + nhiều video, chụp khung hình, chọn bìa). Xoá `VideoCard.tsx`, `Videos.tsx`, `VideoPage.tsx`, `VideoHistory.tsx`, `SavedVideos.tsx`, `videoHistory.ts`, `Albums.tsx`, `AlbumView.tsx`, `admin/AdminVideos.tsx`, `admin/AdminAlbums.tsx`. Cập nhật `types.ts`, `App.tsx` (route `/bai-viet...`), `Home.tsx`, `Hero.tsx` (mục "Bài viết mới nhất"), `Layout.tsx`, `Search.tsx`, `ThreadPage.tsx`, `NotificationBell.tsx`, `admin/Admin.tsx`.
  - **Kiểm thử**: `server/test/api.test.ts` — thay toàn bộ ca video/album bằng ca "articles: admin-only create, upload, members-only lock, cover selection, media serving".
- Lý do: chủ dự án: "gộp mục video và album lại thành 1, vì mai mốt tôi sẽ đăng bài viết có thể có hình ảnh hoặc video hoặc cả 2"; chốt: giữ cấu trúc diễn đàn, gộp thành "bài viết", xoá nhãn album/video ở trang chủ, **dữ liệu cũ xoá sạch** (fresh), **một bài viết chứa được nhiều ảnh + nhiều video**, **ngoài danh sách chỉ hiện 1 ảnh/video do admin chọn làm bìa**.
- Nguyên nhân gốc (lỗi gặp khi làm):
  - `drizzle-kit generate` hỏi tương tác (đổi tên bảng) → chết trong môi trường không TTY. Cách tránh: tự viết SQL migration + snapshot, không chạy generate ở chế độ tương tác.
  - `DROP TABLE videos CASCADE` đã tự xoá khoá ngoại `notifications_video_id_videos_id_fk` ⇒ câu `ALTER TABLE ... DROP CONSTRAINT` sau đó báo lỗi "does not exist". Cách tránh: luôn dùng `DROP CONSTRAINT IF EXISTS`.
- Bài học / cách tránh: khi gộp hai mảng nội dung, phải gộp **cả bảng DB, cả API, cả route, cả thẻ giao diện, cả điều hướng, cả biến thông báo** — nếu để sót một chỗ (ví dụ `notifications.videoId`) thì sẽ hỏng âm thầm. Với bài viết đa phương tiện, cần một trường "ảnh bìa do admin chọn" tách rời khỏi danh sách media, nếu không sẽ không kiểm soát được thẻ hiển thị ngoài.
- Đã kiểm tra: `npm run build` (máy chủ) không lỗi; `npm test` **17/17 pass** (thêm ca "deletes an article and cleans up its media"); `npm run build` (giao diện) không lỗi; chạy app thật tại máy (cổng 8090) — tạo bài viết, tải **3 ảnh + 1 video** thật qua API, đặt ảnh bìa là ảnh thứ 3, xem `/bai-viet` và `/bai-viet/1` trên trình duyệt (thẻ hiện "🖼️ 3 🎬 1", trang chi tiết hiện đủ ảnh + video), `/quan-tri?tab=bai-viet` hiện đủ tab "Bài viết" / "Thể loại bài viết".
  - **Chưa chạy thử:** trên điện thoại thật; trên VPS; tải video lớn (>100MB) qua Nginx; ffmpeg faststart với video thật.
- File / commit: `a4952df` (+ `docs` cho nhật ký).

### 2026-11-13 — Thêm — Dữ liệu mẫu 10 bài viết để test giao diện (chỉ ở máy dev)
- Việc đã làm: tạo 10 bài viết mẫu trong dữ liệu thử của máy dev (PGlite `server/data/` — bị gitignore, **không lên repo, không lên VPS**): 6 bài chỉ có ảnh, 4 bài có cả ảnh lẫn video; 4 bài có video được đặt **ảnh bìa là video** để thử hiển thị bìa dạng video; 1 bài "chỉ thành viên" để thử khoá nội dung; có đủ 10 chuyên mục, 9 thẻ, 2 bài đánh dấu HOT. Script: `server/data/seed-articles.mjs`, `set-video-covers.mjs`, `fix-categories.mjs` (chạy lại được bằng `node data/seed-articles.mjs` khi app đang chạy ở cổng 8090).
- Lý do: chủ dự án yêu cầu "đăng 10 bài viết để test" sau khi gộp video + album.
- Đã kiểm tra: `/api/articles?sort=new` trả đúng 10 bài (id 34–43) với `imageCount` / `videoCount` / `coverType` đúng; media phục vụ 200 (`/media/a/*.webp` image/webp, `/media/v/*.mp4` video/mp4, `/media/t/*.webp` ảnh bìa video); xem trên trình duyệt: `/bai-viet` hiện 10 thẻ, `/bai-viet/34` hiện đủ ảnh + video + thẻ + bài liên quan, trang chủ hiện banner trượt + "Bài viết mới nhất" + "Hay nhất tuần" + "Xem nhiều hôm nay" + "Đang được xem" + "Có thể bạn chưa xem" + "Thẻ phổ biến" đầy dữ liệu.
- **Lưu ý**: file video mẫu là MP4 giả (76 byte, chỉ có header) nên trình duyệt **không phát được** — chỉ dùng để kiểm tra bố cục / nhãn / số liệu, không kiểm tra phát video thật. Muốn xem video thật thì đăng bằng tay ở Quản trị > Bài viết.
- **Chưa làm**: không commit dữ liệu mẫu; chưa chạy thử trên điện thoại thật / VPS.
