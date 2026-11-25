import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 32 }).notNull(),
    usernameLower: varchar("username_lower", { length: 32 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    avatarKey: varchar("avatar_key", { length: 64 }),
    bio: varchar("bio", { length: 500 }).notNull().default(""),
    /** Display name shown in the UI. For Telegram-created accounts this is the Telegram first_name. */
    displayName: varchar("display_name", { length: 80 }),
    /** "web" | "miniapp" | "telegram" — where the account was created. */
    source: varchar("source", { length: 16 }).notNull().default("web"),
    /** Linked Telegram account (1 account per Telegram user). */
    telegramId: bigint("telegram_id", { mode: "number" }),
    role: varchar("role", { length: 16 }).notNull().default("member"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    bannedUntil: timestamp("banned_until", { withTimezone: true }),
    banReason: varchar("ban_reason", { length: 300 }),
    threadCount: integer("thread_count").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_lower_uq").on(t.usernameLower),
    // Partial unique index: most accounts are web-only (NULL telegram_id). A plain
    // UNIQUE index would reject the second NULL, so the index is partial.
    uniqueIndex("users_telegram_id_uq").on(t.telegramId).where(sql`${t.telegramId} IS NOT NULL`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    description: varchar("description", { length: 300 }).notNull().default(""),
    icon: varchar("icon", { length: 16 }).notNull().default("💬"),
    sortOrder: integer("sort_order").notNull().default(0),
    staffOnly: boolean("staff_only").notNull().default(false),
    threadCount: integer("thread_count").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug)],
);

export const threads = pgTable(
  "threads",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    isPinned: boolean("is_pinned").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    lastPostAt: timestamp("last_post_at", { withTimezone: true }).notNull().defaultNow(),
    lastPostUserId: integer("last_post_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("threads_category_idx").on(t.categoryId, t.isPinned, t.lastPostAt),
    index("threads_last_post_idx").on(t.lastPostAt),
    index("threads_created_idx").on(t.createdAt),
    index("threads_user_idx").on(t.userId),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isFirst: boolean("is_first").notNull().default(false),
    likeCount: integer("like_count").notNull().default(0),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("posts_thread_idx").on(t.threadId, t.id), index("posts_created_idx").on(t.createdAt)],
);

export const postLikes = pgTable(
  "post_likes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    description: varchar("description", { length: 200 }).notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    staffOnly: boolean("staff_only").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("chat_channels_slug_uq").on(t.slug)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 1000 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_channel_idx").on(t.channelId, t.id)],
);

export const articleCategories = pgTable(
  "article_categories",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    articleCount: integer("article_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("article_categories_slug_uq").on(t.slug)],
);

/**
 * A published article: may contain any number of images and any number of videos.
 * `coverImageKey` is the single picture shown in listings (home page, grids, banners);
 * the admin picks it from the uploaded media. `coverType` records where it came from.
 */
export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => articleCategories.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    /** Link nút "Xem ngay" (ví dụ link mua full video) — rỗng = không hiện nút. */
    watchLink: text("watch_link"),
    /** Link nút "Kênh VIP" (kênh Telegram) — rỗng = không hiện nút. */
    vipLink: text("vip_link"),
    /** "public" | "members" — members-only articles hide the files from guests. */
    visibility: varchar("visibility", { length: 16 }).notNull().default("public"),
    isHot: boolean("is_hot").notNull().default(false),
    /** "none" | "image" | "video" — what the cover picture was taken from. */
    coverType: varchar("cover_type", { length: 8 }).notNull().default("none"),
    coverImageKey: varchar("cover_image_key", { length: 64 }),
    /** Duration of the cover video in seconds (for the ▶ badge), 0 for image covers. */
    coverDuration: integer("cover_duration").notNull().default(0),
    imageCount: integer("image_count").notNull().default(0),
    videoCount: integer("video_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    dislikeCount: integer("dislike_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("articles_created_idx").on(t.createdAt),
    index("articles_views_idx").on(t.viewCount),
    index("articles_category_idx").on(t.categoryId, t.createdAt),
    index("articles_hot_idx").on(t.isHot, t.createdAt),
  ],
);

export const articleImages = pgTable(
  "article_images",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    fileKey: varchar("file_key", { length: 64 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("article_images_article_idx").on(t.articleId, t.sortOrder), uniqueIndex("article_images_key_uq").on(t.fileKey)],
);

export const articleVideos = pgTable(
  "article_videos",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    fileKey: varchar("file_key", { length: 64 }).notNull(),
    ext: varchar("ext", { length: 8 }).notNull(),
    thumbKey: varchar("thumb_key", { length: 64 }),
    duration: integer("duration").notNull().default(0),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("article_videos_key_uq").on(t.fileKey), index("article_videos_article_idx").on(t.articleId, t.sortOrder)],
);

export const uploads = pgTable(
  "uploads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileKey: varchar("file_key", { length: 64 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uploads_key_uq").on(t.fileKey)],
);

export const supportConversations = pgTable(
  "support_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestKey: varchar("guest_key", { length: 64 }),
    guestName: varchar("guest_name", { length: 60 }),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    unreadStaff: integer("unread_staff").notNull().default(0),
    unreadUser: integer("unread_user").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_conv_user_idx").on(t.userId),
    index("support_conv_guest_idx").on(t.guestKey),
    index("support_conv_last_idx").on(t.status, t.lastMessageAt),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => supportConversations.id, { onDelete: "cascade" }),
    fromStaff: boolean("from_staff").notNull().default(false),
    staffUserId: integer("staff_user_id").references(() => users.id, { onDelete: "set null" }),
    content: varchar("content", { length: 2000 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("support_messages_conv_idx").on(t.conversationId, t.id)],
);

export const threadWatches = pgTable(
  "thread_watches",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: integer("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.threadId] }), index("thread_watches_thread_idx").on(t.threadId)],
);

export const userFollows = pgTable(
  "user_follows",
  {
    followerId: integer("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: integer("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followingId] }), index("user_follows_following_idx").on(t.followingId)],
);

export const articleVotes = pgTable(
  "article_votes",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.userId] }), index("article_votes_created_idx").on(t.createdAt)],
);

export const articleComments = pgTable(
  "article_comments",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** One level of replies: a reply always points at a top-level comment. */
    parentId: integer("parent_id").references((): AnyPgColumn => articleComments.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 2000 }).notNull(),
    likeCount: integer("like_count").notNull().default(0),
    dislikeCount: integer("dislike_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("article_comments_article_idx").on(t.articleId, t.id), index("article_comments_parent_idx").on(t.parentId)],
);

export const articleCommentVotes = pgTable(
  "article_comment_votes",
  {
    commentId: integer("comment_id")
      .notNull()
      .references(() => articleComments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const articleTags = pgTable(
  "article_tags",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 40 }).notNull(),
    articleCount: integer("article_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("article_tags_slug_uq").on(t.slug), index("article_tags_count_idx").on(t.articleCount)],
);

export const articleTagLinks = pgTable(
  "article_tag_links",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => articleTags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] }), index("article_tag_links_tag_idx").on(t.tagId)],
);

export const articleSaves = pgTable(
  "article_saves",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    /** "favorite" (Yêu thích) | "later" (Xem sau) */
    list: varchar("list", { length: 16 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.list, t.articleId] }), index("article_saves_user_idx").on(t.userId, t.list, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    /** "video" | "video_comment" | "post" | "site" (takedown request not tied to one item) */
    targetType: varchar("target_type", { length: 16 }).notNull(),
    targetId: integer("target_id").notNull().default(0),
    reason: varchar("reason", { length: 16 }).notNull(),
    message: varchar("message", { length: 2000 }).notNull().default(""),
    contact: varchar("contact", { length: 200 }).notNull().default(""),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    ip: varchar("ip", { length: 64 }),
    /** "open" | "resolved" | "dismissed" */
    status: varchar("status", { length: 16 }).notNull().default("open"),
    handledBy: integer("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("reports_status_idx").on(t.status, t.id), index("reports_target_idx").on(t.targetType, t.targetId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "reply" | "quote" | "comment_reply" | "follow" | "new_thread" */
    type: varchar("type", { length: 16 }).notNull(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "cascade" }),
    threadId: integer("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }),
    articleId: integer("article_id").references(() => articles.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => articleComments.id, { onDelete: "cascade" }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.id), index("notifications_unread_idx").on(t.userId, t.isRead)],
);

export const siteSettings = pgTable("site_settings", {
  key: varchar("key", { length: 32 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articleViewDays = pgTable(
  "article_view_days",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.day] }), index("article_view_days_day_idx").on(t.day)],
);

export const articleHistory = pgTable(
  "article_history",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.articleId] }), index("article_history_user_idx").on(t.userId, t.viewedAt)],
);

export type User = typeof users.$inferSelect;

/* ------------------------------------------------------------------ *
 * Telegram bridge (web <-> Telegram bot service)
 *
 * The bot service (separate Node process) holds the Telegram bot tokens and
 * never touches this database directly: it talks to the web over
 * /api/bot/* (guarded by X-Bot-Secret). The web owns every decision
 * (who to message, what to send, when) and stores the queue + logs here.
 * ------------------------------------------------------------------ */

/** A Telegram person, tracked independently of any web account. */
export const telegramUsers = pgTable(
  "telegram_users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    username: varchar("username", { length: 64 }),
    firstName: varchar("first_name", { length: 80 }),
    ageVerifiedAt: timestamp("age_verified_at", { withTimezone: true }),
    captchaOk: boolean("captcha_ok").notNull().default(false),
    /** The person pressed "Từ chối nhận" — never message them again. */
    optOut: boolean("opt_out").notNull().default(false),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    /** The person pressed "Nhận thông báo" to opt back in. */
    notifyEnabled: boolean("notify_enabled").notNull().default(true),
    /** "unknown" | "active" | "blocked" | "invalid" */
    status: varchar("status", { length: 16 }).notNull().default("unknown"),
    lastBotId: varchar("last_bot_id", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("telegram_users_tid_uq").on(t.telegramId),
    index("telegram_users_status_idx").on(t.status),
    index("telegram_users_optout_idx").on(t.optOut),
  ],
);

/** Which bots a Telegram person has started (a person may start several). */
export const telegramUserLinks = pgTable(
  "telegram_user_links",
  {
    telegramId: bigint("telegram_id", { mode: "number" })
      .notNull()
      .references(() => telegramUsers.id, { onDelete: "cascade" }),
    botId: varchar("bot_id", { length: 64 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.telegramId, t.botId] }), index("telegram_user_links_bot_idx").on(t.botId)],
);
/**
 * Ties a Telegram person to a web account. This is the backbone of every
 * measurement feature: without it we cannot tell which Telegram person opened
 * which campaign. `userId` is NULL until the person has a web account.
 */
export const telegramLinks = pgTable(
  "telegram_links",
  {
    telegramId: bigint("telegram_id", { mode: "number" })
      .notNull()
      .primaryKey()
      .references(() => telegramUsers.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** "miniapp" | "browser" | "code" */
    method: varchar("method", { length: 16 }).notNull().default("unknown"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [index("telegram_links_user_idx").on(t.userId)],
);

/**
 * Delivery history — the guard against sending the same campaign twice.
 * Primary key (campaign_id, telegram_id) makes a duplicate INSERT a no-op.
 */
export const deliveryLog = pgTable(
  "delivery_log",
  {
    campaignId: varchar("campaign_id", { length: 64 }).notNull(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    botId: varchar("bot_id", { length: 64 }),
    /** "sent" | "failed" | "blocked" | "skipped" */
    status: varchar("status", { length: 16 }).notNull().default("sent"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.telegramId] }),
    index("delivery_log_user_idx").on(t.telegramId),
    index("delivery_log_sent_idx").on(t.sentAt),
  ],
);

/** Web visits coming from Telegram — measures how effective the reminders are. */
export const telegramVisits = pgTable(
  "telegram_visits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    telegramId: bigint("telegram_id", { mode: "number" }),
    userId: integer("user_id"),
    campaignId: varchar("campaign_id", { length: 64 }),
    articleId: integer("article_id"),
    /** "bot" | "miniapp" | "campaign" | "start" */
    ref: varchar("ref", { length: 24 }),
    /** "start" | "campaign" | "push" */
    src: varchar("src", { length: 24 }),
    path: text("path"),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("telegram_visits_camp_idx").on(t.campaignId),
    index("telegram_visits_user_idx").on(t.telegramId),
    index("telegram_visits_time_idx").on(t.visitedAt),
  ],
);

/** The send queue: the web decides, the bot executes. */
export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    campaignId: varchar("campaign_id", { length: 64 }).notNull(),
    telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
    /** NULL = the bot picks a live bot by itself. */
    botId: varchar("bot_id", { length: 64 }),
    /** { text, parseMode, buttons[], webUrl, media{} } */
    payload: jsonb("payload").notNull(),
    /** "queued" | "sending" | "sent" | "failed" | "skipped" | "cancelled" */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notification_jobs_pick_idx").on(t.status, t.scheduledAt),
    index("notification_jobs_camp_idx").on(t.campaignId),
  ],
);

/**
 * Bot registry — metadata only. Tokens live exclusively in the bot service,
 * never in the web (unless the encrypted fallback is explicitly enabled).
 */
export const telegramBots = pgTable(
  "telegram_bots",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    username: varchar("username", { length: 64 }),
    displayName: varchar("display_name", { length: 80 }),
    /** "live" | "ban" | "error" | "unknown" */
    status: varchar("status", { length: 16 }).notNull().default("unknown"),
    autoResponder: boolean("auto_responder").notNull().default(true),
    /** Distribution weight when picking a bot for a message. */
    weight: integer("weight").notNull().default(1),
    sentCount: integer("sent_count").notNull().default(0),
    blockedCount: integer("blocked_count").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Encrypted token (AES-256-GCM). Null when the token lives in the bot service only. */
    tokenEncrypted: text("token_encrypted"),
    /** The numeric Telegram id of the bot, used for deep links. */
    telegramId: varchar("telegram_id", { length: 32 }),
  },
  (t) => [index("telegram_bots_status_idx").on(t.status)],
);

/**
 * Global settings of the Telegram side: the reply keyboard, the scheduled
 * send hour, the slogans and the message templates.
 */
export const telegramSettings = pgTable("telegram_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-time link code — only the SHA-256 hash is stored, never the code itself. */
export const telegramLinkCodes = pgTable(
  "telegram_link_codes",
  {
    codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    botId: varchar("bot_id", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("telegram_link_codes_exp_idx").on(t.expiresAt)],
);

/** A reminder campaign written by an admin. */
export const telegramCampaigns = pgTable(
  "telegram_campaigns",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    text: text("text").notNull().default(""),
    /** "image" | "video" | "none" */
    mediaType: varchar("media_type", { length: 16 }),
    /** Media file key inside media/. */
    mediaKey: varchar("media_key", { length: 64 }),
    /** "article" | "upload" */
    mediaSource: varchar("media_source", { length: 16 }),
    mediaNote: text("media_note"),
    /** [{ label, url }] */
    buttons: jsonb("buttons").notNull().default([]),
    /** Article ids linked inside the message body. */
    articleIds: jsonb("article_ids").notNull().default([]),
    /** "all_linked" | "visited" | "stalled" | "status" | "ids" */
    targetType: varchar("target_type", { length: 16 }).notNull(),
    targetIds: jsonb("target_ids").notNull().default([]),
    /** "now" | "at" | "daily" | "weekly" */
    schedule: varchar("schedule", { length: 16 }).notNull().default("now"),
    /** "paused" | "active" | "done" — a schedule never runs until an admin activates it. */
    scheduleStatus: varchar("schedule_status", { length: 16 }).notNull().default("paused"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** Hour of day in Vietnam time. */
    hour: integer("hour").notNull().default(8),
    minute: integer("minute").notNull().default(0),
    /** 0 = Sunday .. 6 = Saturday (weekly schedule). */
    dayOfWeek: integer("day_of_week"),
    /** "draft" | "queued" | "sending" | "done" | "cancelled" | "paused" */
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    total: integer("total").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("telegram_campaigns_status_idx").on(t.status, t.createdAt)],
);
