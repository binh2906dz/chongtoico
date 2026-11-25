-- Thêm cột is_priority: bài được admin ghim "ưu tiên" sẽ xếp lên đầu trang chủ.
-- NOTE: PGlite accepts only one statement per prepared statement, so every
-- statement here must be separated by the breakpoint marker (lesson B48).
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "is_priority" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_priority_idx" ON "articles" ("is_priority", "created_at");
