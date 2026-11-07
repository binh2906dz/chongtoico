import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { reconnectSocket } from "./socket";
import type { Profile } from "./types";

interface AuthState {
  user: Profile | null;
  loading: boolean;
  setUser: (u: Profile | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: Profile | null }>("/api/auth/me");
      setUserState(res.user);
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userIdRef = useRef<number | null>(null);
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  const setUser = useCallback((u: Profile | null) => {
    if (userIdRef.current !== (u?.id ?? null)) reconnectSocket();
    userIdRef.current = u?.id ?? null;
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, [setUser]);

  return <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export const isStaff = (u: Profile | null) => !!u && (u.role === "admin" || u.role === "mod");
