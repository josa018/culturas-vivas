import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

interface VercelRewriteRule {
  readonly source: string;
  readonly destination: string;
}

interface VercelConfig {
  readonly $schema?: string;
  readonly rewrites?: readonly VercelRewriteRule[];
}

const TEST_CONFIG = {
  VERCEL_CONFIG_FILE: "vercel.json",
  EXPECTED_API_SOURCE: "/api/:path*",
  EXPECTED_API_DESTINATION: "/api/:path*",
  EXPECTED_SPA_SOURCE: "/((?!api/).*)",
  EXPECTED_SPA_DESTINATION: "/index.html",
  SPA_PATHS: ["/admin", "/admin/", "/", "/survey", "/tutorial"],
  API_PATHS: [
    "/api/admin/stats",
    "/api/session/start",
    "/api/session/ping",
    "/api/health",
  ],
} as const;

describe("Vercel SPA Routing Configuration", () => {
  const configPath = path.resolve(process.cwd(), TEST_CONFIG.VERCEL_CONFIG_FILE);

  it("verifies vercel.json structure and rules array", () => {
    expect(fs.existsSync(configPath)).toBe(true);

    const rawContent = fs.readFileSync(configPath, "utf-8");
    const parsed: VercelConfig = JSON.parse(rawContent);

    expect(Array.isArray(parsed.rewrites)).toBe(true);
    expect((parsed.rewrites ?? []).length).toBeGreaterThanOrEqual(2);

    const [apiRule, spaRule] = parsed.rewrites!;

    // Verify Rule 1: API bypass
    expect(apiRule.source).toBe(TEST_CONFIG.EXPECTED_API_SOURCE);
    expect(apiRule.destination).toBe(TEST_CONFIG.EXPECTED_API_DESTINATION);

    // Verify Rule 2: SPA fallback
    expect(spaRule.source).toBe(TEST_CONFIG.EXPECTED_SPA_SOURCE);
    expect(spaRule.destination).toBe(TEST_CONFIG.EXPECTED_SPA_DESTINATION);
  });

  it("matches SPA and API routes against rewrite pattern regex", () => {
    const rawContent = fs.readFileSync(configPath, "utf-8");
    const parsed: VercelConfig = JSON.parse(rawContent);
    const [, spaRule] = parsed.rewrites!;
    const regex = new RegExp(`^${spaRule.source}$`);

    for (const spaPath of TEST_CONFIG.SPA_PATHS) {
      expect(regex.test(spaPath)).toBe(true);
    }

    for (const apiPath of TEST_CONFIG.API_PATHS) {
      expect(regex.test(apiPath)).toBe(false);
    }
  });
});
