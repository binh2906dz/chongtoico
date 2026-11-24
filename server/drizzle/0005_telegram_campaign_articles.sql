ALTER TABLE "telegram_campaigns" ADD COLUMN IF NOT EXISTS "article_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
