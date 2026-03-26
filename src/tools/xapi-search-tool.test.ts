import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock xapi-client
vi.mock("../lib/xapi-client.js", () => {
  const mockCallAction = vi.fn();
  return {
    createXapiClient: vi.fn().mockReturnValue({
      callAction: mockCallAction,
    }),
    __mockCallAction: mockCallAction,
  };
});

// Mock provider exports
vi.mock("../providers/xapi-web-search-provider.js", () => ({
  resolveXapiApiKey: vi.fn(),
  resolveSearchCount: vi.fn((count: unknown, fallback: number) => {
    const n = count != null ? Number(count) : fallback;
    return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 1), 20);
  }),
  DEFAULT_LOCALE: "us",
  DEFAULT_LANGUAGE: "en",
  DEFAULT_TIMEOUT_SECONDS: 15,
  MAX_SEARCH_COUNT: 20,
}));

// Mock SDK agent-runtime helpers
vi.mock("openclaw/plugin-sdk/agent-runtime", () => ({
  jsonResult: vi.fn((data: unknown) => data),
  readStringParam: vi.fn(
    (params: Record<string, unknown>, key: string, opts?: { required?: boolean }) => {
      const val = params[key];
      if (opts?.required && (val === undefined || val === null || val === "")) {
        throw new Error(`Missing required parameter: ${key}`);
      }
      return typeof val === "string" ? val : val != null ? String(val) : "";
    },
  ),
  readNumberParam: vi.fn(
    (params: Record<string, unknown>, key: string) => {
      const val = params[key];
      return val != null ? Number(val) : undefined;
    },
  ),
}));

import { createXapiSearchTool, __testing } from "./xapi-search-tool.js";
import { resolveXapiApiKey } from "../providers/xapi-web-search-provider.js";
import { createXapiClient } from "../lib/xapi-client.js";

const { ACTION_ID_MAP, TIME_RANGE_TBS, buildRequestBody, SEARCH_TYPES, TYPES_WITH_NUM, TYPES_WITH_TBS, TYPES_WITH_TIME_RANGE, TYPES_WITH_LOCATION, TYPES_WITH_LL, TYPES_WITH_AUTOCORRECT } = __testing;

// Access the mock callAction
function getMockCallAction() {
  return (createXapiClient as ReturnType<typeof vi.fn>)().callAction as ReturnType<typeof vi.fn>;
}

function buildApi(overrides: Record<string, unknown> = {}) {
  return {
    id: "xapi-search",
    name: "xapi.to Web Search",
    source: "test",
    registrationMode: "full" as const,
    config: {},
    pluginConfig: overrides.pluginConfig ?? {},
    runtime: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    registerProvider: vi.fn(),
    registerSpeechProvider: vi.fn(),
    registerMediaUnderstandingProvider: vi.fn(),
    registerImageGenerationProvider: vi.fn(),
    registerWebSearchProvider: vi.fn(),
    registerInteractiveHandler: vi.fn(),
    onConversationBindingResolved: vi.fn(),
    registerCommand: vi.fn(),
    registerContextEngine: vi.fn(),
    registerMemoryPromptSection: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("__testing exports", () => {
  it("has all 9 search types", () => {
    expect(SEARCH_TYPES).toHaveLength(9);
    expect(SEARCH_TYPES).toContain("web");
    expect(SEARCH_TYPES).toContain("realtime");
    expect(SEARCH_TYPES).toContain("image");
    expect(SEARCH_TYPES).toContain("news");
    expect(SEARCH_TYPES).toContain("video");
    expect(SEARCH_TYPES).toContain("scholar");
    expect(SEARCH_TYPES).toContain("places");
    expect(SEARCH_TYPES).toContain("maps");
    expect(SEARCH_TYPES).toContain("shopping");
  });

  it("maps search types to correct action IDs", () => {
    expect(ACTION_ID_MAP.web).toBe("web.search");
    expect(ACTION_ID_MAP.realtime).toBe("web.search.realtime");
    expect(ACTION_ID_MAP.image).toBe("web.search.image");
    expect(ACTION_ID_MAP.news).toBe("web.search.news");
    expect(ACTION_ID_MAP.video).toBe("web.search.video");
    expect(ACTION_ID_MAP.scholar).toBe("web.search.scholar");
    expect(ACTION_ID_MAP.places).toBe("web.search.places");
    expect(ACTION_ID_MAP.maps).toBe("web.search.maps");
    expect(ACTION_ID_MAP.shopping).toBe("web.search.shopping");
  });

  it("maps time ranges to tbs values", () => {
    expect(TIME_RANGE_TBS.hour).toBe("qdr:h");
    expect(TIME_RANGE_TBS.day).toBe("qdr:d");
    expect(TIME_RANGE_TBS.week).toBe("qdr:w");
    expect(TIME_RANGE_TBS.month).toBe("qdr:m");
    expect(TIME_RANGE_TBS.year).toBe("qdr:y");
  });
});

describe("parameter scope sets match API docs", () => {
  it("num: only web and realtime", () => {
    expect(TYPES_WITH_NUM).toEqual(new Set(["web", "realtime"]));
  });

  it("tbs: image, news, video, shopping (NOT realtime — realtime uses timeRange)", () => {
    expect(TYPES_WITH_TBS).toEqual(new Set(["image", "news", "video", "shopping"]));
  });

  it("timeRange: only realtime", () => {
    expect(TYPES_WITH_TIME_RANGE).toEqual(new Set(["realtime"]));
  });

  it("location: web, realtime, places, shopping", () => {
    expect(TYPES_WITH_LOCATION).toEqual(new Set(["web", "realtime", "places", "shopping"]));
  });

  it("ll: places and maps", () => {
    expect(TYPES_WITH_LL).toEqual(new Set(["places", "maps"]));
  });

  it("autocorrect: all types except realtime", () => {
    expect(TYPES_WITH_AUTOCORRECT).toEqual(new Set(["web", "image", "news", "video", "scholar", "places", "maps", "shopping"]));
  });
});

describe("buildRequestBody", () => {
  it("builds basic web search body with num and autocorrect", () => {
    const body = buildRequestBody({
      query: "test",
      type: "web",
      count: 10,
      gl: "us",
      hl: "en",
    });
    expect(body).toEqual({
      q: "test",
      gl: "us",
      hl: "en",
      autocorrect: true,
      num: 10,
      page: 1,
    });
  });

  it("builds realtime body without autocorrect", () => {
    const body = buildRequestBody({ query: "t", type: "realtime", count: 5, gl: "us", hl: "en" });
    expect(body.num).toBe(5);
    expect(body.autocorrect).toBeUndefined();
  });

  it.each(["image", "news", "video", "scholar", "places", "maps", "shopping"] as const)(
    "omits num for %s search",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en" });
      expect(body.num).toBeUndefined();
    },
  );

  it("adds timeRange (not tbs) for realtime", () => {
    const body = buildRequestBody({
      query: "latest news",
      type: "realtime",
      count: 10,
      gl: "us",
      hl: "en",
      timeRange: "day",
    });
    expect(body.timeRange).toBe("day");
    expect(body.tbs).toBeUndefined();
  });

  it("adds tbs for news with timeRange", () => {
    const body = buildRequestBody({ query: "t", type: "news", count: 10, gl: "us", hl: "en", timeRange: "week" });
    expect(body.tbs).toBe("qdr:w");
  });

  it("adds tbs for image with timeRange", () => {
    const body = buildRequestBody({ query: "t", type: "image", count: 10, gl: "us", hl: "en", timeRange: "month" });
    expect(body.tbs).toBe("qdr:m");
  });

  it("adds tbs for video with timeRange", () => {
    const body = buildRequestBody({ query: "t", type: "video", count: 10, gl: "us", hl: "en", timeRange: "year" });
    expect(body.tbs).toBe("qdr:y");
  });

  it("adds tbs for shopping with timeRange", () => {
    const body = buildRequestBody({ query: "t", type: "shopping", count: 10, gl: "us", hl: "en", timeRange: "hour" });
    expect(body.tbs).toBe("qdr:h");
  });

  it.each(["web", "scholar", "places", "maps"] as const)(
    "does not add tbs or timeRange for %s even with timeRange param",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en", timeRange: "day" });
      expect(body.tbs).toBeUndefined();
      expect(body.timeRange).toBeUndefined();
    },
  );

  it.each(["web", "image", "news", "video", "scholar", "places", "maps", "shopping"] as const)(
    "includes autocorrect for %s",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en" });
      expect(body.autocorrect).toBe(true);
    },
  );

  it("omits autocorrect for realtime", () => {
    const body = buildRequestBody({ query: "t", type: "realtime", count: 10, gl: "us", hl: "en" });
    expect(body.autocorrect).toBeUndefined();
  });

  it.each(["web", "realtime", "places", "shopping"] as const)(
    "includes location for %s",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en", location: "SF" });
      expect(body.location).toBe("SF");
    },
  );

  it.each(["image", "news", "video", "scholar", "maps"] as const)(
    "omits location for %s",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en", location: "SF" });
      expect(body.location).toBeUndefined();
    },
  );

  it.each(["places", "maps"] as const)(
    "includes ll for %s",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en", ll: "@37.77,-122.41,14z" });
      expect(body.ll).toBe("@37.77,-122.41,14z");
    },
  );

  it.each(["web", "realtime", "image", "news", "video", "scholar", "shopping"] as const)(
    "omits ll for %s",
    (type) => {
      const body = buildRequestBody({ query: "t", type, count: 10, gl: "us", hl: "en", ll: "@37.77,-122.41,14z" });
      expect(body.ll).toBeUndefined();
    },
  );
});

describe("createXapiSearchTool", () => {
  it("returns tool with correct metadata", () => {
    const api = buildApi();
    const tool = createXapiSearchTool(api as never);

    expect(tool.name).toBe("xapi_search");
    expect(tool.label).toBe("xapi.to Search");
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeDefined();
    expect(tool.execute).toBeInstanceOf(Function);
  });

  it("returns error when query is empty", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const api = buildApi();
    const tool = createXapiSearchTool(api as never);

    const result = await tool.execute("call-1", { query: "   " });
    expect(result).toEqual(
      expect.objectContaining({ error: "missing_query" }),
    );
  });

  it("returns error when API key is missing", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });
    const api = buildApi();
    const tool = createXapiSearchTool(api as never);

    const result = await tool.execute("call-1", { query: "test" });
    expect(result).toEqual(
      expect.objectContaining({ error: "missing_xapi_api_key" }),
    );
  });

  it("calls xapi client with correct action_id for web search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: {
        organic: [{ title: "R1", link: "https://r1.com", snippet: "S1" }],
      },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "test query" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ q: "test query" }),
    );
  });

  it("calls xapi client with correct action_id for news search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { news: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "latest", type: "news" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search.news",
      expect.objectContaining({ q: "latest" }),
    );
  });

  it("calls xapi client with correct action_id for image search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { images: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "cats", type: "image" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search.image",
      expect.objectContaining({ q: "cats" }),
    );
  });

  it("calls xapi client with correct action_id for scholar search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { organic: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "machine learning", type: "scholar" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search.scholar",
      expect.objectContaining({ q: "machine learning" }),
    );
  });

  it("passes time_range as timeRange (not tbs) for realtime search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { organic: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "breaking", type: "realtime", time_range: "hour" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search.realtime",
      expect.objectContaining({ timeRange: "hour" }),
    );
    // Should NOT have tbs
    const callBody = mockCallAction.mock.calls[0]![1] as Record<string, unknown>;
    expect(callBody.tbs).toBeUndefined();
  });

  it("returns structured result on success", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: {
        organic: [
          { title: "Result 1", link: "https://r1.com", snippet: "Description 1" },
        ],
        searchParameters: { q: "test" },
      },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    const result = await tool.execute("call-1", { query: "test" });

    expect(result).toEqual(
      expect.objectContaining({
        query: "test",
        searchType: "web",
        provider: "xapi",
        organic: expect.arrayContaining([
          expect.objectContaining({ title: "Result 1" }),
        ]),
      }),
    );
  });

  it("strips credits from response", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: {
        organic: [],
        credits: 42,
      },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    const result = await tool.execute("call-1", { query: "test" }) as Record<string, unknown>;

    expect(result.credits).toBeUndefined();
  });

  it("returns error on API failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: false,
      error: "rate limit exceeded",
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    const result = await tool.execute("call-1", { query: "test" });

    expect(result).toEqual(
      expect.objectContaining({
        error: "xapi_search_failed",
        message: "rate limit exceeded",
      }),
    );
  });

  it("returns error on network exception", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockRejectedValue(new Error("network timeout"));

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    const result = await tool.execute("call-1", { query: "test" });

    expect(result).toEqual(
      expect.objectContaining({
        error: "xapi_search_failed",
        message: "network timeout",
      }),
    );
  });

  it("uses configured locale and language from pluginConfig", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { organic: [] },
    });

    const api = buildApi({
      pluginConfig: { webSearch: { locale: "jp", language: "ja" } },
    });
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "test" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ gl: "jp", hl: "ja" }),
    );
  });

  it("allows overriding gl and hl per-request", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { organic: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", { query: "test", gl: "cn", hl: "zh" });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ gl: "cn", hl: "zh" }),
    );
  });

  it("passes location for places search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { places: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", {
      query: "pizza",
      type: "places",
      location: "San Francisco",
    });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search.places",
      expect.objectContaining({ location: "San Francisco" }),
    );
  });

  it("passes ll for maps search", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    const mockCallAction = getMockCallAction();
    mockCallAction.mockResolvedValue({
      success: true,
      data: { places: [] },
    });

    const api = buildApi();
    const tool = createXapiSearchTool(api as never);
    await tool.execute("call-1", {
      query: "coffee",
      type: "maps",
      ll: "@37.77,-122.41,14z",
    });

    expect(mockCallAction).toHaveBeenCalledWith(
      "web.search.maps",
      expect.objectContaining({ ll: "@37.77,-122.41,14z" }),
    );
  });
});
