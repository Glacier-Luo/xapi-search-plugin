import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createXapiWebSearchProvider,
  resolveXapiApiKey,
  resolveSearchCount,
  __testing,
} from "./xapi-web-search-provider.js";
import type { WebSearchProviderPlugin } from "openclaw/plugin-sdk/provider-web-search";

const {
  resolveXapiSearchConfig,
  readConfiguredSecret,
  mergeXapiSearchConfig,
  SEARCH_CACHE,
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
    delete process.env.XAPI_KEY;
  });

  afterEach(() => {
    delete process.env.XAPI_KEY;
  });

  it("returns config source when apiKey is string in config", () => {
    const result = resolveXapiApiKey({ apiKey: "sk-from-config" });
    expect(result).toEqual({ apiKey: "sk-from-config", source: "config" });
  });

  it("returns env source when XAPI_KEY is set", () => {
    process.env.XAPI_KEY = "sk-from-env";
    const result = resolveXapiApiKey({});
    expect(result).toEqual({ apiKey: "sk-from-env", source: "env", fallbackEnvVar: "XAPI_KEY" });
  });

  it("prefers config over env", () => {
    process.env.XAPI_KEY = "sk-from-env";
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

// --- mergeXapiSearchConfig ---

describe("mergeXapiSearchConfig", () => {
  it("returns searchConfig as-is when no plugin config", () => {
    const sc = { xapi: { apiKey: "sk-1" } };
    const merged = mergeXapiSearchConfig(sc, undefined);
    expect(merged.xapi).toEqual({ apiKey: "sk-1" });
  });

  it("merges plugin webSearch config as base (from full config path)", () => {
    const fullConfig = {
      plugins: {
        entries: {
          "xapi-search": {
            config: { webSearch: { apiKey: "sk-plugin", locale: "cn" } },
          },
        },
      },
    };
    const merged = mergeXapiSearchConfig({}, fullConfig);
    expect((merged.xapi as Record<string, unknown>).apiKey).toBe("sk-plugin");
    expect((merged.xapi as Record<string, unknown>).locale).toBe("cn");
  });

  it("search config xapi overrides plugin config", () => {
    const fullConfig = {
      plugins: {
        entries: {
          "xapi-search": {
            config: { webSearch: { apiKey: "sk-plugin", locale: "cn", language: "zh-cn" } },
          },
        },
      },
    };
    const merged = mergeXapiSearchConfig(
      { xapi: { locale: "jp" } },
      fullConfig,
    );
    expect((merged.xapi as Record<string, unknown>).apiKey).toBe("sk-plugin");
    expect((merged.xapi as Record<string, unknown>).locale).toBe("jp");
    expect((merged.xapi as Record<string, unknown>).language).toBe("zh-cn");
  });

  it("search config xapi does not override with undefined values", () => {
    const fullConfig = {
      plugins: {
        entries: {
          "xapi-search": {
            config: { webSearch: { apiKey: "sk-plugin" } },
          },
        },
      },
    };
    const merged = mergeXapiSearchConfig(
      { xapi: { apiKey: undefined, locale: "jp" } },
      fullConfig,
    );
    expect((merged.xapi as Record<string, unknown>).apiKey).toBe("sk-plugin");
    expect((merged.xapi as Record<string, unknown>).locale).toBe("jp");
  });

  it("handles missing plugin config", () => {
    const merged = mergeXapiSearchConfig({ xapi: { apiKey: "sk-1" } }, {});
    expect(merged.xapi).toEqual({ apiKey: "sk-1" });
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

  it("has credentialLabel", () => {
    expect(provider.credentialLabel).toBe("xapi.to API key");
  });

  it("declares XAPI_KEY as env var", () => {
    expect(provider.envVars).toEqual(["XAPI_KEY"]);
  });

  it("has credentialPath pointing to plugin config", () => {
    expect(provider.credentialPath).toBe("plugins.entries.xapi-search.config.webSearch.apiKey");
  });

  it("has autoDetectOrder between default providers", () => {
    expect(provider.autoDetectOrder).toBe(10);
  });

  it("requires credential", () => {
    expect(provider.requiresCredential).toBe(true);
  });

  it("has signupUrl and docsUrl", () => {
    expect(provider.signupUrl).toBeTruthy();
    expect(provider.docsUrl).toBeTruthy();
  });

  it("has applySelectionConfig that enables the plugin", () => {
    expect(provider.applySelectionConfig).toBeDefined();
    const config = provider.applySelectionConfig!({});
    // SDK enablePluginInConfig handles allowlisting, so just verify plugin is in config
    expect(config).toBeDefined();
  });
});

// --- credential management (uses SDK getScopedCredentialValue / setScopedCredentialValue) ---

describe("credential management", () => {
  let provider: WebSearchProviderPlugin;

  beforeEach(() => {
    provider = createXapiWebSearchProvider();
  });

  it("getCredentialValue returns apiKey from xapi scoped config", () => {
    const searchConfig = { xapi: { apiKey: "sk-123" } };
    expect(provider.getCredentialValue(searchConfig)).toBe("sk-123");
  });

  it("getCredentialValue returns undefined when no xapi config", () => {
    expect(provider.getCredentialValue({})).toBeUndefined();
    expect(provider.getCredentialValue(undefined)).toBeUndefined();
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

  it("getConfiguredCredentialValue reads from full config path", () => {
    const config = {
      plugins: {
        entries: {
          "xapi-search": {
            config: { webSearch: { apiKey: "sk-config" } },
          },
        },
      },
    };
    expect(provider.getConfiguredCredentialValue!(config)).toBe("sk-config");
  });

  it("getConfiguredCredentialValue returns undefined when missing", () => {
    expect(provider.getConfiguredCredentialValue!({})).toBeUndefined();
  });

  it("setConfiguredCredentialValue writes to full config path", () => {
    const target: Record<string, unknown> = {};
    provider.setConfiguredCredentialValue!(target, "sk-set");
    // SDK navigates: plugins.entries.xapi-search.config.webSearch.apiKey
    const plugins = target.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, Record<string, unknown>>;
    const entry = entries["xapi-search"]!;
    const config = entry.config as Record<string, unknown>;
    const webSearch = config.webSearch as Record<string, unknown>;
    expect(webSearch.apiKey).toBe("sk-set");
  });
});

// --- resolveRuntimeMetadata ---

describe("resolveRuntimeMetadata", () => {
  it("returns metadata with undefined key source when no credential", () => {
    const provider = createXapiWebSearchProvider();
    const metadata = provider.resolveRuntimeMetadata!({});
    expect(metadata).toEqual({ selectedProviderKeySource: undefined });
  });

  it("includes credential source from ctx", () => {
    const provider = createXapiWebSearchProvider();
    const metadata = provider.resolveRuntimeMetadata!({
      resolvedCredential: { source: "env", value: "sk-test", fallbackEnvVar: "XAPI_KEY" },
    });
    expect(metadata.selectedProviderKeySource).toBe("env");
  });
});

// --- createTool ---

describe("createTool", () => {
  let provider: WebSearchProviderPlugin;

  beforeEach(() => {
    provider = createXapiWebSearchProvider();
    delete process.env.XAPI_KEY;
  });

  afterEach(() => {
    delete process.env.XAPI_KEY;
  });

  it("returns tool definition with description and parameters", () => {
    const tool = provider.createTool({});
    expect(tool).not.toBeNull();
    expect(tool!.description).toBeTruthy();
    expect(tool!.parameters).toBeDefined();
    expect(typeof tool!.execute).toBe("function");
  });

  it("execute returns error object when no API key (not throw)", async () => {
    const tool = provider.createTool({})!;
    const result = await tool.execute({ query: "test" });
    expect(result).toHaveProperty("error", "missing_xapi_key");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("docs");
  });

  it("execute returns error for empty query", async () => {
    process.env.XAPI_KEY = "sk-test";
    const tool = provider.createTool({})!;
    const result = await tool.execute({ query: "" });
    expect(result).toHaveProperty("error", "missing_query");
  });

  it("execute returns error for missing query", async () => {
    process.env.XAPI_KEY = "sk-test";
    const tool = provider.createTool({})!;
    const result = await tool.execute({});
    expect(result).toHaveProperty("error", "missing_query");
  });

  it("merges plugin config into tool context", () => {
    const tool = provider.createTool({
      config: {
        plugins: {
          entries: {
            "xapi-search": {
              config: { webSearch: { locale: "cn", language: "zh-cn" } },
            },
          },
        },
      },
    });
    expect(tool).not.toBeNull();
    expect(tool!.description).toBeTruthy();
  });
});

// --- createTool execute with mocked fetch ---

describe("createTool execute — with mocked fetch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    process.env.XAPI_KEY = "sk-test-key";
    SEARCH_CACHE.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.XAPI_KEY;
    SEARCH_CACHE.clear();
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
    const tool = provider.createTool({})!;
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
      wrapped: true,
    });

    const results = (result as { results: Record<string, unknown>[] }).results;
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
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
    const tool = provider.createTool({})!;
    const result = await tool.execute({ query: "apple" });

    const results = (result as { results: Record<string, unknown>[] }).results;
    expect(results).toHaveLength(2);
  });

  it("returns empty results for empty organic", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;
    const result = await tool.execute({ query: "nothing" });

    expect((result as { results: unknown[] }).results).toHaveLength(0);
    expect((result as { count: number }).count).toBe(0);
  });

  it("handles missing data gracefully", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;
    const result = await tool.execute({ query: "test" });

    expect((result as { results: unknown[] }).results).toHaveLength(0);
  });

  it("returns error object on API error (does not throw)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: false,
      error: "quota exceeded",
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;
    const result = await tool.execute({ query: "test" });

    expect(result).toHaveProperty("error", "xapi_search_failed");
    expect(result).toHaveProperty("message", "quota exceeded");
    expect(result).toHaveProperty("tookMs");
  });

  it("returns error object on network failure (does not throw)", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;
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
    })!;
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
    const tool = provider.createTool({})!;
    await tool.execute({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.input.gl).toBe("us");
    expect(body.input.hl).toBe("en");
  });

  it("merges plugin config with search config", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({
      config: {
        plugins: {
          entries: {
            "xapi-search": {
              config: { webSearch: { apiKey: "sk-from-plugin", locale: "jp" } },
            },
          },
        },
      },
      searchConfig: { xapi: { language: "ja" } },
    })!;
    await tool.execute({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.input.gl).toBe("jp");
    expect(body.input.hl).toBe("ja");
    expect(mockFetch.mock.calls[0]![1].headers["XAPI-Key"]).toBe("sk-from-plugin");
  });

  it("search config xapi overrides plugin config", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { organic: [] },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({
      config: {
        plugins: {
          entries: {
            "xapi-search": {
              config: { webSearch: { locale: "us" } },
            },
          },
        },
      },
      searchConfig: { xapi: { locale: "cn" } },
    })!;
    await tool.execute({ query: "test" });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.input.gl).toBe("cn");
  });

  // --- Cache tests ---

  it("returns cached result on second call with same params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        organic: [
          { title: "R1", link: "https://r1.com", snippet: "S1" },
        ],
      },
    }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;

    const result1 = await tool.execute({ query: "cached query", count: 5 });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result1).not.toHaveProperty("cached");

    const result2 = await tool.execute({ query: "cached query", count: 5 });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result2).toHaveProperty("cached", true);
  });

  it("does not use cache for different queries", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { organic: [{ title: "R1", link: "https://r1.com", snippet: "S1" }] },
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { organic: [{ title: "R2", link: "https://r2.com", snippet: "S2" }] },
      }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;

    await tool.execute({ query: "query-a" });
    await tool.execute({ query: "query-b" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache error responses", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ success: false, error: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { organic: [{ title: "R1", link: "https://r1.com", snippet: "S1" }] },
      }));

    const provider = createXapiWebSearchProvider();
    const tool = provider.createTool({})!;

    const result1 = await tool.execute({ query: "retry-query" });
    expect(result1).toHaveProperty("error", "xapi_search_failed");

    const result2 = await tool.execute({ query: "retry-query" });
    expect(result2).toHaveProperty("provider", "xapi");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
