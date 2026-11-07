import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, errorMessage } from "../api";
import { PostContent } from "./ui";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😅", "😊", "😍", "😘", "😎", "🤩", "🤔", "🤨", "😐", "🙄", "😏", "😴",
  "😭", "😡", "🤬", "😱", "🥶", "🥵", "🤯", "🤡", "👍", "👎", "👏", "🙏", "💪", "🤝", "✌️", "👌",
  "❤️", "💔", "🔥", "⭐", "🎉", "💯", "✅", "❌", "⚠️", "💡", "📌", "🎮", "⚽", "🍺", "☕", "🚀",
];

function ToolButton({ title, onClick, children, disabled }: { title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="min-w-8 cursor-pointer rounded px-2 py-1 text-sm text-slate-300 hover:bg-panel-2 hover:text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

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
  const emojiRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    if (!emojiOpen) return;
    const close = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emojiOpen]);

  function replaceSelection(build: (selected: string) => { text: string; selStart: number; selEnd: number }) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, selStart, selEnd } = build(value.slice(start, end));
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + selStart, start + selEnd);
    });
  }

  function wrap(open: string, close: string) {
    replaceSelection((sel) => ({ text: open + sel + close, selStart: open.length, selEnd: open.length + sel.length }));
  }

  function insert(text: string) {
    replaceSelection(() => ({ text, selStart: text.length, selEnd: text.length }));
  }

  function link() {
    const url = prompt("Nhập đường dẫn (bắt đầu bằng http:// hoặc https://):", "https://");
    if (!url || !/^https?:\/\/\S+$/i.test(url.trim())) return;
    replaceSelection((sel) => {
      const text = sel ? `[url=${url.trim()}]${sel}[/url]` : `[url]${url.trim()}[/url]`;
      return { text, selStart: text.length, selEnd: text.length };
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const map: Record<string, string> = { b: "b", i: "i", u: "u" };
    if (map[key]) {
      e.preventDefault();
      wrap(`[${map[key]}]`, `[/${map[key]}]`);
    }
  }

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
    if (inserted) insert(inserted);
  }

  return (
    <div className="rounded-lg border border-line bg-bg focus-within:border-brand/70">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        <ToolButton title="In đậm (Ctrl+B)" onClick={() => wrap("[b]", "[/b]")} disabled={preview}>
          <b>B</b>
        </ToolButton>
        <ToolButton title="In nghiêng (Ctrl+I)" onClick={() => wrap("[i]", "[/i]")} disabled={preview}>
          <i>I</i>
        </ToolButton>
        <ToolButton title="Gạch chân (Ctrl+U)" onClick={() => wrap("[u]", "[/u]")} disabled={preview}>
          <u>U</u>
        </ToolButton>
        <ToolButton title="Gạch ngang" onClick={() => wrap("[s]", "[/s]")} disabled={preview}>
          <s>S</s>
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <ToolButton title="Trích dẫn" onClick={() => wrap("[quote]", "[/quote]")} disabled={preview}>
          ❝
        </ToolButton>
        <ToolButton title="Ẩn nội dung (spoiler)" onClick={() => wrap("[spoiler]", "[/spoiler]")} disabled={preview}>
          🙈
        </ToolButton>
        <ToolButton title="Đoạn code" onClick={() => wrap("[code]", "[/code]")} disabled={preview}>
          {"</>"}
        </ToolButton>
        <ToolButton title="Chèn liên kết" onClick={link} disabled={preview}>
          🔗
        </ToolButton>
        <ToolButton title="Chèn ảnh" onClick={() => fileRef.current?.click()} disabled={uploading || preview}>
          {uploading ? "⏳" : "🖼️"}
        </ToolButton>
        <div className="relative" ref={emojiRef}>
          <ToolButton title="Biểu tượng cảm xúc" onClick={() => setEmojiOpen((o) => !o)} disabled={preview}>
            😀
          </ToolButton>
          {emojiOpen && (
            <div className="panel absolute top-full left-0 z-30 mt-1 grid w-72 grid-cols-8 gap-0.5 p-2 shadow-xl shadow-black/40">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    insert(em);
                    setEmojiOpen(false);
                  }}
                  className="cursor-pointer rounded p-1 text-lg hover:bg-panel-2"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex gap-1">
          <button type="button" className={`tab px-2 py-1 text-xs ${!preview ? "tab-active" : ""}`} onClick={() => setPreview(false)}>
            Soạn thảo
          </button>
          <button type="button" className={`tab px-2 py-1 text-xs ${preview ? "tab-active" : ""}`} onClick={() => setPreview(true)}>
            Xem trước
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {preview ? (
        <div className="min-h-32 px-3 py-2">{value.trim() ? <PostContent content={value} /> : <span className="text-sm text-muted">Chưa có nội dung.</span>}</div>
      ) : (
        <textarea
          ref={ref}
          className="block w-full resize-y bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted"
          rows={rows}
          placeholder={placeholder}
          value={value}
          maxLength={20000}
          onKeyDown={onKeyDown}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <div className="px-3 pb-2 text-xs text-red-400">{error}</div>}
    </div>
  );
}
