-- Thêm 2 liên kết riêng cho bài viết: nút "Xem ngay" và nút "Kênh VIP".
-- Tách khỏi nội dung (description) để giao diện hiển thị thành nút bấm.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "watch_link" text;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "vip_link" text;
