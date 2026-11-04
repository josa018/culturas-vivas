import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

dotenv.config({ path: '.env', quiet: true });

const dryRun = process.argv.includes('--dry-run');
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error('Missing TURSO_DATABASE_URL (check your .env.local).');
  process.exit(1);
}

const db = createClient({ url, authToken });
const folder = 'db/migrations';
const files = readdirSync(folder).filter((f) => f.endsWith('.sql')).sort();

async function listTables() {
  const r = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return r.rows.map((row) => String(row.name));
}

async function listApplied() {
  const r = await db.execute('SELECT name FROM _migrations');
  return new Set(r.rows.map((row) => String(row.name)));
}

const before = await listTables();

if (dryRun) {
  console.log('DRY RUN - nothing will be changed\n');
  console.log('Tables currently in Turso:');
  before.forEach((t) => console.log(`  - ${t}`));
  const applied = before.includes('_migrations') ? await listApplied() : new Set();
  const pending = files.filter((f) => !applied.has(f));
  console.log('\nPending migrations:');
  if (pending.length === 0) console.log('  (none)');
  pending.forEach((f) => console.log(`  - ${f}`));
  db.close();
  process.exit(0);
}

// Control table: remembers which migrations were already applied
await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const applied = await listApplied();
let count = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`= ${file} (already applied)`);
    continue;
  }
  await db.executeMultiple(readFileSync(join(folder, file), 'utf8'));
  await db.execute({ sql: 'INSERT INTO _migrations (name) VALUES (?)', args: [file] });
  console.log(`+ ${file} applied`);
  count++;
}
console.log(`\n${count} new migration(s).`);

console.log('\nTables in Turso:');
(await listTables()).forEach((t) => console.log(`  - ${t}`));

const idx = await db.execute(
  "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
);
console.log('\nIndexes:');
idx.rows.forEach((i) => console.log(`  - ${i.name} (${i.tbl_name})`));

db.close();