import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth.js";
import { config } from "../config.js";
import { badRequest, notFound } from "../http.js";

/**
 * Backup and system information.
 *
 * The dump is produced by pg_dump inside the app container. When the tool is
 * not available (for example on a PGlite development machine) the endpoint
 * answers with a clear message instead of failing silently.
 */

const execFileAsync = promisify(execFile);

/** The name of one dump file. */
const dumpName = () => `chongtoico-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.sql`;

/** Is the app talking to a real PostgreSQL server? */
function isPostgres(): boolean {
  return config.databaseUrl.startsWith("postgres://") || config.databaseUrl.startsWith("postgresql://");
}

/** Build the pg_dump arguments out of the connection string. */
function dumpArgs(): string[] {
  const url = new URL(config.databaseUrl);
  const args = ["--no-owner", "--no-privileges", "--clean", "--if-exists"];
  if (url.hostname) args.push("-h", url.hostname);
  if (url.port) args.push("-p", url.port || "5432");
  if (url.username) args.push("-U", decodeURIComponent(url.username));
  args.push(url.pathname.replace(/^\//, "") || "postgres");
  return args;
}

export default async function systemRoutes(app: FastifyInstance) {
  /* ---------------- system information ---------------- */

  /** A short overview of the machine and of the folders that take space. */
  app.get("/api/admin/system/info", async (req) => {
    requireAdmin(req);

    const disk = await import("node:fs").then((fs) => fs.statfsSync(config.uploadDir));
    const usage = {
      totalBytes: Number(disk.blocks) * Number(disk.bsize),
      freeBytes: Number(disk.bavail) * Number(disk.bsize),
    };

    let backups: { name: string; size: number; createdAt: string }[] = [];
    try {
      const names = await readdir(config.backupDir);
      for (const name of names) {
        if (!name.endsWith(".sql")) continue;
        const info = await stat(path.join(config.backupDir, name));
        backups.push({ name, size: info.size, createdAt: info.mtime.toISOString() });
      }
      backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      // The folder may not exist yet — that is not an error.
    }

    return {
      database: isPostgres() ? "PostgreSQL" : "PGlite (phát triển)",
      canDump: isPostgres(),
      uploadsDir: config.uploadDir,
      backupDir: config.backupDir,
      disk: {
        totalBytes: usage.totalBytes,
        freeBytes: usage.freeBytes,
        usedBytes: usage.totalBytes - usage.freeBytes,
      },
      backups,
    };
  });

  /* ---------------- create a dump ---------------- */

  /** Create a database dump and return its name. */
  app.post("/api/admin/system/backup", async (req) => {
    requireAdmin(req);
    if (!isPostgres()) {
      throw badRequest("Máy chủ hiện dùng PGlite nên không có pg_dump. Chỉ dùng được trên bản triển khai PostgreSQL.");
    }

    await mkdir(config.backupDir, { recursive: true });
    const name = dumpName();
    const target = path.join(config.backupDir, name);

    try {
      await execFileAsync("pg_dump", dumpArgs(), {
        env: { ...process.env, PGPASSWORD: decodeURIComponent(new URL(config.databaseUrl).password || "") },
        maxBuffer: 1024 * 1024 * 256,
        timeout: 10 * 60 * 1000,
      }).then(async ({ stdout }) => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(target, stdout, "utf8");
      });
    } catch (e) {
      throw badRequest(`Không tạo được bản sao lưu: ${(e as Error).message.slice(0, 200)}`);
    }

    await pruneBackups();
    const info = await stat(target);
    return { name, size: info.size };
  });

  /* ---------------- download a dump ---------------- */

  /** Send one dump to the browser. */
  app.get("/api/admin/system/backup/:name", async (req, reply) => {
    requireAdmin(req);
    const { name } = z.object({ name: z.string().trim().regex(/^[A-Za-z0-9._-]+$/, "Tên file không hợp lệ.") }).parse(req.params);
    const target = path.join(config.backupDir, name);
    // Never let a name escape the backup folder.
    if (!target.startsWith(config.backupDir)) throw badRequest("Tên file không hợp lệ.");
    try {
      await stat(target);
    } catch {
      throw notFound("Không tìm thấy bản sao lưu.");
    }
    reply.header("Content-Type", "application/sql");
    reply.header("Content-Disposition", `attachment; filename="${name}"`);
    return reply.send(createReadStream(target));
  });

  /* ---------------- delete a dump ---------------- */

  app.post("/api/admin/system/backup/:name/delete", async (req) => {
    requireAdmin(req);
    const { name } = z.object({ name: z.string().trim().regex(/^[A-Za-z0-9._-]+$/, "Tên file không hợp lệ.") }).parse(req.params);
    const target = path.join(config.backupDir, name);
    if (!target.startsWith(config.backupDir)) throw badRequest("Tên file không hợp lệ.");
    try {
      await rm(target);
    } catch {
      throw notFound("Không tìm thấy bản sao lưu.");
    }
    return { ok: true };
  });

  /* ---------------- restore ---------------- */

  /**
   * Restore a dump.
   *
   * The restore is refused while the app is serving traffic: a wrong file
   * could break the database. The admin has to run the psql command that the
   * endpoint returns, or set ALLOW_RESTORE=1 in the environment.
   */
  app.post("/api/admin/system/backup/:name/restore", async (req) => {
    requireAdmin(req);
    if (process.env.ALLOW_RESTORE !== "1") {
      throw badRequest(
        "Khôi phục bị chặn an toàn. Hãy đặt ALLOW_RESTORE=1 rồi khởi động lại máy chủ, hoặc chạy lệnh psql bên dưới.",
      );
    }
    const { name } = z.object({ name: z.string().trim().regex(/^[A-Za-z0-9._-]+$/, "Tên file không hợp lệ.") }).parse(req.params);
    const target = path.join(config.backupDir, name);
    if (!target.startsWith(config.backupDir)) throw badRequest("Tên file không hợp lệ.");
    try {
      await stat(target);
    } catch {
      throw notFound("Không tìm thấy bản sao lưu.");
    }

    const url = new URL(config.databaseUrl);
    const args = ["--no-owner", "--no-privileges", "--clean", "--if-exists"];
    if (url.hostname) args.push("-h", url.hostname);
    if (url.port) args.push("-p", url.port || "5432");
    if (url.username) args.push("-U", decodeURIComponent(url.username));
    args.push(url.pathname.replace(/^\//, "") || "postgres");

    try {
      // psql reads the dump from its standard input.
      await new Promise<void>((resolve, reject) => {
        const child = spawn("psql", args, {
          env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || "") },
          stdio: ["pipe", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(0, 200) || `psql kết thúc với mã ${code}`));
        });
        const stream = createReadStream(target);
        stream.on("error", reject);
        stream.pipe(child.stdin);
      });
    } catch (e) {
      throw badRequest(`Không khôi phục được: ${(e as Error).message.slice(0, 200)}`);
    }
    return { ok: true };
  });
}

/** Remove the oldest dumps when there are more than the limit. */
async function pruneBackups(): Promise<void> {
  try {
    const names = (await readdir(config.backupDir)).filter((n) => n.endsWith(".sql"));
    if (names.length <= config.backupKeep) return;
    const infos = await Promise.all(
      names.map(async (name) => ({ name, mtime: (await stat(path.join(config.backupDir, name))).mtimeMs })),
    );
    infos.sort((a, b) => b.mtime - a.mtime);
    for (const old of infos.slice(config.backupKeep)) {
      await rm(path.join(config.backupDir, old.name), { force: true });
    }
  } catch {
    // Cleaning up is best effort only.
  }
}
