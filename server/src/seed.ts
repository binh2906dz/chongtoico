import { count, eq } from "drizzle-orm";
import { hashPassword } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { articleCategories, categories, chatChannels, users } from "./db/schema.js";

const DEFAULT_CATEGORIES = [
  { slug: "thong-bao", title: "Thông báo", description: "Tin tức và thông báo từ ban quản trị.", icon: "📢", staffOnly: true },
  { slug: "tan-gau", title: "Tán gẫu", description: "Chuyện trên trời dưới đất, vào là có bạn.", icon: "💬" },
  { slug: "tin-tuc", title: "Tin tức – Thời sự", description: "Cập nhật tin nóng trong nước và thế giới.", icon: "📰" },
  { slug: "giai-tri", title: "Giải trí", description: "Phim ảnh, âm nhạc, game, thể thao.", icon: "🎮" },
  { slug: "cong-nghe", title: "Công nghệ", description: "Điện thoại, máy tính, phần mềm, mẹo vặt.", icon: "💻" },
  { slug: "mua-ban", title: "Mua bán – Rao vặt", description: "Trao đổi, mua bán giữa thành viên.", icon: "🛒" },
  { slug: "gop-y", title: "Góp ý – Báo lỗi", description: "Góp ý xây dựng diễn đàn, báo lỗi website.", icon: "🛠️" },
];

const DEFAULT_CHANNELS = [
  { slug: "chung", name: "Chung", description: "Kênh chat chung của cộng đồng." },
  { slug: "luat", name: "Luật", description: "Nội quy kênh chat.", staffOnly: true },
  { slug: "thong-bao", name: "Thông báo", description: "Thông báo từ ban quản trị.", staffOnly: true },
  { slug: "bao-loi", name: "Báo lỗi", description: "Báo lỗi website, góp ý nhanh." },
];

const DEFAULT_ARTICLE_CATEGORIES = [
  { slug: "hai-huoc", name: "Hài hước" },
  { slug: "giai-tri", name: "Giải trí" },
  { slug: "am-nhac", name: "Âm nhạc" },
  { slug: "the-thao", name: "Thể thao" },
  { slug: "game", name: "Game" },
  { slug: "tin-tuc", name: "Tin tức" },
  { slug: "cong-nghe", name: "Công nghệ" },
  { slug: "doi-song", name: "Đời sống" },
  { slug: "du-lich", name: "Du lịch" },
  { slug: "am-thuc", name: "Ẩm thực" },
];

export async function seed(log: (msg: string) => void = console.log) {
  const [{ n: vcCount }] = await db.select({ n: count() }).from(articleCategories);
  if (vcCount === 0) {
    await db.insert(articleCategories).values(DEFAULT_ARTICLE_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i + 1 })));
    log(`seed: created ${DEFAULT_ARTICLE_CATEGORIES.length} article categories`);
  }
  const [{ n: catCount }] = await db.select({ n: count() }).from(categories);
  if (catCount === 0) {
    await db.insert(categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i + 1 })));
    log(`seed: created ${DEFAULT_CATEGORIES.length} categories`);
  }
  const [{ n: chCount }] = await db.select({ n: count() }).from(chatChannels);
  if (chCount === 0) {
    await db.insert(chatChannels).values(DEFAULT_CHANNELS.map((c, i) => ({ ...c, sortOrder: i + 1 })));
    log(`seed: created ${DEFAULT_CHANNELS.length} chat channels`);
  }
  if (config.adminUsername && config.adminPassword) {
    const lower = config.adminUsername.toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, lower)).limit(1);
    if (!existing) {
      await db.insert(users).values({
        username: config.adminUsername,
        usernameLower: lower,
        passwordHash: await hashPassword(config.adminPassword),
        role: "admin",
      });
      log(`seed: created admin account "${config.adminUsername}"`);
    }
  }
}
