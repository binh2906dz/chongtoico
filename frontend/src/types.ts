export type Role = "member" | "mod" | "admin";

export interface Author {
  id: number;
  username: string;
  /** Tên hiển thị; lấy từ Telegram first_name nếu tài khoản tạo từ Mini App. */
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  isBanned: boolean;
}

export interface Profile extends Author {
  createdAt: string;
  bio: string;
  /** "web" | "miniapp" | "telegram" — nơi tài khoản được tạo. */
  source: string;
  /** Telegram id đã liên kết (null nếu chưa liên kết). */
  telegramId: number | null;
  threadCount: number;
  postCount: number;
  likeCount: number;
  messageCount: number;
  lastSeenAt: string;
  banReason: string | null;
  bannedUntil: string | null;
}

export interface Category {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  sortOrder: number;
  staffOnly: boolean;
  threadCount: number;
  postCount: number;
  latestThread?: { id: number; title: string; lastPostAt: string; lastPoster: Author | null } | null;
}

export interface ThreadItem {
  id: number;
  title: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  createdAt: string;
  lastPostAt: string;
  category: { id: number; slug: string; title: string };
  author: Author;
  lastPoster: Author | null;
}

export interface Post {
  id: number;
  content: string;
  isFirst: boolean;
  likeCount: number;
  createdAt: string;
  editedAt: string | null;
  likedByMe: boolean;
  author: Author & { postCount: number; joinedAt: string };
}

export interface Channel {
  id: number;
  slug: string;
  name: string;
  description: string;
  staffOnly: boolean;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  content: string;
  createdAt: string;
  author: Author;
}

export interface Online {
  members: number;
  guests: number;
  total: number;
  usernames: string[];
}

export interface Stats {
  threads: number;
  posts: number;
  members: number;
  newestMember: Author | null;
  online: Online;
}

export interface ArticleCategory {
  id: number;
  slug: string;
  name: string;
  sortOrder: number;
  articleCount: number;
}

export interface ArticleItem {
  id: number;
  title: string;
  /** "none" | "image" | "video" — nguồn của ảnh bìa do admin chọn. */
  coverType: string;
  coverUrl: string | null;
  hasVideo: boolean;
  coverDuration: number;
  imageCount: number;
  videoCount: number;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  rating: number | null;
  membersOnly: boolean;
  hot?: boolean;
  createdAt: string;
  category: { id: number; slug: string; name: string } | null;
  viewedAt?: string;
  recentViews?: number;
}

export interface ArticleTag {
  id: number;
  slug: string;
  name: string;
  articleCount?: number;
}

export interface ArticleMedia {
  id: number;
  type: "image" | "video";
  url: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  duration: number;
  sizeBytes: number;
}

export interface ArticleDetail extends ArticleItem {
  description: string;
  locked: boolean;
  author: Author;
  tags: ArticleTag[];
  images: ArticleMedia[];
  videos: ArticleMedia[];
}

export interface ArticleComment {
  id: number;
  parentId: number | null;
  content: string;
  likeCount: number;
  dislikeCount: number;
  myVote: number;
  createdAt: string;
  author: Author;
  replies: ArticleComment[];
}

export type NotificationType = "reply" | "quote" | "comment_reply" | "follow" | "new_thread";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  threadId: number | null;
  postId: number | null;
  articleId: number | null;
  commentId: number | null;
  threadTitle: string | null;
  articleTitle: string | null;
  actor: Author | null;
}

export type AdSlot = "top" | "home" | "video" | "sidebar";

export interface SiteInfo {
  notice: { text: string; tone: "info" | "warn" | "success"; link: string } | null;
  ads: Partial<Record<AdSlot, { imageUrl: string; link: string; alt: string }>>;
  rules: string;
  takedown: string;
}

export type ReportTarget = "article" | "article_comment" | "post" | "site";

export interface FollowStats {
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
}

export interface SupportMessage {
  id: number;
  fromStaff: boolean;
  content: string;
  createdAt: string;
  staff: Author | null;
}

/* ---------------- Telegram bridge ---------------- */

export type TelegramStatus = "unknown" | "active" | "blocked" | "invalid";

/** Trạng thái của bot: khác với trạng thái của người dùng. */
export type TelegramBotStatus = "live" | "ban" | "error" | "unknown";

export interface TelegramUserRow {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  status: TelegramStatus;
  optOut: boolean;
  notifyEnabled: boolean;
  linkedUserId: number | null;
  linkedUsername: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface TelegramBotRow {
  id: string;
  username: string | null;
  displayName: string | null;
  status: TelegramBotStatus;
  autoResponder: boolean;
  weight: number;
  sentCount: number;
  blockedCount: number;
  lastCheckedAt: string | null;
  lastError: string | null;
  sortOrder: number;
}

export interface TelegramCampaignButton {
  label: string;
  url: string;
}

export interface TelegramCampaign {
  id: string;
  name: string;
  text: string;
  mediaType: "image" | "video" | "none" | null;
  mediaKey: string | null;
  mediaSource: string | null;
  mediaNote: string | null;
  buttons: TelegramCampaignButton[];
  articleIds: number[];
  targetType: "all_linked" | "visited" | "stalled" | "status" | "ids";
  targetIds: Array<number | string>;
  schedule: "now" | "at" | "daily" | "weekly";
  scheduleStatus: "paused" | "active" | "done";
  scheduledAt: string | null;
  hour: number;
  minute: number;
  dayOfWeek: number | null;
  status: "draft" | "queued" | "sending" | "done" | "cancelled" | "paused";
  total: number;
  sentCount: number;
  failedCount: number;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramOverview {
  telegramUsers: number;
  linked: number;
  optOut: number;
  blocked: number;
  sent: number;
  visits: number;
  clicks: number;
  ctr: number;
}

export interface LinkCodeResponse {
  code: string;
  botUsername: string | null;
  deepLink: string;
  expiresAt: string;
}
