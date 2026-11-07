import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

const NAV = [
  { to: "/", label: "Tổng quan", end: true },
  { to: "/bots", label: "Quản lý Bot", end: false },
];

export default function Layout() {
  const { admin, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      <aside
        className={`${open ? "block" : "hidden"} border-b border-slate-200 bg-white md:block md:min-h-screen md:w-60 md:border-r md:border-b-0`}
      >
        <div className="hidden px-5 py-5 text-lg font-extrabold text-orange-600 md:block">Chongtoico</div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm md:hidden"
          >
            Menu
          </button>
          <span className="font-extrabold text-orange-600 md:hidden">Chongtoico</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {admin?.username} · {admin?.role === "owner" ? "Chủ" : "Quản lý"}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-slate-200 px-3 py-1 hover:bg-slate-50"
            >
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
