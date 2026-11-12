import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, Pagination, VideoGridSkeleton } from "../components/ui";
import { ArticleGrid } from "../components/ArticleCard";
import { forgetArticle, localHistory } from "../articleHistory";
import type { ArticleItem } from "../types";

function MemberHistory() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ articles: ArticleItem[]; page: number; totalPages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api<{ articles: ArticleItem[]; page: number; totalPages: number }>(`/api/articles/history?page=${page}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [page, tick]);

  async function act(path: string) {
    try {
      await api(path, { method: "DELETE" });
      setTick((t) => t + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data) return <VideoGridSkeleton />;
  return (
    <>
      {data.articles.length > 0 && (
        <button className="btn-ghost px-3 py-1" onClick={() => confirm("Xoá toàn bộ lịch sử xem?") && act("/api/articles/history")}>
          Xoá toàn bộ lịch sử
        </button>
      )}
      <ArticleGrid articles={data.articles} empty="Bạn chưa xem bài viết nào." onRemove={(a) => act(`/api/articles/history/${a.id}`)} />
      <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
    </>
  );
}

function GuestHistory() {
  const [articles, setArticles] = useState<ArticleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ids = localHistory();
    if (!ids.length) {
      setArticles([]);
      return;
    }
    api<{ articles: ArticleItem[] }>(`/api/articles/by-ids?ids=${ids.join(",")}`)
      .then((res) => setArticles(res.articles))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!articles) return <VideoGridSkeleton />;
  return (
    <>
      <p className="text-sm text-muted">Lịch sử được lưu trên trình duyệt này. Đăng nhập để lưu theo tài khoản.</p>
      {articles.length > 0 && (
        <button
          className="btn-ghost px-3 py-1"
          onClick={() => {
            forgetArticle();
            setArticles([]);
          }}
        >
          Xoá toàn bộ lịch sử
        </button>
      )}
      <ArticleGrid
        articles={articles}
        empty="Bạn chưa xem bài viết nào."
        onRemove={(a) => {
          forgetArticle(a.id);
          setArticles((list) => list?.filter((x) => x.id !== a.id) ?? null);
        }}
      />
    </>
  );
}

export default function ArticleHistory() {
  const { user, loading } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Bài viết đã xem</h1>
      {loading ? <VideoGridSkeleton /> : user ? <MemberHistory /> : <GuestHistory />}
    </div>
  );
}
