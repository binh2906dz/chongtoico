CREATE TABLE "delivery_log" (
	"campaign_id" varchar(64) NOT NULL,
	"telegram_id" bigint NOT NULL,
	"bot_id" varchar(64),
	"status" varchar(16) DEFAULT 'sent' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_log_campaign_id_telegram_id_pk" PRIMARY KEY("campaign_id","telegram_id")
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"telegram_id" bigint NOT NULL,
	"bot_id" varchar(64),
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_bots" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"username" varchar(64),
	"display_name" varchar(80),
	"status" varchar(16) DEFAULT 'unknown' NOT NULL,
	"auto_responder" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"blocked_count" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_campaigns" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media_type" varchar(16),
	"media_key" varchar(64),
	"media_source" varchar(16),
	"media_note" text,
	"buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule" varchar(16) DEFAULT 'now' NOT NULL,
	"schedule_status" varchar(16) DEFAULT 'paused' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"hour" integer DEFAULT 8 NOT NULL,
	"minute" integer DEFAULT 0 NOT NULL,
	"day_of_week" integer,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"bot_id" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"telegram_id" bigint PRIMARY KEY NOT NULL,
	"user_id" integer,
	"method" varchar(16) DEFAULT 'unknown' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_user_links" (
	"telegram_id" bigint NOT NULL,
	"bot_id" varchar(64) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_user_links_telegram_id_bot_id_pk" PRIMARY KEY("telegram_id","bot_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" varchar(64),
	"first_name" varchar(80),
	"age_verified_at" timestamp with time zone,
	"captcha_ok" boolean DEFAULT false NOT NULL,
	"opt_out" boolean DEFAULT false NOT NULL,
	"opted_out_at" timestamp with time zone,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	"status" varchar(16) DEFAULT 'unknown' NOT NULL,
	"last_bot_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"telegram_id" bigint,
	"user_id" integer,
	"campaign_id" varchar(64),
	"article_id" integer,
	"ref" varchar(24),
	"src" varchar(24),
	"path" text,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source" varchar(16) DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_id" bigint;--> statement-breakpoint
ALTER TABLE "telegram_campaigns" ADD CONSTRAINT "telegram_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_telegram_id_telegram_users_id_fk" FOREIGN KEY ("telegram_id") REFERENCES "public"."telegram_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user_links" ADD CONSTRAINT "telegram_user_links_telegram_id_telegram_users_id_fk" FOREIGN KEY ("telegram_id") REFERENCES "public"."telegram_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_log_user_idx" ON "delivery_log" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "delivery_log_sent_idx" ON "delivery_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "notification_jobs_pick_idx" ON "notification_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "notification_jobs_camp_idx" ON "notification_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "telegram_bots_status_idx" ON "telegram_bots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telegram_campaigns_status_idx" ON "telegram_campaigns" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "telegram_link_codes_exp_idx" ON "telegram_link_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "telegram_links_user_idx" ON "telegram_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_user_links_bot_idx" ON "telegram_user_links" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_users_tid_uq" ON "telegram_users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "telegram_users_status_idx" ON "telegram_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "telegram_users_optout_idx" ON "telegram_users" USING btree ("opt_out");--> statement-breakpoint
CREATE INDEX "telegram_visits_camp_idx" ON "telegram_visits" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "telegram_visits_user_idx" ON "telegram_visits" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "telegram_visits_time_idx" ON "telegram_visits" USING btree ("visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_uq" ON "users" USING btree ("telegram_id") WHERE "users"."telegram_id" IS NOT NULL;