import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { badRequest } from "./http.js";

export type MediaKind = "albums" | "avatars" | "posts" | "thumbs" | "ads";

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

export const KEY_RE = /^[a-f0-9]{32}$/;

export const mediaPath = (kind: MediaKind, file: string) => path.join(config.uploadDir, kind, file);

async function ensureDir(kind: MediaKind) {
  await mkdir(path.join(config.uploadDir, kind), { recursive: true });
}

async function probe(input: Buffer) {
  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) throw new Error("no size");
    return meta;
  } catch {
    throw badRequest("File không phải ảnh hợp lệ.");
  }
}

export async function storeImage(kind: MediaKind, input: Buffer): Promise<StoredImage> {
  await probe(input);
  await ensureDir(kind);
  const key = randomBytes(16).toString("hex");
  const base = sharp(input, { animated: false }).rotate();

  if (kind === "avatars") {
    const out = await base.resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    await writeFile(mediaPath(kind, `${key}.webp`), out.data);
    return { key, width: out.info.width, height: out.info.height };
  }

  const maxSide = kind === "albums" ? 2000 : kind === "thumbs" ? 640 : 1600;
  const full = await base
    .clone()
    .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  await writeFile(mediaPath(kind, `${key}.webp`), full.data);

  if (kind === "albums") {
    const thumb = await base.clone().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    await writeFile(mediaPath(kind, `${key}_t.webp`), thumb);
  }
  return { key, width: full.info.width, height: full.info.height };
}

export async function removeImage(kind: MediaKind, key: string) {
  if (!KEY_RE.test(key)) return;
  await rm(mediaPath(kind, `${key}.webp`), { force: true });
  if (kind === "albums") await rm(mediaPath(kind, `${key}_t.webp`), { force: true });
}

export const albumImageUrl = (key: string, thumb = false) => `/media/a/${key}${thumb ? "_t" : ""}.webp`;
export const videoThumbUrl = (key: string | null) => (key ? `/media/t/${key}.webp` : null);
export const adImageUrl = (key: string | null) => (key ? `/media/b/${key}.webp` : null);

export const VIDEO_DIR = () => path.join(config.uploadDir, "videos");
export const videoFileUrl = (key: string, ext: string) => `/media/v/${key}.${ext}`;

const VIDEO_EXTS = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" } as const;
export type VideoExt = keyof typeof VIDEO_EXTS;

export function videoExtFromName(filename: string): VideoExt | null {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "m4v") return "mp4";
  return ext in VIDEO_EXTS ? (ext as VideoExt) : null;
}

/** Checks container magic bytes: ISO-BMFF (mp4/mov) has "ftyp" at offset 4, WebM/Matroska starts with 1A45DFA3. */
export function looksLikeVideo(head: Buffer, ext: VideoExt): boolean {
  if (head.length < 12) return false;
  if (ext === "webm") return head.readUInt32BE(0) === 0x1a45dfa3;
  return head.toString("latin1", 4, 8) === "ftyp";
}

export async function removeVideoFile(key: string, ext: string) {
  if (!KEY_RE.test(key) || !/^[a-z0-9]{2,5}$/.test(ext)) return;
  await rm(path.join(VIDEO_DIR(), `${key}.${ext}`), { force: true });
}
