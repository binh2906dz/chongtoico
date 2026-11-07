import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { isStaff, useAuth } from "../auth";
import { useOnline } from "../socket";
import SupportWidget from "./SupportWidget";
import { Avatar } from "./ui";

const NAV = [
  { to: "/", label: "Trang chủ", end: true },
  { to: "/dien-dan", label: "Diễn đàn" },
  { to: "/moi", label: "Có gì mới" },
  { to: "/album", label: "Kho album" },
  { to: "/chat", label: "Chat" },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-black tracking-tight">
        <span className="text-gradient">Chống Tối Cổ</span>
      </span>
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/dang-nhap" className="btn-ghost px-3 py-1.5">
          Đăng nhập
        </Link>
        <Link to="/dang-ky" className="btn-primary hidden px-3 py-1.5 sm:inline-flex">
          Đăng ký
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 hover:bg-panel-2">
        <Avatar user={user} size={32} />
        <span className="hidden max-w-28 truncate text-sm font-semibold md:inline">{user.username}</span>
      </button>
      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-52 overflow-hidden py-1 shadow-xl shadow-black/40">
          <Link to={`/thanh-vien/${user.username}`} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-panel-2">
            Trang cá nhân
          </Link>
          {isStaff(user) && (
            <Link to="/quan-tri" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-brand hover:bg-panel-2">
              Quản trị
            </Link>
          )}
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate("/");
            }}
            className="block w-full cursor-pointer px-4 py-2 text-left text-sm text-red-300 hover:bg-panel-2"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length >= 2) navigate(`/tim-kiem?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <button className="cursor-pointer text-2xl lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            ☰
          </button>
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-semibold ${isActive ? "bg-panel-2 text-brand" : "text-slate-300 hover:text-white"}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <form onSubmit={search} className="ml-auto hidden md:block">
            <input className="input w-52 py-1.5" placeholder="Tìm chủ đề..." value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="ml-auto md:ml-0">
            <UserMenu />
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-line px-4 py-2 lg:hidden">
            <form onSubmit={search} className="mb-2 md:hidden">
              <input className="input" placeholder="Tìm chủ đề..." value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-panel-2 text-brand" : "text-slate-300"}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <div className="border-b border-line bg-panel/60">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-xs text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span>
            Đang online: <b className="text-slate-200">{online.total}</b> ({online.members} thành viên, {online.guests} khách)
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-panel/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted md:flex-row">
          <div>© {new Date().getFullYear()} Chống Tối Cổ. Bảo lưu mọi quyền.</div>
          <div className="flex flex-wrap gap-4">
            <Link to="/dieu-khoan" className="hover:text-white">
              Điều khoản
            </Link>
            <Link to="/quyen-rieng-tu" className="hover:text-white">
              Quyền riêng tư
            </Link>
            <Link to="/lien-he" className="hover:text-white">
              Liên hệ
            </Link>
          </div>
        </div>
      </footer>

      <SupportWidget />
    </div>
  );
}
