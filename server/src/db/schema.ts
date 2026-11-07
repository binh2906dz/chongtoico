import {
  bigint,
  boolean,
  date,
  index,
  integer,
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
  (t) => [uniqueIndex("users_username_lower_uq").on(t.usernameLower)],
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

export const albums = pgTable(
  "albums",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 150 }).notNull(),
    description: varchar("description", { length: 1000 }).notNull().default(""),
    visibility: varchar("visibility", { length: 16 }).notNull().default("public"),
    isHot: boolean("is_hot").notNull().default(false),
    coverImageId: integer("cover_image_id"),
    imageCount: integer("image_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("albums_created_idx").on(t.createdAt), index("albums_hot_idx").on(t.isHot, t.createdAt)],
);

export const albumImages = pgTable(
  "album_images",
  {
    id: serial("id").primaryKey(),
    albumId: integer("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    fileKey: varchar("file_key", { length: 64 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("album_images_album_idx").on(t.albumId, t.sortOrder), uniqueIndex("album_images_key_uq").on(t.fileKey)],
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

export const videoCategories = pgTable(
  "video_categories",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    videoCount: integer("video_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("video_categories_slug_uq").on(t.slug)],
);

export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => videoCategories.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: varchar("description", { length: 5000 }).notNull().default(""),
    fileKey: varchar("file_key", { length: 64 }).notNull(),
    ext: varchar("ext", { length: 8 }).notNull(),
    thumbKey: varchar("thumb_key", { length: 64 }),
    duration: integer("duration").notNull().default(0),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    dislikeCount: integer("dislike_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("videos_file_key_uq").on(t.fileKey),
    index("videos_created_idx").on(t.createdAt),
    index("videos_views_idx").on(t.viewCount),
    index("videos_category_idx").on(t.categoryId, t.createdAt),
  ],
);

export const videoVotes = pgTable(
  "video_votes",
  {
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] })],
);

export const videoComments = pgTable(
  "video_comments",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 2000 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("video_comments_video_idx").on(t.videoId, t.id)],
);

export const videoViewDays = pgTable(
  "video_view_days",
  {
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.day] }), index("video_view_days_day_idx").on(t.day)],
);

export const videoHistory = pgTable(
  "video_history",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("video_history_user_idx").on(t.userId, t.viewedAt)],
);

export type User = typeof users.$inferSelect;
