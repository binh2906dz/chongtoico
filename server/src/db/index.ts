import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export let db: Db;
let closeFn: () => Promise<void> = async () => {};

export async function initDb(databaseUrl: string): Promise<void> {
  if (databaseUrl.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const target = databaseUrl.slice("pglite:".length);
    if (target !== "memory") mkdirSync(target, { recursive: true });
    const client = target === "memory" ? new PGlite() : new PGlite(target);
    const pdb = drizzle(client, { schema });
    await migrate(pdb, { migrationsFolder });
    db = pdb as unknown as Db;
    closeFn = () => client.close();
    return;
  }
  const pg = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.default.Pool({ connectionString: databaseUrl, max: 10 });
  const ndb = drizzle(pool, { schema });
  await migrate(ndb, { migrationsFolder });
  db = ndb;
  closeFn = () => pool.end();
}

export async function closeDb(): Promise<void> {
  await closeFn();
}

export { schema };
