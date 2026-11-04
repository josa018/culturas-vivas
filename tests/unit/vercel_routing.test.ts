import * as fs from "node:fs";
import * as path from "node:path";
import { assert } from "../helpers/assert";

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

function runVercelRoutingUnitTests(): void {
  console.log("--- [UNIT TEST] Vercel SPA Routing Configuration ---");

  const configPath = path.resolve(process.cwd(), TEST_CONFIG.VERCEL_CONFIG_FILE);
  assert.ok(fs.existsSync(configPath), `Configuration file ${TEST_CONFIG.VERCEL_CONFIG_FILE} must exist at root`);

  const rawContent = fs.readFileSync(configPath, "utf-8");
  const parsed: VercelConfig = JSON.parse(rawContent);

  assert.ok(Array.isArray(parsed.rewrites), "vercel.json must define a 'rewrites' array");
  assert.equal(parsed.rewrites.length >= 2, true, "vercel.json must contain at least 2 rewrite rules");

  const [apiRule, spaRule] = parsed.rewrites;

  // Verify Rule 1: API bypass
  assert.equal(apiRule.source, TEST_CONFIG.EXPECTED_API_SOURCE, "First rewrite rule source must target /api/:path*");
  assert.equal(apiRule.destination, TEST_CONFIG.EXPECTED_API_DESTINATION, "First rewrite rule destination must preserve /api/:path*");
  console.log("✓ Test 1 Passed: Serverless /api/:path* passthrough rule verified");

  // Verify Rule 2: SPA fallback
  assert.equal(spaRule.source, TEST_CONFIG.EXPECTED_SPA_SOURCE, "Second rewrite rule source must use negative lookahead for non-API routes");
  assert.equal(spaRule.destination, TEST_CONFIG.EXPECTED_SPA_DESTINATION, "Second rewrite rule destination must be /index.html");
  console.log("✓ Test 2 Passed: SPA fallback to /index.html verified");

  // Verify regex behavior for SPA client paths vs API endpoints
  const spaPattern = new RegExp(`^${TEST_CONFIG.EXPECTED_SPA_SOURCE}$`);

  for (const clientPath of TEST_CONFIG.SPA_PATHS) {
    const isMatched = spaPattern.test(clientPath);
    assert.equal(isMatched, true, `Client path '${clientPath}' must be matched by SPA rewrite rule`);
  }
  console.log("✓ Test 3 Passed: Client SPA paths (/admin, /, /survey, etc.) correctly match rewrite pattern");

  for (const apiPath of TEST_CONFIG.API_PATHS) {
    const isMatched = spaPattern.test(apiPath);
    assert.equal(isMatched, false, `API path '${apiPath}' must NOT match negative lookahead SPA rewrite rule`);
  }
  console.log("✓ Test 4 Passed: Backend API endpoints correctly bypass SPA fallback pattern");
}

runVercelRoutingUnitTests();
