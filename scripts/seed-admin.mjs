import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDatabaseEnv } from "./db-migrate.mjs";

const BCRYPT_SALT_ROUNDS = 10;
const ALLOWED_ROLES = new Set(["admin", "librarian"]);

function parseCliArg(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

/**
 * Provisions or updates an admin/librarian account in `users_admin` with a bcrypt password hash.
 */
export async function seedAdminUser({
  dbUrl,
  authToken,
  username,
  password,
  role = "admin",
}) {
  if (!dbUrl) {
    throw new Error("Missing TURSO_DATABASE_URL (check .env.local or .env).");
  }
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  if (!normalizedUsername || typeof password !== "string" || password.length < 8) {
    throw new Error("username and a password of at least 8 characters are required.");
  }
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error("role must be 'admin' or 'librarian'.");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const db = createClient({ url: dbUrl, authToken });

  try {
    await db.execute({
      sql: `INSERT INTO users_admin (username, password_hash, role)
            VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
              password_hash = excluded.password_hash,
              role = excluded.role`,
      args: [normalizedUsername, passwordHash, role],
    });
    return { username: normalizedUsername, role };
  } finally {
    db.close();
  }
}

const isMainEntry =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainEntry) {
  const { dbUrl, authToken } = loadDatabaseEnv();
  const username = parseCliArg("--username") ?? process.env.ADMIN_SEED_USER;
  const password = parseCliArg("--password") ?? process.env.ADMIN_SEED_PASS;
  const role = parseCliArg("--role") ?? process.env.ADMIN_SEED_ROLE ?? "admin";

  seedAdminUser({ dbUrl, authToken, username, password, role })
    .then((res) => {
      console.log(`Admin user '${res.username}' (${res.role}) provisioned.`);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
