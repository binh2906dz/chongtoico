import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, initDb } from "./db/index.js";
import { startMaintenance, stopMaintenance } from "./maintenance.js";
import { closeRealtime, initRealtime } from "./realtime.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { seed } from "./seed.js";

await initDb(config.databaseUrl);
const app = await buildApp();
await seed((msg) => app.log.info(msg));
initRealtime(app.server);
await app.listen({ host: config.host, port: config.port });
startMaintenance((msg) => app.log.info(msg));
startScheduler((msg) => app.log.info(msg));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal} received, shutting down`);
  stopMaintenance();
  stopScheduler();
  await closeRealtime();
  await app.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
