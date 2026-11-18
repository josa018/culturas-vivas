import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, type Plugin } from "vite";

const API_PREFIX = "/api/";
const MAX_BODY_BYTES = 64 * 1024;

function loadLocalEnv(): void {
  dotenv.config({ path: ".env.local", quiet: true });
  dotenv.config({ path: ".env", quiet: true });
}

export function resolveApiHandlerFile(
  apiRootDir: string,
  urlPath: string,
): string | null {
  if (!urlPath.startsWith(API_PREFIX)) {
    return null;
  }

  const relativeRoute = urlPath.slice(API_PREFIX.length).replace(/\/+$/, "");
  if (!relativeRoute || relativeRoute.includes("..")) {
    return null;
  }

  const candidate = path.resolve(apiRootDir, `${relativeRoute}.ts`);
  const normalizedRoot = `${path.resolve(apiRootDir)}${path.sep}`;
  if (!candidate.startsWith(normalizedRoot)) {
    return null;
  }

  // Internal helper modules prefixed with '_' are not HTTP endpoints
  const segments = relativeRoute.split("/");
  if (segments.some((seg) => seg.startsWith("_"))) {
    return null;
  }

  return fs.existsSync(candidate) ? candidate : null;
}

function readRawBody(req: IncomingMessage): Promise<string | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (res.headersSent) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function localApiServerlessPlugin(): Plugin {
  return {
    name: "culturas-vivas-local-api",
    configureServer(server) {
      loadLocalEnv();
      const apiRootDir = path.resolve(process.cwd(), "api");

      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url;
        if (!rawUrl || !rawUrl.startsWith(API_PREFIX)) {
          next();
          return;
        }

        const pathname = rawUrl.split("?")[0];
        const handlerFile = resolveApiHandlerFile(apiRootDir, pathname);

        if (!handlerFile) {
          sendJson(res, 404, { error: "API route not found." });
          return;
        }

        try {
          const body = await readRawBody(req);
          const mod = (await server.ssrLoadModule(handlerFile)) as {
            default?: (
              sReq: {
                method?: string;
                body?: unknown;
                headers?: Record<string, string | string[] | undefined>;
              },
              sRes: {
                status: (code: number) => { json: (data: unknown) => void };
              },
            ) => Promise<void> | void;
          };

          if (typeof mod.default !== "function") {
            sendJson(res, 500, { error: "Invalid serverless handler export." });
            return;
          }

          await mod.default(
            {
              method: req.method,
              body,
              headers: req.headers,
            },
            {
              status: (statusCode: number) => ({
                json: (payload: unknown) => {
                  sendJson(res, statusCode, payload);
                },
              }),
            },
          );

          if (!res.writableEnded) {
            res.end();
          }
        } catch (err) {
          console.error("[local-api] Handler error:", err);
          sendJson(res, 500, { error: "Local API execution failed." });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [localApiServerlessPlugin()],
});
