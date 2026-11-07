export type Role = "member" | "mod" | "admin";

export interface Author {
  id: number;
  username: string;
  avatarUrl: string | null;
  role: Role;
  isBanned: boolean;
}

export interface Profile extends Author {
  createdAt: string;
  bio: string;
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

export interface Album {
  id: number;
  title: string;
  description: string;
  visibility: "public" | "members";
  isHot: boolean;
  imageCount: number;
  viewCount: number;
  coverImageId: number | null;
  createdAt: string;
  author: Author;
  locked: boolean;
  coverUrl: string | null;
}

export interface AlbumImage {
  id: number;
  width: number;
  height: number;
  url: string;
  thumbUrl: string;
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

export interface VideoCategory {
  id: number;
  slug: string;
  name: string;
  sortOrder: number;
  videoCount: number;
}

export interface VideoItem {
  id: number;
  title: string;
  thumbUrl: string | null;
  duration: number;
  width: number;
  height: number;
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

export interface VideoTag {
  id: number;
  slug: string;
  name: string;
  videoCount?: number;
}

export interface VideoDetail extends VideoItem {
  description: string;
  videoUrl: string | null;
  locked: boolean;
  author: Author;
  tags: VideoTag[];
}

export interface VideoComment {
  id: number;
  parentId: number | null;
  content: string;
  likeCount: number;
  dislikeCount: number;
  myVote: number;
  createdAt: string;
  author: Author;
  replies: VideoComment[];
}

export type NotificationType = "reply" | "quote" | "comment_reply" | "follow" | "new_thread";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  threadId: number | null;
  postId: number | null;
  videoId: number | null;
  commentId: number | null;
  threadTitle: string | null;
  videoTitle: string | null;
  actor: Author | null;
}

export type AdSlot = "top" | "home" | "video" | "sidebar";

export interface SiteInfo {
  notice: { text: string; tone: "info" | "warn" | "success"; link: string } | null;
  ads: Partial<Record<AdSlot, { imageUrl: string; link: string; alt: string }>>;
  rules: string;
  takedown: string;
}

export type ReportTarget = "video" | "video_comment" | "post" | "site";

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
