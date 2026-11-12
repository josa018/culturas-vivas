import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local' });

const isDryRun = process.argv.includes('--dry-run');

const dbUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl) {
  console.error('Missing TURSO_DATABASE_URL (check your .env.local).');
  process.exit(1);
}

const db = createClient({ url: dbUrl, authToken });

const migrationsDir = join(process.cwd(), 'db', 'migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log(`Found ${files.length} migration file(s).`);

for (const file of files) {
  const filePath = join(migrationsDir, file);
  const sql = readFileSync(filePath, 'utf-8');

  if (isDryRun) {
    console.log(`[DRY RUN] Would execute ${file}`);
  } else {
    console.log(`Executing ${file}...`);
    await db.executeMultiple(sql);
    console.log(`✔ Completed ${file}`);
  }
}

db.close();
console.log('Migration process finished.');