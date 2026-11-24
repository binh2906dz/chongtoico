ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "token_encrypted" text;
--> statement-breakpoint
ALTER TABLE "telegram_bots" ADD COLUMN IF NOT EXISTS "telegram_id" varchar(32);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
