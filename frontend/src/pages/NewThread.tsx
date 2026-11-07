import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api";
import { isStaff, useAuth } from "../auth";
import Editor from "../components/Editor";
import { ErrorBox, Spinner } from "../components/ui";
import { useFetch } from "../useFetch";
import type { Category } from "../types";

export default function NewThread() {
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data } = useFetch<{ categories: Category[] }>("/api/forum/categories");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const allowed = (data?.categories ?? []).filter((c) => !c.staffOnly || isStaff(user));

  useEffect(() => {
    if (categoryId !== null || !allowed.length) return;
    const wanted = allowed.find((c) => c.slug === params.get("cm"));
    setCategoryId((wanted ?? allowed[0]).id);
  }, [allowed, categoryId, params]);

  if (authLoading) return <Spinner />;
  if (!user) {
    return (
      <div className="panel mx-auto max-w-lg p-6 text-center">
        <p className="mb-4 text-muted">Bạn cần đăng nhập để tạo chủ đề.</p>
        <Link to="/dang-nhap" className="btn-primary">
          Đăng nhập
        </Link>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ thread: { id: number } }>("/api/forum/threads", { body: { categoryId, title, content } });
      navigate(`/chu-de/${res.thread.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel mx-auto max-w-3xl space-y-4 p-5">
      <h1 className="text-xl font-black">Tạo chủ đề mới</h1>
      <div>
        <label className="label">Chuyên mục</label>
        <select className="input" value={categoryId ?? ""} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {allowed.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Tiêu đề</label>
        <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề chủ đề" />
      </div>
      <div>
        <label className="label">Nội dung</label>
        <Editor value={content} onChange={setContent} rows={12} />
      </div>
      <ErrorBox message={error} />
      <button className="btn-primary" disabled={sending || !title.trim() || !content.trim()}>
        {sending ? "Đang đăng..." : "Đăng chủ đề"}
      </button>
    </form>
  );
}
