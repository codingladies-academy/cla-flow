// Applies every SQL file in ./drizzle that the database has not seen yet.
// Plain JavaScript on purpose: the production image installs no dev packages,
// so this must run with nothing but `pg` and `drizzle-orm`.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function waitForDb(maxAttempts = 15, delayMs = 2000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const client = await pool.connect();
      client.release();
      return true;
    } catch (err) {
      console.log(`Waiting for database to accept connections (attempt ${i}/${maxAttempts})...`);
      if (i === maxAttempts) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

try {
  await waitForDb();
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("migrations applied successfully");
} catch (error) {
  console.error("migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
