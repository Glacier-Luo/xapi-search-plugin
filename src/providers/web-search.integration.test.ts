import { describe, it, expect, vi } from "vitest";
import { registerXapiWebSearch } from "./web-search.js";
import type { XapiClient, XapiActionResponse } from "../lib/xapi-client.js";
import type { PluginApi } from "../types.js";

// --- Helpers ---

function createMockClient(
  response: XapiActionResponse<unknown>,
): XapiClient {
  return {
    callAction: vi.fn().mockResolvedValue(response),
  };
}

function createMockApi(config: Record<string, unknown> = {}) {
  const registeredProvider: { id?: string; search?: Function } = {};
  const api: PluginApi = {
    config: config as PluginApi["config"],
    registerWebSearchProvider(provider: unknown) {
      Object.assign(registeredProvider, provider);
    },
  };
  return { api, registeredProvider };
}

// --- Tests ---

describe("registerXapiWebSearch (integration)", () => {
  it("registers a provider with id 'xapi-search'", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { registeredProvider } = createMockApi();

    registerXapiWebSearch(createMockApi().api, client);
    // Re-register to capture
    const { api, registeredProvider: provider } = createMockApi();
    registerXapiWebSearch(api, client);

    expect(provider.id).toBe("xapi-search");
    expect(typeof provider.search).toBe("function");
  });

  it("calls client.callAction with correct parameters on search", async () => {
    const mockResponse = {
      success: true as const,
      data: {
        organic: [
          { title: "Result 1", link: "https://example.com", snippet: "A snippet" },
        ],
      },
    };
    const client = createMockClient(mockResponse);
    const { api, registeredProvider } = createMockApi();

    registerXapiWebSearch(api, client);
    const results = await registeredProvider.search!({ query: "test query", count: 5 });

    expect(client.callAction).toHaveBeenCalledWith("web.search", {
      q: "test query",
      num: 5,
      gl: "us",
      hl: "en",
      autocorrect: true,
    });
    expect(results).toEqual([
      { title: "Result 1", url: "https://example.com", snippet: "A snippet" },
    ]);
  });

  it("uses default count of 10 when count is omitted", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, registeredProvider } = createMockApi();

    registerXapiWebSearch(api, client);
    await registeredProvider.search!({ query: "test" });

    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ num: 10 }),
    );
  });

  it("uses configured locale and language from api.config", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, registeredProvider } = createMockApi({
      locale: "cn",
      language: "zh-cn",
    });

    registerXapiWebSearch(api, client);
    await registeredProvider.search!({ query: "测试" });

    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ gl: "cn", hl: "zh-cn" }),
    );
  });

  it("throws when callAction returns success: false", async () => {
    const client = createMockClient({
      success: false,
      error: "quota exceeded",
    } as XapiActionResponse);
    const { api, registeredProvider } = createMockApi();

    registerXapiWebSearch(api, client);

    await expect(
      registeredProvider.search!({ query: "test" }),
    ).rejects.toThrow("xapi.to web.search error: quota exceeded");
  });

  it("throws with 'unknown' when error field is missing on failure", async () => {
    const client = createMockClient({
      success: false,
    } as XapiActionResponse);
    const { api, registeredProvider } = createMockApi();

    registerXapiWebSearch(api, client);

    await expect(
      registeredProvider.search!({ query: "test" }),
    ).rejects.toThrow("xapi.to web.search error: unknown");
  });

  it("end-to-end: knowledgeGraph + organic → correct order", async () => {
    const client = createMockClient({
      success: true as const,
      data: {
        knowledgeGraph: {
          title: "KG Title",
          description: "KG description",
          descriptionLink: "https://kg.example.com",
        },
        organic: [
          { title: "Organic 1", link: "https://o1.com", snippet: "Snippet 1" },
          { title: "Organic 2", link: "https://o2.com", snippet: "Snippet 2" },
        ],
      },
    });
    const { api, registeredProvider } = createMockApi();

    registerXapiWebSearch(api, client);
    const results = await registeredProvider.search!({ query: "apple" });

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      title: "KG Title",
      url: "https://kg.example.com",
      snippet: "KG description",
    });
    expect(results[1]!.title).toBe("Organic 1");
    expect(results[2]!.title).toBe("Organic 2");
  });
});
