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
import { createXapiWebSearchProvider } from "./providers/xapi-web-search-provider.js";

const SKIP = !process.env.XAPI_API_KEY || !process.env.SMOKE;

describe.skipIf(SKIP)("smoke: real xapi.to API via provider", () => {
  it("createTool execute returns structured results", async () => {
    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "TypeScript", count: 3 }) as Record<string, unknown>;

    // Print raw response structure for inspection
    console.log("\n[smoke] === Raw response (partial) ===");
    console.log(`[smoke] provider: ${result.provider}`);
    console.log(`[smoke] query: ${result.query}`);
    console.log(`[smoke] count: ${result.count}`);
    console.log(`[smoke] tookMs: ${result.tookMs}`);
    console.log(`[smoke] externalContent: ${JSON.stringify(result.externalContent)}`);

    // Verify structured payload
    expect(result.provider).toBe("xapi");
    expect(result.query).toBe("TypeScript");
    expect(typeof result.tookMs).toBe("number");
    expect(result.externalContent).toEqual({
      untrusted: true,
      source: "web_search",
      provider: "xapi",
      wrapped: true,
    });

    // Verify results array
    const results = result.results as Record<string, unknown>[];
    expect(results.length).toBeGreaterThan(0);

    console.log(`[smoke] === Results (${results.length} total) ===`);
    for (const [i, item] of results.entries()) {
      expect(item.title).toBeTruthy();
      expect(typeof item.url).toBe("string");
      expect(item.description).toBeTruthy();

      // Print each result for inspection
      console.log(`[smoke] ${i + 1}. ${item.title}`);
      console.log(`[smoke]    url: ${item.url}`);
      console.log(`[smoke]    description: ${String(item.description).slice(0, 120)}...`);
      if (item.siteName) console.log(`[smoke]    siteName: ${item.siteName}`);
      if (item.published) console.log(`[smoke]    published: ${item.published}`);
    }
  }, 20_000);
});
