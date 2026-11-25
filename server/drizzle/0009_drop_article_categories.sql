-- Drop the article category feature entirely.
-- Articles (articles) are kept as they are; only the category_id column is dropped.
-- NOTE: PGlite accepts only one statement per prepared statement, so every
-- statement here must be separated by the breakpoint marker (lesson B48).
ALTER TABLE "articles" DROP COLUMN IF EXISTS "category_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "articles_category_idx";
--> statement-breakpoint
DROP TABLE IF EXISTS "article_categories";
