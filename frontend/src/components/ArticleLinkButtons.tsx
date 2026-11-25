/**
 * Nút "Xem ngay" + nút "Kênh VIP" cho bài viết.
 *
 * - "Xem ngay" mở link mua/xem full video (ví dụ anonlink.io).
 * - "Kênh VIP" mở kênh Telegram của site.
 *
 * Cả 2 nút đều mở tab mới, không cần đăng nhập.
 */
export function ArticleLinkButtons({
  watchLink,
  vipLink,
  className = "",
}: {
  watchLink?: string | null;
  vipLink?: string | null;
  className?: string;
}) {
  if (!watchLink && !vipLink) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {watchLink && (
        <a
          href={watchLink}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          ▶ Xem ngay
        </a>
      )}
      {vipLink && (
        <a
          href={vipLink}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand/20"
        >
          👑 Kênh VIP
        </a>
      )}
    </div>
  );
}

export default ArticleLinkButtons;
