import { useState } from "react";
import { ErrorBox, ListSkeleton, Pagination, Tabs, ThreadRows } from "../components/ui";
import { usePage } from "../usePage";
import { useFetch } from "../useFetch";
import type { ThreadItem } from "../types";

const PER_PAGE = 20;

export default function WhatsNew() {
  const [type, setType] = useState<"latest" | "updated">("updated");
  const [page, setPage] = usePage();
  const { data, error, loading } = useFetch<{ threads: ThreadItem[] }>(`/api/forum/feed?type=${type}&limit=${PER_PAGE}&page=${page}`);
  const hasNext = (data?.threads.length ?? 0) === PER_PAGE;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Có gì mới?</h1>
      <section className="panel">
        <div className="panel-head">
          <Tabs
            tabs={[
              { id: "updated", label: "Bài mới cập nhật" },
              { id: "latest", label: "Chủ đề mới" },
            ]}
            value={type}
            onChange={(t) => {
              setType(t);
              setPage(1);
            }}
          />
        </div>
        {loading && !data ? <ListSkeleton rows={8} /> : error ? <ErrorBox message={error} /> : <ThreadRows threads={data?.threads ?? []} empty="Không có bài viết nào." />}
      </section>
      <Pagination page={page} totalPages={hasNext ? page + 1 : page} onPage={setPage} />
    </div>
  );
}
