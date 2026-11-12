import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, Pagination, Tabs, VideoGridSkeleton } from "../components/ui";
import { ArticleGrid } from "../components/ArticleCard";
import type { ArticleItem } from "../types";

type List = "favorite" | "later";

export default function SavedArticles() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const list: List = params.get("ds") === "xem-sau" ? "later" : "favorite";
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ articles: ArticleItem[]; page: number; totalPages: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    setData(null);
    api<{ articles: ArticleItem[]; page: number; totalPages: number; total: number }>(`/api/articles/saved?list=${list}&page=${page}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [user, list, page, tick]);

  async function remove(a: ArticleItem) {
    try {
      await api(`/api/articles/${a.id}/save`, { body: { list } });
      setTick((t) => t + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (loading) return <VideoGridSkeleton />;
  if (!user) {
    return (
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <p className="text-muted">Đăng nhập để lưu bài viết yêu thích và danh sách xem sau.</p>
        <Link to="/dang-nhap" className="btn-primary mt-4">
          Đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Bài viết đã lưu</h1>
      <Tabs
        tabs={[
          { id: "favorite", label: "❤️ Yêu thích" },
          { id: "later", label: "🕒 Xem sau" },
        ]}
        value={list}
        onChange={(id) => {
          setPage(1);
          setParams(id === "later" ? { ds: "xem-sau" } : {});
        }}
      />
      <ErrorBox message={error} />
      {!data ? (
        <VideoGridSkeleton />
      ) : (
        <>
          <ArticleGrid
            articles={data.articles}
            empty={list === "favorite" ? "Chưa có bài viết yêu thích." : "Danh sách xem sau đang trống."}
            onRemove={remove}
            removeTitle="Bỏ khỏi danh sách"
          />
          <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
