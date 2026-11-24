import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { Logo } from "../components/Layout";
import { ErrorBox } from "../components/ui";
import type { Profile } from "../types";

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  if (user && !busy) {
    return (
      <div className="panel mx-auto max-w-md p-6 text-center">
        <p className="mb-4">
          Bạn đã đăng nhập với tên <b>{user.displayName || user.username}</b>.
        </p>
        <Link to="/" className="btn-primary">
          Về trang chủ
        </Link>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (isRegister && password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        // The Telegram endpoint creates the account and hands out a one-time
        // link code, so the person can link Telegram right away.
        const res = await api<{ user: Profile; code: string | null; linkUrl: string | null }>(
          "/api/telegram/browser/register",
          { body: { username, password } },
        );
        setUser(res.user);
        navigate(res.code ? "/tg/lien-ket" : "/", { replace: true });
        return;
      }
      const res = await api<{ user: Profile }>(`/api/auth/${mode}`, { body: { username, password } });
      setUser(res.user);
      const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
      if (canGoBack) navigate(-1);
      else navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <form onSubmit={submit} className="panel space-y-4 p-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="text-center text-xl font-black">{isRegister ? "Tạo tài khoản" : "Đăng nhập"}</h1>
        <div>
          <label className="label">Tên đăng nhập</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={20} autoFocus />
          {isRegister && <div className="mt-1 text-xs text-muted">3–20 ký tự: chữ không dấu, số, dấu chấm, gạch dưới.</div>}
        </div>
        <div>
          <label className="label">Mật khẩu</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </div>
        {isRegister && (
          <div>
            <label className="label">Nhập lại mật khẩu</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        )}
        <ErrorBox message={error} />
        <button className="btn-primary w-full" disabled={busy || !username || !password}>
          {busy ? "Đang xử lý..." : isRegister ? "Đăng ký" : "Đăng nhập"}
        </button>
        <div className="text-center text-sm text-muted">
          {isRegister ? (
            <>
              Đã có tài khoản?{" "}
              <Link to="/dang-nhap" className="text-brand hover:underline">
                Đăng nhập
              </Link>
            </>
          ) : (
            <>
              Chưa có tài khoản?{" "}
              <Link to="/dang-ky" className="text-brand hover:underline">
                Đăng ký ngay
              </Link>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Register = () => <AuthForm mode="register" />;
