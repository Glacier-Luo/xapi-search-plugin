import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createXapiWebSearchProvider,
  resolveXapiApiKey,
  resolveSearchCount,
  __testing,
} from "./xapi-web-search-provider.js";
import type { WebSearchProviderPlugin } from "../types.js";

const {
  resolveXapiSearchConfig,
  readConfiguredSecret,
  resolveSiteName,
  mergeXapiSearchConfig,
  resolvePluginWebSearchConfig,
} = __testing;

// --- readConfiguredSecret ---

describe("readConfiguredSecret", () => {
  it("returns trimmed string value", () => {
    expect(readConfiguredSecret("sk-test")).toBe("sk-test");
    expect(readConfiguredSecret("  sk-padded  ")).toBe("sk-padded");
  });

  it("returns undefined for empty/whitespace string", () => {
    expect(readConfiguredSecret("")).toBeUndefined();
    expect(readConfiguredSecret("   ")).toBeUndefined();
  });

  it("returns undefined for non-string values", () => {
    expect(readConfiguredSecret(undefined)).toBeUndefined();
    expect(readConfiguredSecret(null)).toBeUndefined();
    expect(readConfiguredSecret(42)).toBeUndefined();
  });

  it("returns undefined for secret reference objects (host should resolve these)", () => {
    expect(readConfiguredSecret({ $ref: "vault://key" })).toBeUndefined();
    expect(readConfiguredSecret({ secretName: "xapi-key" })).toBeUndefined();
  });
});

// --- resolveXapiSearchConfig ---

describe("resolveXapiSearchConfig", () => {
  it("returns empty object when searchConfig is undefined", () => {
    expect(resolveXapiSearchConfig(undefined)).toEqual({});
  });

  it("returns empty object when xapi key is missing", () => {
    expect(resolveXapiSearchConfig({ other: "value" })).toEqual({});
  });

  it("returns empty object when xapi is not an object", () => {
    expect(resolveXapiSearchConfig({ xapi: "string" })).toEqual({});
    expect(resolveXapiSearchConfig({ xapi: 42 })).toEqual({});
    expect(resolveXapiSearchConfig({ xapi: ["array"] })).toEqual({});
  });

  it("returns xapi config when valid object", () => {
    const config = { xapi: { apiKey: "sk-test", locale: "cn" } };
    expect(resolveXapiSearchConfig(config)).toEqual({ apiKey: "sk-test", locale: "cn" });
  });
});

// --- resolveXapiApiKey ---

describe("resolveXapiApiKey", () => {
  beforeEach(() => {
    delete process.env.XAPI_API_KEY;
  });

  afterEach(() => {
    delete process.env.XAPI_API_KEY;
  });

  it("returns config source when apiKey is string in config", () => {
    const result = resolveXapiApiKey({ apiKey: "sk-from-config" });
    expect(result).toEqual({ apiKey: "sk-from-config", source: "config" });
  });

  it("returns env source when XAPI_API_KEY is set", () => {
    process.env.XAPI_API_KEY = "sk-from-env";
    const result = resolveXapiApiKey({});
    expect(result).toEqual({ apiKey: "sk-from-env", source: "env", fallbackEnvVar: "XAPI_API_KEY" });
  });

  it("prefers config over env", () => {
    process.env.XAPI_API_KEY = "sk-from-env";
    const result = resolveXapiApiKey({ apiKey: "sk-from-config" });
    expect(result.apiKey).toBe("sk-from-config");
    expect(result.source).toBe("config");
  });

  it("returns missing when no key available", () => {
    const result = resolveXapiApiKey({});
    expect(result).toEqual({ apiKey: undefined, source: "missing" });
  });

  it("ignores empty string apiKey in config", () => {
    const result = resolveXapiApiKey({ apiKey: "  " });
    expect(result.source).toBe("missing");
  });

  it("ignores secret reference object (not resolved by host)", () => {
    const result = resolveXapiApiKey({ apiKey: { $ref: "vault://key" } as unknown as string });
    expect(result.source).toBe("missing");
  });
});

// --- resolveSearchCount ---

describe("resolveSearchCount", () => {
  it("returns fallback for undefined", () => {
    expect(resolveSearchCount(undefined, 10)).toBe(10);
  });

  it("returns fallback for null", () => {
    expect(resolveSearchCount(null, 10)).toBe(10);
  });

  it("returns fallback for NaN string", () => {
    expect(resolveSearchCount("abc", 10)).toBe(10);
  });

  it("clamps 0 to 1", () => {
    expect(resolveSearchCount(0, 10)).toBe(1);
  });

  it("clamps negative to 1", () => {
    expect(resolveSearchCount(-5, 10)).toBe(1);
  });

  it("clamps above 20 to 20", () => {
    expect(resolveSearchCount(50, 10)).toBe(20);
  });

  it("passes through valid numbers", () => {
    expect(resolveSearchCount(5, 10)).toBe(5);
    expect(resolveSearchCount(1, 10)).toBe(1);
    expect(resolveSearchCount(20, 10)).toBe(20);
  });

  it("coerces numeric strings", () => {
    expect(resolveSearchCount("7", 10)).toBe(7);
  });

  it("returns fallback for Infinity", () => {
    expect(resolveSearchCount(Infinity, 10)).toBe(10);
  });
});

// --- resolveSiteName ---

describe("resolveSiteName", () => {
  it("returns undefined for undefined input", () => {
    expect(resolveSiteName(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(resolveSiteName("")).toBeUndefined();
  });

  it("returns undefined for invalid URL", () => {
    expect(resolveSiteName("not-a-url")).toBeUndefined();
  });

  it("extracts hostname without www", () => {
    expect(resolveSiteName("https://www.example.com/page")).toBe("example.com");
  });

  it("preserves hostname without www", () => {
    expect(resolveSiteName("https://api.example.com/path")).toBe("api.example.com");
  });
});

// --- mergeXapiSearchConfig ---

describe("mergeXapiSearchConfig", () => {
  it("returns searchConfig as-is when no plugin config", () => {
    const sc = { xapi: { apiKey: "sk-1" } };
    const merged = mergeXapiSearchConfig(sc, undefined);
    expect(merged.xapi).toEqual({ apiKey: "sk-1" });
  });

  it("merges plugin webSearch config as base", () => {
    const merged = mergeXapiSearchConfig(
      {},
      { webSearch: { apiKey: "sk-plugin", locale: "cn" } },
    );
    expect(merged.xapi).toEqual({ apiKey: "sk-plugin", locale: "cn" });
  });

  it("search config xapi overrides plugin config", () => {
    const merged = mergeXapiSearchConfig(
      { xapi: { locale: "jp" } },
      { webSearch: { apiKey: "sk-plugin", locale: "cn", language: "zh-cn" } },
    );
    expect(merged.xapi).toEqual({ apiKey: "sk-plugin", locale: "jp", language: "zh-cn" });
  });

  it("search config xapi does not override with undefined values", () => {
    const merged = mergeXapiSearchConfig(
      { xapi: { apiKey: undefined, locale: "jp" } },
      { webSearch: { apiKey: "sk-plugin" } },
    );
    expect((merged.xapi as Record<string, unknown>).apiKey).toBe("sk-plugin");
    expect((merged.xapi as Record<string, unknown>).locale).toBe("jp");
  });

  it("handles missing webSearch in plugin config", () => {
    const merged = mergeXapiSearchConfig({ xapi: { apiKey: "sk-1" } }, {});
    expect(merged.xapi).toEqual({ apiKey: "sk-1" });
  });
});

// --- resolvePluginWebSearchConfig ---

describe("resolvePluginWebSearchConfig", () => {
  it("returns webSearch config when present", () => {
    const config = { webSearch: { apiKey: "sk-1", locale: "cn" } };
    expect(resolvePluginWebSearchConfig(config)).toEqual({ apiKey: "sk-1", locale: "cn" });
  });

  it("returns undefined when webSearch is missing", () => {
    expect(resolvePluginWebSearchConfig({})).toBeUndefined();
    expect(resolvePluginWebSearchConfig(undefined)).toBeUndefined();
  });

  it("returns undefined when webSearch is not an object", () => {
    expect(resolvePluginWebSearchConfig({ webSearch: "string" })).toBeUndefined();
  });
});

// --- createXapiWebSearchProvider ---

describe("createXapiWebSearchProvider", () => {
  let provider: WebSearchProviderPlugin;

  beforeEach(() => {
    provider = createXapiWebSearchProvider();
  });

  it("has correct id", () => {
    expect(provider.id).toBe("xapi-search");
  });

  it("has correct label", () => {
    expect(provider.label).toBe("xapi.to Web Search");
  });

  it("declares XAPI_API_KEY as env var", () => {
    expect(provider.envVars).toEqual(["XAPI_API_KEY"]);
  });

  it("has credentialPath pointing to plugin config", () => {
    expect(provider.credentialPath).toBe("plugins.entries.xapi-search.config.webSearch.apiKey");
  });

  it("has autoDetectOrder between default providers", () => {
    expect(provider.autoDetectOrder).toBe(60);
  });

  it("has signupUrl and docsUrl", () => {
    expect(provider.signupUrl).toBeTruthy();
    expect(provider.docsUrl).toBeTruthy();
  });
});

// --- credential management ---

describe("credential management", () => {
  let provider: WebSearchProviderPlugin;

  beforeEach(() => {
    provider = createXapiWebSearchProvider();
  });

  it("getCredentialValue returns apiKey from xapi config", () => {
    const searchConfig = { xapi: { apiKey: "sk-123" } };
    expect(provider.getCredentialValue(searchConfig)).toBe("sk-123");
  });

  it("getCredentialValue returns undefined when no xapi config", () => {
    expect(provider.getCredentialValue({})).toBeUndefined();
    expect(provider.getCredentialValue(undefined)).toBeUndefined();
  });

  it("getCredentialValue returns undefined for non-string apiKey", () => {
    expect(provider.getCredentialValue({ xapi: { apiKey: 42 } })).toBeUndefined();
  });

  it("setCredentialValue writes to xapi.apiKey", () => {
    const target: Record<string, unknown> = {};
    provider.setCredentialValue(target, "sk-new");
    expect((target.xapi as Record<string, unknown>).apiKey).toBe("sk-new");
  });

  it("setCredentialValue overwrites existing value", () => {
    const target: Record<string, unknown> = { xapi: { apiKey: "old" } };
    provider.setCredentialValue(target, "sk-new");
    expect((target.xapi as Record<string, unknown>).apiKey).toBe("sk-new");
  });

  it("getConfiguredCredentialValue reads from webSearch.apiKey", () => {
    const config = { webSearch: { apiKey: "sk-config" } };
    expect(provider.getConfiguredCredentialValue(config)).toBe("sk-config");
  });

  it("getConfiguredCredentialValue returns undefined when missing", () => {
    expect(provider.getConfiguredCredentialValue({})).toBeUndefined();
  });

  it("setConfiguredCredentialValue writes to webSearch.apiKey", () => {
    const target: Record<string, unknown> = {};
    provider.setConfiguredCredentialValue(target, "sk-set");
    expect((target.webSearch as Record<string, unknown>).apiKey).toBe("sk-set");
  });
});

// --- resolveRuntimeMetadata ---

describe("resolveRuntimeMetadata", () => {
  it("returns transport info with credential source", () => {
    const provider = createXapiWebSearchProvider();
    const metadata = provider.resolveRuntimeMetadata({});
    expect(metadata).toEqual({ transport: "xapi_unified_api", credentialSource: "missing" });
  });

  it("includes credential source from ctx", () => {
    const provider = createXapiWebSearchProvider();
    const metadata = provider.resolveRuntimeMetadata({
      resolvedCredential: { source: "env", value: "sk-test", fallbackEnvVar: "XAPI_API_KEY" },
    });
    expect(metadata.credentialSource).toBe("env");
  });
});

// --- createTool ---

describe("createTool", () => {
  let provider: WebSearchProviderPlugin;

  beforeEach(() => {
    provider = createXapiWebSearchProvider();
    delete process.env.XAPI_API_KEY;
  });

  afterEach(() => {
    delete process.env.XAPI_API_KEY;
  });

  it("returns tool definition with description and parameters", () => {
    const tool = provider.createTool({});
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("execute returns error object when no API key (not throw)", async () => {
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "test" });
    expect(result).toHaveProperty("error", "missing_xapi_api_key");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("docs");
  });

  it("execute returns error for empty query", async () => {
    process.env.XAPI_API_KEY = "sk-test";
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "" });
    expect(result).toHaveProperty("error", "missing_query");
  });

  it("execute returns error for missing query", async () => {
    process.env.XAPI_API_KEY = "sk-test";
    const tool = provider.createTool({});
    const result = await tool.execute({});
    expect(result).toHaveProperty("error", "missing_query");
  });

  it("merges plugin config into tool context", () => {
    const tool = provider.createTool({
      config: { webSearch: { locale: "cn", language: "zh-cn" } },
    });
    // Tool is created — the merge happens inside createTool
    expect(tool.description).toBeTruthy();
  });
});

// --- createTool execute with mocked fetch ---

describe("createTool execute — with mocked fetch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    process.env.XAPI_API_KEY = "sk-test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.XAPI_API_KEY;
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: () => Promise.resolve(body),
    } as Response;
  }

  it("returns structured payload with results on success", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        organic: [
          { title: "Result 1", link: "https://example.com", snippet: "A snippet" },
        ],
      },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "test query", count: 5 });

    expect(result).toHaveProperty("query", "test query");
    expect(result).toHaveProperty("provider", "xapi");
    expect(result).toHaveProperty("count", 1);
    expect(result).toHaveProperty("tookMs");
    expect(result).toHaveProperty("externalContent");
    expect((result as Record<string, unknown>).externalContent).toEqual({
      untrusted: true,
      source: "web_search",
      provider: "xapi",
      wrapped: false,
    });

    const results = (result as { results: Record<string, unknown>[] }).results;
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({
      title: "Result 1",
      url: "https://example.com",
      description: "A snippet",
    }));
  });

  it("maps knowledgeGraph as first result", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        knowledgeGraph: {
          title: "KG Title",
          description: "KG description",
          descriptionLink: "https://kg.com",
        },
        organic: [
          { title: "O1", link: "https://o1.com", snippet: "S1" },
        ],
      },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "apple" });

    const results = (result as { results: Record<string, unknown>[] }).results;
    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe("KG Title");
    expect(results[0]!.description).toBe("KG description");
    expect(results[1]!.title).toBe("O1");
  });

  it("includes siteName from URL", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        organic: [
          { title: "R1", link: "https://www.example.com/page", snippet: "S1" },
        ],
      },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "test" });

    const results = (result as { results: Record<string, unknown>[] }).results;
    expect(results[0]!.siteName).toBe("example.com");
  });

  it("returns empty results for empty organic", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "nothing" });

    expect((result as { results: unknown[] }).results).toHaveLength(0);
    expect((result as { count: number }).count).toBe(0);
  });

  it("handles missing data gracefully", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "test" });

    expect((result as { results: unknown[] }).results).toHaveLength(0);
  });

  it("returns error object on API error (does not throw) [H1]", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: false,
      error: "quota exceeded",
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "test" });

    expect(result).toHaveProperty("error", "xapi_search_failed");
    expect(result).toHaveProperty("message", "quota exceeded");
    expect(result).toHaveProperty("tookMs");
  });

  it("returns error object on network failure (does not throw)", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    const result = await tool.execute({ query: "test" });

    expect(result).toHaveProperty("error", "xapi_search_failed");
    expect(result).toHaveProperty("message", expect.stringContaining("fetch failed"));
  });

  it("sends correct request parameters", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({
      searchConfig: { xapi: { locale: "cn", language: "zh-cn" } },
    });
    await tool.execute({ query: "test", count: 5 });

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/v1/actions/execute");
    const body = JSON.parse(options.body);
    expect(body.input).toEqual(expect.objectContaining({
      q: "test",
      num: 5,
      gl: "cn",
      hl: "zh-cn",
      autocorrect: true,
    }));
  });

  it("uses default locale/language when not configured", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({});
    await tool.execute({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.input.gl).toBe("us");
    expect(body.input.hl).toBe("en");
  });

  it("merges plugin config with search config [H3/H4]", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({
      config: { webSearch: { apiKey: "sk-from-plugin", locale: "jp" } },
      searchConfig: { xapi: { language: "ja" } },
    });
    await tool.execute({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.input.gl).toBe("jp");
    expect(body.input.hl).toBe("ja");
    // API key from plugin config should be used
    expect(mockFetch.mock.calls[0]![1].headers["XAPI-Key"]).toBe("sk-from-plugin");
  });

  it("search config xapi overrides plugin config", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({
      config: { webSearch: { locale: "us" } },
      searchConfig: { xapi: { locale: "cn" } },
    });
    await tool.execute({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.input.gl).toBe("cn");
  });
});
