/**
 * Smoke test — calls the real xapi.to API.
 *
 * Skipped by default. To run:
 *   XAPI_API_KEY=sk-xxx npx vitest run src/smoke.test.ts
 *
 * Or explicitly:
 *   XAPI_API_KEY=sk-xxx SMOKE=1 npx vitest run
 */
import { describe, it, expect } from "vitest";
import { createXapiClient } from "./lib/xapi-client.js";
import { transformResults } from "./providers/web-search.js";

const SKIP = !process.env.XAPI_API_KEY || !process.env.SMOKE;

describe.skipIf(SKIP)("smoke: real xapi.to API", () => {
  const client = createXapiClient({
    apiKey: process.env.XAPI_API_KEY!,
  });

  it("web.search returns valid response and transforms correctly", async () => {
    const result = await client.callAction<{
      organic?: Array<{ title: string; link: string; snippet: string }>;
      knowledgeGraph?: { title?: string; description?: string };
    }>("web.search", {
      q: "TypeScript",
      num: 3,
      gl: "us",
      hl: "en",
      autocorrect: true,
    });

    // Verify xapi.to response envelope
    if (!result.success) {
      console.error("[smoke] API returned error:", JSON.stringify(result, null, 2));
    }
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Verify organic results exist
    expect(result.data.organic).toBeDefined();
    expect(result.data.organic!.length).toBeGreaterThan(0);

    // Verify each organic result has required fields
    for (const item of result.data.organic!) {
      expect(item.title).toBeTruthy();
      expect(item.link).toMatch(/^https?:\/\//);
      expect(item.snippet).toBeTruthy();
    }

    // Verify transformResults produces valid output
    const transformed = transformResults(result.data);
    expect(transformed.length).toBeGreaterThan(0);
    for (const item of transformed) {
      expect(item.title).toBeTruthy();
      expect(typeof item.url).toBe("string");
      expect(item.snippet).toBeTruthy();
    }

    // Print raw API response (truncated)
    console.log("\n[smoke] === Raw API response (partial) ===");
    if (result.data.knowledgeGraph) {
      console.log("[smoke] knowledgeGraph:", JSON.stringify(result.data.knowledgeGraph, null, 2));
    }
    console.log(`[smoke] organic count: ${result.data.organic!.length}`);
    for (const item of result.data.organic!.slice(0, 3)) {
      console.log(`[smoke]   - ${item.title}`);
      console.log(`[smoke]     ${item.link}`);
      console.log(`[smoke]     ${item.snippet.slice(0, 120)}...`);
    }

    // Print transformed results
    console.log("\n[smoke] === Transformed results ===");
    console.log(`[smoke] Got ${transformed.length} results for "TypeScript"`);
    for (const item of transformed.slice(0, 3)) {
      console.log(`[smoke]   title:   ${item.title}`);
      console.log(`[smoke]   url:     ${item.url}`);
      console.log(`[smoke]   snippet: ${item.snippet.slice(0, 120)}...`);
      console.log("[smoke]   ---");
    }
  }, 20_000); // 20s timeout for real network call
});
