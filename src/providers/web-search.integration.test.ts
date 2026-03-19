import { describe, it, expect, vi } from "vitest";
import { createXapiSearchTool, registerXapiWebSearch } from "./web-search.js";
import type { XapiClient, XapiActionResponse } from "../lib/xapi-client.js";
import type { PluginApi, ToolDefinition } from "../types.js";

// --- Helpers ---

function createMockClient(
  response: XapiActionResponse<unknown>,
): XapiClient {
  return {
    callAction: vi.fn().mockResolvedValue(response),
  };
}

function createMockApi(config: Record<string, unknown> = {}) {
  let registeredTool: ToolDefinition | undefined;
  const api: PluginApi = {
    config: config as PluginApi["config"],
    registerTool(tool: ToolDefinition) {
      registeredTool = tool;
    },
  };
  return {
    api,
    getTool: () => registeredTool!,
  };
}

// --- Tests ---

describe("createXapiSearchTool", () => {
  it("returns a tool with name 'xapi_web_search'", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    expect(tool.name).toBe("xapi_web_search");
    expect(tool.label).toBe("xapi.to Web Search");
    expect(tool.description).toBeTruthy();
    expect(typeof tool.execute).toBe("function");
  });

  it("returns error result when query is missing", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    const result = await tool.execute("call-1", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required parameter");
  });

  it("calls client.callAction with correct parameters", async () => {
    const mockResponse = {
      success: true as const,
      data: {
        organic: [
          { title: "Result 1", link: "https://example.com", snippet: "A snippet" },
        ],
      },
    };
    const client = createMockClient(mockResponse);
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    const result = await tool.execute("call-1", { query: "test query", count: 5 });

    expect(client.callAction).toHaveBeenCalledWith("web.search", {
      q: "test query",
      num: 5,
      gl: "us",
      hl: "en",
      autocorrect: true,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toEqual([
      { title: "Result 1", url: "https://example.com", snippet: "A snippet" },
    ]);
  });

  it("uses default count of 10 when count is omitted", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    await tool.execute("call-1", { query: "test" });

    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ num: 10 }),
    );
  });

  it("clamps count to 1-20 range", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    await tool.execute("call-1", { query: "test", count: 50 });
    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ num: 20 }),
    );

    await tool.execute("call-2", { query: "test", count: 0 });
    expect(client.callAction).toHaveBeenLastCalledWith(
      "web.search",
      expect.objectContaining({ num: 1 }),
    );
  });

  it("uses configured locale and language from api.config", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api } = createMockApi({ locale: "cn", language: "zh-cn" });
    const tool = createXapiSearchTool(api, client);

    await tool.execute("call-1", { query: "测试" });

    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ gl: "cn", hl: "zh-cn" }),
    );
  });

  it("returns error result when callAction returns success: false", async () => {
    const client = createMockClient({
      success: false,
      error: "quota exceeded",
    } as XapiActionResponse);
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    const result = await tool.execute("call-1", { query: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("quota exceeded");
  });

  it("returns error result when client throws", async () => {
    const client: XapiClient = {
      callAction: vi.fn().mockRejectedValue(new Error("network down")),
    };
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    const result = await tool.execute("call-1", { query: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("network down");
  });

  it("end-to-end: knowledgeGraph + organic → correct JSON output", async () => {
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
    const { api } = createMockApi();
    const tool = createXapiSearchTool(api, client);

    const result = await tool.execute("call-1", { query: "apple" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].title).toBe("KG Title");
    expect(parsed[1].title).toBe("Organic 1");
    expect(parsed[2].title).toBe("Organic 2");
  });
});

describe("registerXapiWebSearch", () => {
  it("registers tool via api.registerTool", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getTool } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getTool().name).toBe("xapi_web_search");
  });
});
