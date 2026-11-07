import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, initDb } from "./db/index.js";
import { closeRealtime, initRealtime } from "./realtime.js";
import { seed } from "./seed.js";

await initDb(config.databaseUrl);
const app = await buildApp();
await seed((msg) => app.log.info(msg));
initRealtime(app.server);
await app.listen({ host: config.host, port: config.port });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal} received, shutting down`);
  await closeRealtime();
  await app.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
