import type { Client } from "@libsql/client";
import { getDb } from "../_db.js";
import {
  API_HTTP_STATUS,
  parseJsonObjectBody,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";
import { signAdminToken, verifyPassword } from "../_auth.js";

export interface AdminLoginHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly signToken?: (user: {
    id: string | number;
    username: string;
    role: string;
  }) => Promise<string>;
}

/**
 * Authenticates admin/librarian credentials against `users_admin` and issues a signed JWT.
 */
export function createAdminLoginHandler(deps: AdminLoginHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const signToken = deps.signToken ?? ((u) => signAdminToken(u));

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    if (req.method !== "POST") {
      res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: "Method not allowed. Use POST.",
      });
      return;
    }

    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid JSON body. Expected an object.",
      });
      return;
    }

    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "username and password are required.",
      });
      return;
    }

    try {
      const result = await resolveDb().execute({
        sql: "SELECT id, username, password_hash, role FROM users_admin WHERE username = ? LIMIT 1",
        args: [username],
      });

      if (result.rows.length === 0) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }

      const row = result.rows[0];
      const passwordHash = String(row.password_hash ?? "");
      const isValid = await verifyPassword(password, passwordHash);

      if (!isValid) {
        res.status(401).json({ error: "Invalid credentials." });
        return;
      }

      const user = {
        id: Number(row.id),
        username: String(row.username),
        role: String(row.role),
      };
      const token = await signToken(user);

      res.status(API_HTTP_STATUS.OK).json({
        token,
        user: {
          username: user.username,
          role: user.role,
        },
      });
    } catch {
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Authentication service failed.",
      });
    }
  };
}

export default createAdminLoginHandler();
