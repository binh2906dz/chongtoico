import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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

export const NotFound = () => (
  <div className="panel mx-auto max-w-lg p-10 text-center">
    <div className="text-5xl font-black text-gradient">404</div>
    <p className="mt-2 text-muted">Trang bạn tìm không tồn tại.</p>
    <Link to="/" className="btn-primary mt-4">
      Về trang chủ
    </Link>
  </div>
);
