import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config.js";
import { badRequest } from "./http.js";

export type MediaKind = "albums" | "avatars" | "posts";

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

  const maxSide = kind === "albums" ? 2000 : 1600;
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
