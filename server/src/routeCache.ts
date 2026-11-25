/**
 * Cache dùng chung cho các route.
 *
 * Tách ra module riêng để tránh phụ thuộc vòng (circular import) giữa
 * `articles.ts` và `members.ts`: cả hai đều cần biết khi nào phải bỏ cache.
 */

/** Cache trang chủ của khách (30 giây) — xem `routes/members.ts`. */
let guestHomeCache: { at: number; data: Promise<unknown> } | null = null;

/** Cache bộ bài random (5 phút) — xem `routes/articles.ts`. */
let randomCache: { at: number; ids: Promise<number[]> } | null = null;

/**
 * Xoá cache khi có bài viết mới được đăng hoặc bài bị xoá.
 *
 * Nếu không xoá, người truy cập sẽ không thấy bài mới cho tới khi cache hết
 * hạn (tối đa 30 giây với trang chủ, 5 phút với bộ random).
 */
export function invalidateArticleCaches(): void {
  guestHomeCache = null;
  randomCache = null;
}

/** Cache trang chủ của khách: dùng chung cho mọi khách truy cập. */
export function cachedGuestHome<T>(build: () => Promise<T>, ttlMs: number): Promise<T> {
  const now = Date.now();
  if (!guestHomeCache || now - guestHomeCache.at > ttlMs) {
    const entry = { at: now, data: build() };
    entry.data.catch(() => {
      if (guestHomeCache === entry) guestHomeCache = null;
    });
    guestHomeCache = entry;
  }
  return guestHomeCache.data as Promise<T>;
}

/** Cache danh sách ID bài random. */
export function cachedRandomIds(build: () => Promise<number[]>, ttlMs: number): Promise<number[]> {
  const now = Date.now();
  if (!randomCache || now - randomCache.at > ttlMs) {
    const entry = { at: now, ids: build() };
    entry.ids.catch(() => {
      if (randomCache === entry) randomCache = null;
    });
    randomCache = entry;
  }
  return randomCache.ids;
}
