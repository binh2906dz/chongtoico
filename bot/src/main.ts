/**
 * The executable entry point of the bot service.
 *
 * It only starts the service; every piece of logic lives in its own module so
 * it can be tested without touching the network.
 */

import { main, log } from "./index.js";

main().catch((err) => {
  log("error", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
