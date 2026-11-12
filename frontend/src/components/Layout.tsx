import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { isStaff, useAuth } from "../auth";
import { useOnline } from "../socket";
import { AdBanner, NoticeBar } from "./Extras";
import NotificationBell from "./NotificationBell";
import SupportWidget from "./SupportWidget";
import { Avatar, PageSkeleton } from "./ui";

const NAV = [
  { to: "/", label: "Trang chủ", end: true },
  { to: "/video", label: "Video" },
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

function CreateMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) {
    return (
      <Link to="/dang-nhap" className="btn-primary hidden px-3 py-1.5 sm:inline-flex">
        ✍️ Đăng bài
      </Link>
    );
  }

  const canPost = user.role === "admin" || user.role === "mod" || user.role === "member";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-primary px-3 py-1.5 text-sm">
        ✍️ Đăng <span className="hidden sm:inline">bài</span>
        <span className="ml-1 text-xs">▾</span>
      </button>
      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-56 overflow-hidden py-1 shadow-xl shadow-black/40">
          {canPost && (
            <Link to="/tao-chu-de" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-panel-2">
              <span>✍️</span> Đăng bài viết
            </Link>
          )}
          {user.role === "admin" && (
            <Link to="/quan-tri?tab=videos" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-panel-2">
              <span>🎬</span> Đăng video
            </Link>
          )}
          {(user.role === "admin" || user.role === "mod") && (
            <Link to="/quan-tri?tab=albums" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-panel-2">
              <span>📸</span> Tạo album
            </Link>
          )}
        </div>
      )}
    </div>
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
          <Link to="/dang-theo-doi" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-panel-2">
            Đang theo dõi
          </Link>
          <Link to="/video/yeu-thich" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-panel-2">
            Yêu thích / Xem sau
          </Link>
          <Link to="/video/da-xem" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-panel-2">
            Video đã xem
          </Link>
          <Link to="/thong-bao" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-panel-2">
            Thông báo
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
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
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
                className={({ isActive }) =>
                  `relative rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                    isActive
                      ? "text-white after:absolute after:inset-x-3 after:-bottom-[9px] after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-brand after:to-brand-2"
                      : "text-slate-400 hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <form onSubmit={search} className="relative ml-auto hidden md:block">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">🔍</span>
            <input
              className="input w-56 rounded-full bg-panel py-1.5 pl-9 transition-all focus:w-72"
              placeholder="Tìm video, chủ đề..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <CreateMenu />
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-line px-4 py-2 lg:hidden">
            <form onSubmit={search} className="mb-2 md:hidden">
              <input className="input" placeholder="Tìm video, chủ đề..." value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-bold ${isActive ? "bg-brand/15 text-brand" : "text-slate-300"}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <NoticeBar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <div className="mb-4 flex items-center gap-2 text-xs text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span>
            <b className="text-slate-200">{online.total}</b> người đang online ({online.members} thành viên, {online.guests} khách)
          </span>
        </div>
        <AdBanner slot="top" className="mb-5" />
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line bg-panel/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted md:flex-row">
          <div>© {new Date().getFullYear()} Chống Tối Cổ. Bảo lưu mọi quyền.</div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/noi-quy" className="hover:text-white">
              Nội quy
            </Link>
            <Link to="/dieu-khoan" className="hover:text-white">
              Điều khoản
            </Link>
            <Link to="/go-noi-dung" className="hover:text-white">
              Yêu cầu gỡ nội dung
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
