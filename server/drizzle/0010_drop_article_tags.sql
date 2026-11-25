-- Drop the article tag feature entirely.
-- Articles (articles) are kept as they are; only the tag tables are dropped.
-- NOTE: PGlite accepts only one statement per prepared statement, so every
-- statement here must be separated by the breakpoint marker (lesson B48).
-- The article_tags_slug_uq index and article_tags_count_idx index are
-- dropped automatically together with their table.
DROP TABLE IF EXISTS "article_tag_links";
--> statement-breakpoint
DROP TABLE IF EXISTS "article_tags";
