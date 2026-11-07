CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(16) NOT NULL,
	"actor_id" integer,
	"thread_id" integer,
	"post_id" integer,
	"video_id" integer,
	"comment_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" integer DEFAULT 0 NOT NULL,
	"reason" varchar(16) NOT NULL,
	"message" varchar(2000) DEFAULT '' NOT NULL,
	"contact" varchar(200) DEFAULT '' NOT NULL,
	"user_id" integer,
	"ip" varchar(64),
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"handled_by" integer,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" varchar(32) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_comment_votes" (
	"comment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "video_saves" (
	"user_id" integer NOT NULL,
	"video_id" integer NOT NULL,
	"list" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_saves_user_id_list_video_id_pk" PRIMARY KEY("user_id","list","video_id")
);
--> statement-breakpoint
CREATE TABLE "video_tag_links" (
	"video_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "video_tag_links_video_id_tag_id_pk" PRIMARY KEY("video_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "video_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(40) NOT NULL,
	"video_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "dislike_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "visibility" varchar(16) DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_video_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."video_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_comment_votes" ADD CONSTRAINT "video_comment_votes_comment_id_video_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."video_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_comment_votes" ADD CONSTRAINT "video_comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_saves" ADD CONSTRAINT "video_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_saves" ADD CONSTRAINT "video_saves_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_tag_links" ADD CONSTRAINT "video_tag_links_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_tag_links" ADD CONSTRAINT "video_tag_links_tag_id_video_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."video_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "video_saves_user_idx" ON "video_saves" USING btree ("user_id","list","created_at");--> statement-breakpoint
CREATE INDEX "video_tag_links_tag_idx" ON "video_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_tags_slug_uq" ON "video_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "video_tags_count_idx" ON "video_tags" USING btree ("video_count");--> statement-breakpoint
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_parent_id_video_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."video_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_comments_parent_idx" ON "video_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "video_votes_created_idx" ON "video_votes" USING btree ("created_at");