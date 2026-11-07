import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { SiteInfo } from "./types";

const EMPTY: SiteInfo = { notice: null, ads: {}, rules: "", takedown: "" };

interface SiteState {
  site: SiteInfo;
  setSite: (s: SiteInfo) => void;
  reload: () => void;
}

const SiteContext = createContext<SiteState>({ site: EMPTY, setSite: () => {}, reload: () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteInfo>(EMPTY);
  const reload = useCallback(() => {
    api<SiteInfo>("/api/site")
      .then(setSite)
      .catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  return <SiteContext.Provider value={{ site, setSite, reload }}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
