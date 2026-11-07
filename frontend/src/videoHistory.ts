const KEY = "ctc_video_history";
const MAX = 100;

export function localHistory(): number[] {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberVideo(id: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...localHistory().filter((x) => x !== id)].slice(0, MAX)));
  } catch {
    /* storage full or disabled */
  }
}

export function forgetVideo(id?: number) {
  try {
    if (id === undefined) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(localHistory().filter((x) => x !== id)));
  } catch {
    /* storage disabled */
  }
}
