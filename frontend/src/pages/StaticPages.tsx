import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, PostContent } from "../components/ui";
import { useSite } from "../site";

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="panel mx-auto max-w-3xl space-y-3 p-6 leading-relaxed text-slate-300">
      <h1 className="text-2xl font-black text-white">{title}</h1>
      {children}
    </article>
  );
}

export const Terms = () => (
  <Page title="Điều khoản sử dụng">
    <p>Khi tham gia Chống Tối Cổ, bạn đồng ý:</p>
    <ul className="list-disc space-y-1 pl-6">
      <li>Không đăng nội dung vi phạm pháp luật Việt Nam, đồi trụy, bạo lực, lừa đảo hoặc xúc phạm người khác.</li>
      <li>Không spam, quảng cáo trái phép, mạo danh thành viên hay ban quản trị.</li>
      <li>Chịu trách nhiệm về nội dung mình đăng tải.</li>
      <li>Ban quản trị có quyền xoá nội dung, khoá tài khoản vi phạm mà không cần báo trước.</li>
    </ul>
  </Page>
);

export const Privacy = () => (
  <Page title="Quyền riêng tư">
    <p>Chúng tôi chỉ lưu những thông tin cần thiết để vận hành diễn đàn: tên đăng nhập, mật khẩu (đã mã hoá), ảnh đại diện, nội dung bạn đăng và thời gian hoạt động.</p>
    <p>Chúng tôi không bán hay chia sẻ dữ liệu của bạn cho bên thứ ba. Cookie chỉ dùng để giữ phiên đăng nhập và hội thoại hỗ trợ.</p>
  </Page>
);

export const Contact = () => (
  <Page title="Liên hệ">
    <p>Cần hỗ trợ? Bấm nút <b>CSKH</b> ở góc dưới bên phải màn hình để nhắn trực tiếp với ban quản trị.</p>
    <p>
      Góp ý hoặc báo lỗi, bạn có thể đăng tại chuyên mục{" "}
      <Link to="/dien-dan/gop-y" className="text-brand hover:underline">
        Góp ý – Báo lỗi
      </Link>
      .
    </p>
  </Page>
);

export function Rules() {
  const { site } = useSite();
  return (
    <Page title="Nội quy">
      {site.rules ? (
        <PostContent content={site.rules} />
      ) : (
        <ol className="list-decimal space-y-1.5 pl-6">
          <li>Tôn trọng mọi thành viên. Không chửi bới, phân biệt vùng miền, tôn giáo, giới tính.</li>
          <li>Không đăng nội dung vi phạm pháp luật Việt Nam, đồi trụy, bạo lực, cờ bạc, lừa đảo.</li>
          <li>Không spam, không quảng cáo khi chưa được ban quản trị cho phép.</li>
          <li>Đăng đúng chuyên mục, đặt tiêu đề rõ ràng, không viết toàn chữ in hoa.</li>
          <li>Tôn trọng bản quyền: ghi nguồn khi chia sẻ, không đăng lại nội dung khi chủ sở hữu không cho phép.</li>
          <li>Thấy nội dung vi phạm, hãy bấm "Báo vi phạm" thay vì tranh cãi.</li>
          <li>Vi phạm sẽ bị xoá bài, khoá tài khoản tạm thời hoặc vĩnh viễn tuỳ mức độ.</li>
        </ol>
      )}
    </Page>
  );
}

export function Takedown() {
  const { site } = useSite();
  const { user } = useAuth();
  const [form, setForm] = useState({ reason: "copyright", message: "", contact: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api("/api/reports", { body: { targetType: "site", targetId: 0, ...form } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Page title="Yêu cầu gỡ nội dung">
      {site.takedown ? (
        <PostContent content={site.takedown} />
      ) : (
        <>
          <p>
            Nếu bạn là chủ sở hữu bản quyền hoặc người có liên quan và cho rằng một nội dung trên Chống Tối Cổ vi phạm quyền của bạn, vui lòng gửi
            yêu cầu theo mẫu dưới đây. Ban quản trị sẽ xem xét và phản hồi trong thời gian sớm nhất.
          </p>
          <p>Vui lòng ghi rõ: đường dẫn nội dung, lý do, và giấy tờ / thông tin chứng minh quyền sở hữu (nếu có).</p>
        </>
      )}
      {done ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-200">
          Đã gửi yêu cầu. Chúng tôi sẽ liên hệ lại qua thông tin bạn cung cấp.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 pt-2">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-white">Loại yêu cầu</span>
            <select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              <option value="copyright">Vi phạm bản quyền</option>
              <option value="inappropriate">Nội dung xâm phạm quyền riêng tư / danh dự</option>
              <option value="other">Khác</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-white">Đường dẫn và mô tả</span>
            <textarea
              className="input"
              rows={6}
              maxLength={2000}
              required
              placeholder="Dán đường dẫn nội dung cần gỡ và mô tả lý do..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-white">Email / cách liên hệ</span>
            <input
              className="input"
              maxLength={200}
              required
              placeholder={user ? `Ví dụ: email, hoặc để "${user.username}" để nhận phản hồi qua CSKH` : "email@vidu.com"}
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </label>
          <ErrorBox message={error} />
          <button className="btn-primary px-5 py-2" disabled={sending}>
            {sending ? "Đang gửi..." : "Gửi yêu cầu"}
          </button>
        </form>
      )}
    </Page>
  );
}

export const NotFound = () => (
  <div className="panel mx-auto max-w-lg p-10 text-center">
    <div className="text-5xl font-black text-gradient">404</div>
    <p className="mt-2 text-muted">Trang bạn tìm không tồn tại.</p>
    <Link to="/" className="btn-primary mt-4">
      Về trang chủ
    </Link>
  </div>
);
