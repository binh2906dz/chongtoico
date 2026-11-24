import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { useAuth } from "../../auth";
import { Logo } from "../../components/Layout";
import { ErrorBox, Spinner } from "../../components/ui";
import type { Profile } from "../../types";

/**
 * Entry point of the Telegram Mini App.
 *
 * Telegram passes the signed `initData` through the WebApp SDK. We forward it
 * to the server, which verifies the signature (via the bot service), creates
 * the web account and sets the session cookie — the visitor lands on the site
 * already signed in.
 */
export default function Entry() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    void (async () => {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.onload = () => void signIn();
      script.onerror = () => {
        setError("Không tải được Mini App của Telegram. Hãy mở lại từ bot.");
        setBusy(false);
      };
      document.head.appendChild(script);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
    const initData = tg?.initData ?? "";
    if (!initData) {
      setError("Không đọc được dữ liệu Telegram. Hãy mở liên kết từ bot.");
      setBusy(false);
      return;
    }
    try {
      const res = await api<{ user: Profile; created: boolean }>("/api/telegram/miniapp/auth", {
        body: { initData },
      });
      setUser(res.user);
      // Remember where the visitor came from so the visit can be measured.
      const cid = params.get("cid");
      const articleId = params.get("aid");
      void api("/api/telegram/track", {
        body: {
          campaignId: cid,
          articleId: articleId ? Number(articleId) : null,
          ref: "miniapp",
          src: cid ? "campaign" : "start",
          path: location.pathname,
        },
      });
      navigate(cid ? "/" : "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="panel p-6 text-center">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        {busy ? (
          <>
            <Spinner label="Đang kết nối với Telegram..." />
            <p className="text-xs text-muted">Chúng tôi đang xác thực bạn là người mở Mini App này.</p>
          </>
        ) : (
          <>
            <ErrorBox message={error ?? "Có lỗi xảy ra."} />
            <div className="mt-4 space-y-2">
              <Link to="/dang-nhap" className="btn-primary block w-full">
                Đăng nhập bằng tài khoản có sẵn
              </Link>
              <Link to="/" className="btn-ghost block w-full">
                Về trang chủ
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
