/**
 * Apply CP7 remediation migrations when DATABASE_URL is set.
 * Example (Lovable Cloud → Database settings → connection string):
 *   $env:DATABASE_URL="postgresql://postgres.[ref]:[password]@..."
 *   node scripts/apply-cp7-migrations.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const files = [
  "supabase/migrations/20260608120000_cp7_assign_interpreter_conflict_check.sql",
  "supabase/migrations/20260608120100_cp4_scheduling_access_fixes.sql",
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Cannot apply migrations.");
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const rel of files) {
    const sql = readFileSync(join(root, rel), "utf8");
    console.log(`Applying ${rel} ...`);
    await client.query(sql);
    console.log(`OK ${rel}`);
  }

  await client.end();
  console.log("All CP7 migrations applied.");
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
