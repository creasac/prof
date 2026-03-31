import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { requireDb, pool } from "./client.js";

const dbModuleDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(dbModuleDir, "../../../../drizzle");

async function main() {
  await migrate(requireDb(), {
    migrationsFolder,
  });
}

main()
  .then(async () => {
    await pool?.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool?.end();
    process.exitCode = 1;
  });
