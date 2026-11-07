import { useRef, useState } from "react";
import { api, errorMessage } from "../api";

export default function Editor({
  value,
  onChange,
  placeholder = "Nội dung...",
  rows = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    let inserted = "";
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await api<{ markup: string }>("/api/uploads/image", { form });
        inserted += `\n${res.markup}\n`;
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    if (!inserted) return;
    const el = ref.current;
    const pos = el?.selectionStart ?? value.length;
    onChange(value.slice(0, pos) + inserted + value.slice(pos));
  }

  return (
    <div className="rounded-lg border border-line bg-bg focus-within:border-brand/70">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
          🖼️ {uploading ? "Đang tải ảnh..." : "Chèn ảnh"}
        </button>
        <span className="text-xs text-muted">Dán link sẽ tự thành liên kết.</span>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <textarea
        ref={ref}
        className="block w-full resize-y bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted"
        rows={rows}
        placeholder={placeholder}
        value={value}
        maxLength={20000}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div className="px-3 pb-2 text-xs text-red-400">{error}</div>}
    </div>
  );
}
