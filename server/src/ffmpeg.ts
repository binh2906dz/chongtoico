import { spawn } from "node:child_process";
import { open, rename, rm } from "node:fs/promises";

let available: Promise<boolean> | null = null;

/** ffmpeg is optional (installed in the Docker image); without it uploads still work, just unoptimized. */
export function hasFfmpeg() {
  available ??= new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  return available;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let size = 0;
    p.stdout.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= 20 * 1024 * 1024) chunks.push(c);
    });
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(chunks) });
    });
  });
}

/** True when the ISO-BMFF "moov" box comes before "mdat", i.e. the browser can start playing immediately. */
async function moovFirst(file: string) {
  const fh = await open(file, "r");
  try {
    const { size: total } = await fh.stat();
    const head = Buffer.alloc(16);
    let offset = 0;
    for (let i = 0; i < 64 && offset + 8 <= total; i += 1) {
      await fh.read(head, 0, 16, offset);
      let size = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (size === 1) size = Number(head.readBigUInt64BE(8));
      if (size < 8) return false;
      offset += size;
    }
    return false;
  } finally {
    await fh.close();
  }
}

/** Remuxes mp4/mov in place with the index at the front. Stream copy only (no re-encode). */
export async function faststart(file: string, ext: string) {
  if ((ext !== "mp4" && ext !== "mov") || !(await hasFfmpeg())) return false;
  if (await moovFirst(file)) return false;
  const tmp = `${file}.fs.part`;
  try {
    const { code } = await run(
      "ffmpeg",
      ["-v", "error", "-y", "-i", file, "-map", "0:v", "-map", "0:a?", "-c", "copy", "-movflags", "+faststart", "-f", ext, tmp],
      60 * 60_000,
    );
    if (code !== 0) return false;
    await rename(tmp, file);
    return true;
  } finally {
    await rm(tmp, { force: true });
  }
}

export async function probeVideo(file: string) {
  if (!(await hasFfmpeg())) return null;
  try {
    const { code, stdout } = await run(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file],
      60_000,
    );
    if (code !== 0) return null;
    const data = JSON.parse(stdout.toString("utf8")) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
    return {
      width: data.streams?.[0]?.width ?? 0,
      height: data.streams?.[0]?.height ?? 0,
      duration: Math.round(Number(data.format?.duration ?? 0)) || 0,
    };
  } catch {
    return null;
  }
}

/** One JPEG frame at `atSeconds`, scaled to 640px wide. */
export async function grabFrame(file: string, atSeconds: number) {
  if (!(await hasFfmpeg())) return null;
  try {
    const { code, stdout } = await run(
      "ffmpeg",
      ["-v", "error", "-ss", String(Math.max(0, atSeconds)), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-f", "image2", "-c:v", "mjpeg", "pipe:1"],
      120_000,
    );
    return code === 0 && stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}
