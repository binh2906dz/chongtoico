import { useSearchParams } from "react-router-dom";
import { ErrorBox, Spinner, ThreadRows } from "../components/ui";
import { useFetch } from "../useFetch";
import type { ThreadItem } from "../types";

export default function Search() {
  const [params] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const { data, error, loading } = useFetch<{ threads: ThreadItem[] }>(q.length >= 2 ? `/api/forum/search?q=${encodeURIComponent(q)}` : null);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">
        Kết quả tìm kiếm: <span className="text-gradient">{q}</span>
      </h1>
      <section className="panel">
        {q.length < 2 ? (
          <ErrorBox message="Nhập ít nhất 2 ký tự để tìm." />
        ) : loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : (
          <ThreadRows threads={data?.threads ?? []} empty="Không tìm thấy chủ đề nào." />
        )}
      </section>
    </div>
  );
}
