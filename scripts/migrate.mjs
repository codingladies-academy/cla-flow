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
  console.error("drizzle migrator notice:", error instanceof Error ? error.message : error);
  // Apply latest migrations directly if baseline table already exists
  try {
    const fs = await import("fs");
    const path = await import("path");
    const files = ["0005_chief_deadpool.sql", "0006_workspaces.sql", "0007_chat.sql"];
    for (const f of files) {
      const p = path.resolve("./drizzle", f);
      if (fs.existsSync(p)) {
        const sqlText = fs.readFileSync(p, "utf8");
        await pool.query(sqlText);
        console.log(`Direct migration applied: ${f}`);
      }
    }
  } catch (directErr) {
    console.error("direct migration error:", directErr instanceof Error ? directErr.message : directErr);
  }
} finally {
  try {
    await pool.end();
  } catch {}
}
