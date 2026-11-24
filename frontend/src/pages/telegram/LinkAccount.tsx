import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { useAuth } from "../../auth";
import { ErrorBox, Spinner } from "../../components/ui";
import type { LinkCodeResponse } from "../../types";

/**
 * Link a Telegram account to the web account.
 *
 * The server issues a one-time code (valid 15 minutes) and a deep link to one
 * of the live bots. The visitor opens the link in Telegram, the bot receives
 * `/start <code>` and the accounts are joined.
 */
export default function LinkAccount() {
  const { user } = useAuth();
  const [data, setData] = useState<LinkCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<LinkCodeResponse>("/api/telegram/link-code");
      setData(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-10">
        <div className="panel p-6 text-center">
          <h1 className="mb-3 text-lg font-black">Liên kết tài khoản Telegram</h1>
          <p className="mb-4 text-sm text-muted">Bạn cần đăng nhập trước khi liên kết với Telegram.</p>
          <Link to="/dang-nhap" className="btn-primary block w-full">
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="panel p-6">
        <h1 className="mb-1 text-lg font-black">Liên kết tài khoản Telegram</h1>
        <p className="mb-4 text-sm text-muted">
          Bấm nút bên dưới để mở bot, rồi gửi lệnh <b>/start</b> để gắn tài khoản Telegram với tài khoản
          <b> {user.displayName || user.username}</b> của bạn.
        </p>

        {user.telegramId ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            ✅ Tài khoản này đã được liên kết với Telegram.
          </div>
        ) : busy ? (
          <Spinner label="Đang tạo mã liên kết..." />
        ) : error ? (
          <>
            <ErrorBox message={error} />
            <button onClick={() => void load()} className="btn-primary mt-4 w-full">
              Thử lại
            </button>
          </>
        ) : data ? (
          <>
            <a href={data.deepLink} target="_blank" rel="noreferrer" className="btn-primary block w-full">
              🔗 Mở bot để liên kết
            </a>
            <div className="mt-4 rounded-lg bg-panel-2 px-3 py-3 text-center">
              <div className="text-xs text-muted">Mã liên kết (dùng 1 lần, hết hạn sau 15 phút)</div>
              <div className="mt-1 font-mono text-2xl font-black tracking-widest">{data.code}</div>
            </div>
            <button onClick={() => void load()} className="btn-ghost mt-3 w-full">
              Tạo mã mới
            </button>
          </>
        ) : null}

        <Link to="/" className="btn-ghost mt-4 block w-full">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
