import { Link, useParams } from "react-router-dom";
import { ErrorBox, Pagination, Spinner, ThreadRows } from "../components/ui";
import { usePage } from "../usePage";
import { useFetch } from "../useFetch";
import type { Category, ThreadItem } from "../types";

export default function CategoryPage() {
  const { slug } = useParams();
  const [page, setPage] = usePage();
  const { data, error, loading } = useFetch<{ category: Category; threads: ThreadItem[]; page: number; totalPages: number }>(
    `/api/forum/categories/${slug}?page=${page}`,
  );
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} />;
  const { category } = data;
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted">
        <Link to="/dien-dan" className="hover:text-white">
          Diễn đàn
        </Link>{" "}
        › {category.title}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">
            {category.icon} {category.title}
          </h1>
          <p className="text-sm text-muted">{category.description}</p>
        </div>
        <Link to={`/tao-chu-de?cm=${category.slug}`} className="btn-primary">
          + Tạo chủ đề
        </Link>
      </div>
      <section className="panel">
        <ThreadRows threads={data.threads} showCategory={false} />
      </section>
      <Pagination page={data.page} totalPages={data.totalPages} onPage={setPage} />
    </div>
  );
}
