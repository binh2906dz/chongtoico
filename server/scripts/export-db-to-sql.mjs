// Xuất CSDL PGlite (máy dev) ra file SQL để nạp vào PostgreSQL thật trên VPS.
//
// Vì máy dev KHÔNG có pg_dump, script này tự sinh SQL: đọc từng bảng trong
// schema rồi xuất INSERT ... ON CONFLICT DO NOTHING theo đúng thứ tự phụ thuộc.
//
// Dùng (máy dev):
//   cd server && npx tsx scripts/export-db-to-sql.mjs
// Kết quả: server/data/export/chongtoico-<ngày>.sql
//
// Sẽ nạp lên VPS bằng:
//   docker compose exec -T db psql -U chongtoico -d chongtoico < file.sql
//
// LƯU Ý: file SQL KHÔNG chứa mật khẩu/token thật; token bot trong CSDL đã
// được mã hoá AES-256-GCM bằng TOKEN_ENCRYPTION_KEY — phải dùng CÙNG khoá
// đó trên VPS, nếu không token sẽ không giải mã được.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DATA_DIR = process.env.EXPORT_DATA_DIR ?? "./data/pglite";
const OUT_DIR = process.env.EXPORT_OUT_DIR ?? "./data/export";
const OUT_FILE = process.env.EXPORT_OUT_FILE ?? "";

/** Bảng có trong CSDL, theo thứ tự phụ thuộc (cha trước con). */
const TABLES = [
  "users",
  "site_settings",
  "categories",
  "chat_channels",
  "threads",
  "posts",
  "articles",
  "article_images",
  "article_videos",
  "uploads",
  "telegram_users",
  "telegram_links",
  "telegram_user_links",
  "telegram_bots",
  "telegram_bot_incidents",
  "telegram_settings",
  "telegram_campaigns",
  "telegram_campaign_articles",
  "telegram_link_codes",
  "telegram_visits",
  "delivery_log",
  "notification_jobs",
  "article_votes",
  "article_comments",
  "article_comment_votes",
  "article_saves",
  "article_view_days",
  "article_history",
  "post_likes",
  "thread_watches",
  "user_follows",
  "support_conversations",
  "support_messages",
  "notifications",
  "reports",
  "sessions",
];

function sqlString(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString("hex")}'`;
  if (Array.isArray(v)) return `ARRAY[${v.map(sqlString).join(",")}]`;
  // JSON/JSONB: dùng JSON.stringify (KHÔNG dùng String(v) — sẽ ra "[object Object]").
  if (typeof v === "object") {
    let s;
    try {
      s = JSON.stringify(v);
    } catch {
      s = JSON.stringify(String(v));
    }
    if (s === undefined) return "NULL";
    return `'${s.replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const db = new PGlite(DATA_DIR);

const exists = async (t) => {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [t],
  );
  return r.rows[0].n > 0;
};

const cols = async (t) => {
  const r = await db.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position`,
    [t],
  );
  return r.rows;
};

const chunks = [];
const push = (s) => chunks.push(s);

push("-- Xuất CSDL Chống Tối Cổ (PGlite -> SQL) để nạp lên VPS.");
push(`-- Sinh lúc: ${new Date().toISOString()}`);
push("-- Nạp: docker compose exec -T db psql -U chongtoico -d chongtoico < <file>");
push("");
push("SET client_min_messages = warning;");
push("BEGIN;");
push("");

// Tắt ràng buộc FK trong lúc nạp, bật lại sau — an toàn hơn là thứ tự phụ thuộc.
push("-- Tạm bỏ ràng buộc khoá ngoại (bật lại ở cuối)");
push("SET session_replication_role = replica;");
push("");

let totalRows = 0;
for (const t of TABLES) {
  if (!(await exists(t))) continue;
  const cs = await cols(t);
  if (!cs.length) continue;
  const names = cs.map((c) => `"${c.column_name}"`);
  const r = await db.query(`SELECT ${names.join(", ")} FROM "${t}"`);
  totalRows += r.rows.length;
  push(`-- Bảng: ${t} (${r.rows.length} dòng)`);
  if (!r.rows.length) {
    push("");
    continue;
  }
  const colsSql = names.join(", ");
  const CHUNK = 200;
  for (let i = 0; i < r.rows.length; i += CHUNK) {
    const slice = r.rows.slice(i, i + CHUNK);
    const values = slice
      .map((row) => `(${names.map((n) => sqlString(row[n.replace(/"/g, "")])).join(", ")})`)
      .join(",\n  ");
    push(`INSERT INTO "${t}" (${colsSql}) VALUES\n  ${values}\nON CONFLICT DO NOTHING;`);
  }
  push("");
}

push("-- Bật lại ràng buộc khoá ngoại");
push("SET session_replication_role = 'origin';");
push("");
push("COMMIT;");
push("");

// Đặt lại sequence về đúng giá trị lớn nhất đã nạp.
// Nếu không, lần INSERT tiếp theo sẽ đụng khoá chính (duplicate key).
push("-- Đặt lại sequence theo max(id) của từng bảng");
push("DO $$");
push("DECLARE");
push("  r RECORD;");
push("  m BIGINT;");
push("BEGIN");
push("  FOR r IN");
push("    SELECT c.relname AS seq, tc.relname AS tbl");
push("    FROM pg_class c");
push("    JOIN pg_namespace n ON n.oid = c.relnamespace");
push("    JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'");
push("    JOIN pg_class tc ON tc.oid = d.refobjid");
push("    JOIN pg_namespace tn ON tn.oid = tc.relnamespace");
push("    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid");
push("    WHERE c.relkind = 'S' AND n.nspname = 'public' AND tn.nspname = 'public'");
push("      AND a.attname = 'id' AND a.attidentity = ''");
push("  LOOP");
push("    EXECUTE format('SELECT COALESCE(max(id), 0) FROM %I', r.tbl) INTO m;");
push("    EXECUTE format('SELECT setval(%L, GREATEST(%s, 1), true)', r.seq, m);");
push("  END LOOP;");
push("END $$;");
push("");

push(`-- TỔNG: ${totalRows} dòng.`);

await db.close();

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = OUT_FILE || path.join(OUT_DIR, `chongtoico-${new Date().toISOString().slice(0, 10)}.sql`);
fs.writeFileSync(out, chunks.join("\n"), "utf8");
const size = fs.statSync(out).size;
console.log(`OK: ${out} (${totalRows} dòng, ${(size / 1024 / 1024).toFixed(1)} MB)`);
