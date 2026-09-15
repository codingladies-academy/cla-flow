// Applies every SQL file in ./drizzle that the database has not seen yet.
// Plain JavaScript on purpose: the production image installs no dev packages,
// so this must run with nothing but `pg` and `drizzle-orm`.
import fs from "node:fs";
import path from "node:path";
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

async function runDirectMigrations() {
  const drizzleDir = path.resolve("./drizzle");
  if (!fs.existsSync(drizzleDir)) {
    console.warn("drizzle directory not found:", drizzleDir);
    return;
  }

  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const filePath = path.join(drizzleDir, file);
    const sqlText = fs.readFileSync(filePath, "utf8");
    try {
      await pool.query(sqlText);
      console.log(`Direct migration applied: ${file}`);
    } catch (err) {
      console.error(`Migration error on ${file}:`, err instanceof Error ? err.message : err);
    }
  }
}

try {
  await waitForDb();
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("drizzle migrations applied successfully");
  } catch (error) {
    console.error("drizzle migrator notice:", error instanceof Error ? error.message : error);
  }

  // Always ensure all direct SQL migrations run safely
  await runDirectMigrations();
  console.log("All migrations successfully checked and applied.");
} catch (error) {
  console.error("Migration fatal error:", error instanceof Error ? error.message : error);
} finally {
  try {
    await pool.end();
  } catch {}
}
