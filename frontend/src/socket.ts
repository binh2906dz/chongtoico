import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Online } from "./types";

let socket: Socket | null = null;
let lastOnline: Online = { members: 0, guests: 0, total: 0, usernames: [] };

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"] });
    socket.on("online", (o: Online) => {
      lastOnline = o;
    });
  }
  return socket;
}

/** Reconnect so the server re-reads cookies (after login, logout or getting a guest support id). */
export function reconnectSocket() {
  const s = getSocket();
  s.disconnect();
  s.connect();
}

export function useOnline(): Online {
  const [online, setOnline] = useState<Online>(lastOnline);
  useEffect(() => {
    const s = getSocket();
    const handler = (o: Online) => setOnline(o);
    s.on("online", handler);
    return () => {
      s.off("online", handler);
    };
  }, []);
  return online;
}
