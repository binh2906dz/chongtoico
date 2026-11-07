import { useSearchParams } from "react-router-dom";

export function usePage(): [number, (p: number) => void] {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete("trang");
    else next.set("trang", String(p));
    setParams(next);
    window.scrollTo(0, 0);
  };
  return [page, setPage];
}
