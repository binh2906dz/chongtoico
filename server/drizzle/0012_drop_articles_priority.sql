-- Xoá cột is_priority: bỏ tính năng "⭐ Ưu tiên" (ghim bài lên đầu trang chủ).
-- Bài viết và media KHÔNG bị ảnh hưởng — chỉ xoá cột cờ boolean.
ALTER TABLE "articles" DROP COLUMN IF EXISTS "is_priority";
--> statement-breakpoint
DROP INDEX IF EXISTS "articles_priority_idx";
