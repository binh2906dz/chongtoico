import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
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

  const maxSide = kind === "albums" ? 2000 : kind === "thumbs" ? 1280 : 1600;
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
  if (kind === "thumbs") {
    const small = await sharp(full.data).resize({ width: VARIANTS.s.width, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
    await writeFile(mediaPath(kind, `${key}_s.webp`), small);
  }
  return { key, width: full.info.width, height: full.info.height };
}

/** Extra sizes generated from the full image: `_s` for cards on phones, `_m` for large banners. */
export const VARIANTS = {
  s: { width: 480, kinds: ["thumbs", "albums"] as MediaKind[] },
  m: { width: 1280, kinds: ["albums"] as MediaKind[] },
};
export type Variant = keyof typeof VARIANTS;

/** Returns the path of a size variant, creating it from the full image on first request (older uploads have none). */
export async function ensureVariant(kind: MediaKind, key: string, variant: Variant): Promise<string | null> {
  if (!KEY_RE.test(key) || !VARIANTS[variant].kinds.includes(kind)) return null;
  const file = mediaPath(kind, `${key}_${variant}.webp`);
  try {
    await stat(file);
    return file;
  } catch {
    // not generated yet
  }
  const source = mediaPath(kind, `${key}.webp`);
  try {
    await stat(source);
  } catch {
    return null;
  }
  const out = await sharp(source).resize({ width: VARIANTS[variant].width, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
  const tmp = `${file}.${randomBytes(4).toString("hex")}.part`;
  await writeFile(tmp, out);
  await rename(tmp, file);
  return file;
}

/**
 * Deletes a media file, ignoring failures.
 *
 * On Windows the file can be locked (OneDrive sync, antivirus, a browser still
 * reading it) and `unlink` then fails with EBUSY/EPERM. A leftover file is
 * harmless — the DB rows are already gone — but throwing here would turn a
 * successful delete into a 500 for the user.
 */
async function removeFile(file: string) {
  try {
    await rm(file, { force: true });
  } catch {
    // ignore: locked or already gone
  }
}

export async function removeImage(kind: MediaKind, key: string) {
  if (!KEY_RE.test(key)) return;
  for (const suffix of ["", "_t", "_s", "_m"]) await removeFile(mediaPath(kind, `${key}${suffix}.webp`));
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
  await removeFile(path.join(VIDEO_DIR(), `${key}.${ext}`));
}
