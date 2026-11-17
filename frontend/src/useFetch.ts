import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";

export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [tick, setTick] = useState(0);
  const lastUrl = useRef<string | null>(url);

  useEffect(() => {
    if (!url) return;
    // Đổi URL (chuyển trang / đổi bài) thì phải bỏ dữ liệu cũ, nếu không giao diện
    // sẽ hiện nội dung của trang trước trong lúc tải trang mới.
    if (lastUrl.current !== url) {
      lastUrl.current = url;
      setData(null);
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api<T>(url, { signal: ctrl.signal })
      .then((d) => setData(d))
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
