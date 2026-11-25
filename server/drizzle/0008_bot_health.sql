-- Lịch sử bot bị Telegram ban + bộ đếm số liệu bot (tương đương bot_analytics cũ).
CREATE TABLE IF NOT EXISTS "telegram_bot_incidents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bot_id" varchar(64) NOT NULL,
	"bot_username" varchar(64),
	"kind" varchar(24) NOT NULL DEFAULT 'ban',
	"message" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_bot_incidents_bot_idx" ON "telegram_bot_incidents" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_bot_incidents_time_idx" ON "telegram_bot_incidents" ("detected_at");
--> statement-breakpoint
ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "starts_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "interactions_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "replies_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "banned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "last_ban_reason" text;
