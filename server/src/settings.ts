import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/index.js";
import { siteSettings } from "./db/schema.js";
import { adImageUrl } from "./media.js";

export const AD_SLOTS = ["top", "home", "video", "sidebar"] as const;
export type AdSlot = (typeof AD_SLOTS)[number];

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Liên kết phải bắt đầu bằng http:// hoặc https://");

const adSchema = z.object({
  enabled: z.boolean(),
  imageKey: z.string().regex(/^[a-f0-9]{32}$/).nullable(),
  link: httpUrl,
  alt: z.string().trim().max(120).default(""),
});

export const settingSchemas = {
  notice: z.object({
    enabled: z.boolean(),
    text: z.string().trim().max(500, "Thông báo tối đa 500 ký tự."),
    tone: z.enum(["info", "warn", "success"]).default("info"),
    link: httpUrl.default(""),
  }),
  ads: z.object({ top: adSchema, home: adSchema, video: adSchema, sidebar: adSchema } satisfies Record<AdSlot, typeof adSchema>),
  rules: z.object({ text: z.string().trim().max(20000, "Nội dung tối đa 20.000 ký tự.") }),
  takedown: z.object({ text: z.string().trim().max(10000, "Nội dung tối đa 10.000 ký tự.") }),
};

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };
export const SETTING_KEYS = Object.keys(settingSchemas) as SettingKey[];

const emptyAd = { enabled: false, imageKey: null, link: "", alt: "" };
const DEFAULTS: Settings = {
  notice: { enabled: false, text: "", tone: "info", link: "" },
  ads: { top: emptyAd, home: emptyAd, video: emptyAd, sidebar: emptyAd },
  rules: { text: "" },
  takedown: { text: "" },
};

let cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  const rows = await db.select().from(siteSettings).where(inArray(siteSettings.key, SETTING_KEYS));
  const out = structuredClone(DEFAULTS);
  for (const row of rows) {
    const key = row.key as SettingKey;
    try {
      const parsed = settingSchemas[key].safeParse(JSON.parse(row.value));
      if (parsed.success) (out as Record<SettingKey, unknown>)[key] = parsed.data;
    } catch {
      /* keep default */
    }
  }
  cache = out;
  return out;
}

export async function saveSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  const json = JSON.stringify(value);
  await db
    .insert(siteSettings)
    .values({ key, value: json })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: json, updatedAt: new Date() } });
  cache = null;
}

export async function publicSettings() {
  const s = await getSettings();
  const ads: Partial<Record<AdSlot, { imageUrl: string; link: string; alt: string }>> = {};
  for (const slot of AD_SLOTS) {
    const ad = s.ads[slot];
    if (ad.enabled && ad.imageKey) ads[slot] = { imageUrl: adImageUrl(ad.imageKey)!, link: ad.link, alt: ad.alt };
  }
  return {
    notice: s.notice.enabled && s.notice.text ? { text: s.notice.text, tone: s.notice.tone, link: s.notice.link } : null,
    ads,
    rules: s.rules.text,
    takedown: s.takedown.text,
  };
}
