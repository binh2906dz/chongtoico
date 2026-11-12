CREATE TABLE "article_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_comment_votes" (
	"comment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "article_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" integer,
	"content" varchar(2000) NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"dislike_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_history" (
	"user_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_history_user_id_article_id_pk" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "article_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"file_key" varchar(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_saves" (
	"user_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"list" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_saves_user_id_list_article_id_pk" PRIMARY KEY("user_id","list","article_id")
);
--> statement-breakpoint
CREATE TABLE "article_tag_links" (
	"article_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "article_tag_links_article_id_tag_id_pk" PRIMARY KEY("article_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "article_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(40) NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"file_key" varchar(64) NOT NULL,
	"ext" varchar(8) NOT NULL,
	"thumb_key" varchar(64),
	"duration" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_view_days" (
	"article_id" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "article_view_days_article_id_day_pk" PRIMARY KEY("article_id","day")
);
--> statement-breakpoint
CREATE TABLE "article_votes" (
	"article_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_votes_article_id_user_id_pk" PRIMARY KEY("article_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category_id" integer,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"is_hot" boolean DEFAULT false NOT NULL,
	"cover_type" varchar(8) DEFAULT 'none' NOT NULL,
	"cover_image_key" varchar(64),
	"cover_duration" integer DEFAULT 0 NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"video_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"dislike_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_images" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "albums" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_categories" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_comment_votes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_comments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_saves" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_tag_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_view_days" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_votes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "videos" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "album_images" CASCADE;--> statement-breakpoint
DROP TABLE "albums" CASCADE;--> statement-breakpoint
DROP TABLE "video_categories" CASCADE;--> statement-breakpoint
DROP TABLE "video_comment_votes" CASCADE;--> statement-breakpoint
DROP TABLE "video_comments" CASCADE;--> statement-breakpoint
DROP TABLE "video_history" CASCADE;--> statement-breakpoint
DROP TABLE "video_saves" CASCADE;--> statement-breakpoint
DROP TABLE "video_tag_links" CASCADE;--> statement-breakpoint
DROP TABLE "video_tags" CASCADE;--> statement-breakpoint
DROP TABLE "video_view_days" CASCADE;--> statement-breakpoint
DROP TABLE "video_votes" CASCADE;--> statement-breakpoint
DROP TABLE "videos" CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_video_id_videos_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_comment_id_video_comments_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "article_id" integer;--> statement-breakpoint
ALTER TABLE "article_comment_votes" ADD CONSTRAINT "article_comment_votes_comment_id_article_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."article_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comment_votes" ADD CONSTRAINT "article_comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_parent_id_article_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_history" ADD CONSTRAINT "article_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_history" ADD CONSTRAINT "article_history_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_images" ADD CONSTRAINT "article_images_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_saves" ADD CONSTRAINT "article_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_saves" ADD CONSTRAINT "article_saves_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tag_links" ADD CONSTRAINT "article_tag_links_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tag_links" ADD CONSTRAINT "article_tag_links_tag_id_article_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."article_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_videos" ADD CONSTRAINT "article_videos_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_view_days" ADD CONSTRAINT "article_view_days_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_votes" ADD CONSTRAINT "article_votes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_votes" ADD CONSTRAINT "article_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_article_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."article_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_categories_slug_uq" ON "article_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "article_comments_article_idx" ON "article_comments" USING btree ("article_id","id");--> statement-breakpoint
CREATE INDEX "article_comments_parent_idx" ON "article_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "article_history_user_idx" ON "article_history" USING btree ("user_id","viewed_at");--> statement-breakpoint
CREATE INDEX "article_images_article_idx" ON "article_images" USING btree ("article_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "article_images_key_uq" ON "article_images" USING btree ("file_key");--> statement-breakpoint
CREATE INDEX "article_saves_user_idx" ON "article_saves" USING btree ("user_id","list","created_at");--> statement-breakpoint
CREATE INDEX "article_tag_links_tag_idx" ON "article_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_tags_slug_uq" ON "article_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "article_tags_count_idx" ON "article_tags" USING btree ("article_count");--> statement-breakpoint
CREATE UNIQUE INDEX "article_videos_key_uq" ON "article_videos" USING btree ("file_key");--> statement-breakpoint
CREATE INDEX "article_videos_article_idx" ON "article_videos" USING btree ("article_id","sort_order");--> statement-breakpoint
CREATE INDEX "article_view_days_day_idx" ON "article_view_days" USING btree ("day");--> statement-breakpoint
CREATE INDEX "article_votes_created_idx" ON "article_votes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "articles_created_idx" ON "articles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "articles_views_idx" ON "articles" USING btree ("view_count");--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category_id","created_at");--> statement-breakpoint
CREATE INDEX "articles_hot_idx" ON "articles" USING btree ("is_hot","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_article_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."article_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "video_id";