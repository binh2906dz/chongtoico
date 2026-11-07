export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "ctc" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "same-origin",
    signal: opts.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `Lỗi ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function uploadWithProgress<T = unknown>(path: string, form: FormData, onProgress: (ratio: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.setRequestHeader("X-Requested-With", "ctc");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError((data as { error?: string } | null)?.error || `Lỗi ${xhr.status}`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Mất kết nối khi tải lên.", 0));
    xhr.onabort = () => reject(new ApiError("Đã huỷ tải lên.", 0));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Có lỗi xảy ra.");
