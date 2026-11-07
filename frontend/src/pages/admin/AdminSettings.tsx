import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../../api";
import Editor from "../../components/Editor";
import { ErrorBox, Spinner } from "../../components/ui";
import { useSite } from "../../site";
import type { AdSlot, SiteInfo } from "../../types";

interface Ad {
  enabled: boolean;
  imageKey: string | null;
  link: string;
  alt: string;
}

interface Settings {
  notice: { enabled: boolean; text: string; tone: "info" | "warn" | "success"; link: string };
  ads: Record<AdSlot, Ad>;
  rules: { text: string };
  takedown: { text: string };
}

const SLOTS: { id: AdSlot; label: string; hint: string }[] = [
  { id: "top", label: "Đầu mọi trang", hint: "Ngay dưới thanh menu, hiện ở tất cả các trang. Ảnh ngang, ví dụ 1200×120." },
  { id: "home", label: "Giữa trang chủ", hint: "Giữa các khung video trên trang chủ. Ví dụ 1200×150." },
  { id: "video", label: "Dưới trình phát video", hint: "Ngay dưới video đang xem. Ví dụ 800×100." },
  { id: "sidebar", label: "Cột phải trang video", hint: "Trên danh sách video đề xuất. Ví dụ 400×300." },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="font-bold">{title}</h2>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <ErrorBox message={error} />
      <button
        className="btn-primary px-4 py-1.5"
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          setError(null);
          try {
            await onSave();
            setState("saved");
            setTimeout(() => setState("idle"), 2000);
          } catch (e) {
            setError(errorMessage(e));
            setState("idle");
          }
        }}
      >
        {state === "saving" ? "Đang lưu..." : state === "saved" ? "✓ Đã lưu" : "Lưu"}
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const { setSite } = useSite();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [adImages, setAdImages] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ settings: Settings; adImages: Record<string, string | null> }>("/api/admin/settings")
      .then((r) => {
        setSettings(r.settings);
        setAdImages(r.adImages);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!settings) return <Spinner />;

  async function save<K extends keyof Settings>(key: K) {
    const res = await api<{ site: SiteInfo }>(`/api/admin/settings/${key}`, { method: "PUT", body: settings![key] });
    setSite(res.site);
  }

  const setNotice = (patch: Partial<Settings["notice"]>) => setSettings((s) => s && { ...s, notice: { ...s.notice, ...patch } });
  const setAd = (slot: AdSlot, patch: Partial<Ad>) => setSettings((s) => s && { ...s, ads: { ...s.ads, [slot]: { ...s.ads[slot], ...patch } } });

  async function uploadAd(slot: AdSlot, file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api<{ key: string; url: string }>("/api/admin/settings/ad-image", { form });
      setAd(slot, { imageKey: res.key });
      setAdImages((m) => ({ ...m, [slot]: res.url }));
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <Section title="📢 Thanh thông báo đầu trang">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.notice.enabled} onChange={(e) => setNotice({ enabled: e.target.checked })} />
          Hiện thanh thông báo
        </label>
        <textarea
          className="input"
          rows={2}
          maxLength={500}
          placeholder="Nội dung thông báo..."
          value={settings.notice.text}
          onChange={(e) => setNotice({ text: e.target.value })}
        />
        <div className="flex flex-wrap gap-3">
          <select className="input w-auto" value={settings.notice.tone} onChange={(e) => setNotice({ tone: e.target.value as Settings["notice"]["tone"] })}>
            <option value="info">Màu xanh dương (thông tin)</option>
            <option value="warn">Màu vàng (cảnh báo)</option>
            <option value="success">Màu xanh lá (tin vui)</option>
          </select>
          <input
            className="input flex-1"
            placeholder="Liên kết 'Xem chi tiết' (không bắt buộc, https://...)"
            value={settings.notice.link}
            onChange={(e) => setNotice({ link: e.target.value })}
          />
        </div>
        <SaveButton onSave={() => save("notice")} />
      </Section>

      <Section title="🪧 Ô quảng cáo">
        <p className="text-xs text-muted">Chỉ nhận ảnh banner + liên kết (không chạy mã script). Ảnh được nén sang WebP, tối đa 1600px.</p>
        {SLOTS.map((slot) => {
          const ad = settings.ads[slot.id];
          const img = ad.imageKey ? adImages[slot.id] : null;
          return (
            <div key={slot.id} className="space-y-2 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={ad.enabled} onChange={(e) => setAd(slot.id, { enabled: e.target.checked })} />
                  {slot.label}
                </label>
                <span className="text-xs text-muted">{slot.hint}</span>
              </div>
              {img && <img src={img} alt="" className="max-h-32 rounded border border-line" />}
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-ghost cursor-pointer px-3 py-1 text-sm">
                  {img ? "Đổi ảnh" : "Chọn ảnh"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadAd(slot.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {img && (
                  <button className="btn-ghost px-3 py-1 text-sm text-red-300" onClick={() => setAd(slot.id, { imageKey: null })}>
                    Gỡ ảnh
                  </button>
                )}
                <input className="input flex-1" placeholder="Liên kết khi bấm (https://...)" value={ad.link} onChange={(e) => setAd(slot.id, { link: e.target.value })} />
                <input className="input w-48" placeholder="Mô tả ảnh" maxLength={120} value={ad.alt} onChange={(e) => setAd(slot.id, { alt: e.target.value })} />
              </div>
            </div>
          );
        })}
        <SaveButton onSave={() => save("ads")} />
      </Section>

      <Section title="📜 Trang Nội quy">
        <p className="text-xs text-muted">Để trống để dùng nội quy mặc định. Hỗ trợ định dạng như bài viết.</p>
        <Editor value={settings.rules.text} onChange={(text) => setSettings((s) => s && { ...s, rules: { text } })} rows={10} />
        <SaveButton onSave={() => save("rules")} />
      </Section>

      <Section title="✋ Trang Yêu cầu gỡ nội dung">
        <p className="text-xs text-muted">Đoạn giới thiệu phía trên biểu mẫu. Để trống để dùng nội dung mặc định.</p>
        <Editor value={settings.takedown.text} onChange={(text) => setSettings((s) => s && { ...s, takedown: { text } })} rows={6} />
        <SaveButton onSave={() => save("takedown")} />
      </Section>
    </div>
  );
}
