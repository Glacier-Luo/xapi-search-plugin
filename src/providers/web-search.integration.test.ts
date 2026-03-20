import { describe, it, expect, vi } from "vitest";
import { registerXapiWebSearch, clampCount, executeSearch } from "./web-search.js";
import type { XapiClient, XapiActionResponse } from "../lib/xapi-client.js";
import type { PluginApi, WebSearchProvider, ToolDefinition, CommandDefinition } from "../types.js";

// --- Helpers ---

function createMockClient(
  response: XapiActionResponse<unknown>,
): XapiClient {
  return {
    callAction: vi.fn().mockResolvedValue(response),
  };
}

interface MockApiOpts {
  hasProvider?: boolean;
  hasTool?: boolean;
  hasCommand?: boolean;
  hasCli?: boolean;
}

function createMockApi(config: Record<string, unknown> = {}, opts?: MockApiOpts) {
  let registeredProvider: WebSearchProvider | undefined;
  let registeredTool: ToolDefinition | undefined;
  let registeredCommand: CommandDefinition | undefined;
  let registeredCliSetup: ((ctx: { program: unknown }) => void) | undefined;
  let registeredCliOptions: { commands: string[] } | undefined;

  const api: PluginApi = {
    config: config as PluginApi["config"],
  };

  if (opts?.hasProvider !== false) {
    (api as Record<string, unknown>).registerWebSearchProvider = (provider: WebSearchProvider) => {
      registeredProvider = provider;
    };
  }

  if (opts?.hasTool !== false) {
    (api as Record<string, unknown>).registerTool = (tool: ToolDefinition) => {
      registeredTool = tool;
    };
  }

  if (opts?.hasCommand !== false) {
    (api as Record<string, unknown>).registerCommand = (command: CommandDefinition) => {
      registeredCommand = command;
    };
  }

  if (opts?.hasCli !== false) {
    (api as Record<string, unknown>).registerCli = (setup: (ctx: { program: unknown }) => void, options: { commands: string[] }) => {
      registeredCliSetup = setup;
      registeredCliOptions = options;
    };
  }

  return {
    api,
    getProvider: () => registeredProvider,
    getTool: () => registeredTool,
    getCommand: () => registeredCommand,
    getCliSetup: () => registeredCliSetup,
    getCliOptions: () => registeredCliOptions,
  };
}

// --- Provider tests ---

describe("registerXapiWebSearch — provider path", () => {
  it("registers a provider with id 'xapi-search'", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getProvider } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getProvider()!.id).toBe("xapi-search");
    expect(typeof getProvider()!.search).toBe("function");
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
    const { api, getProvider } = createMockApi();

    registerXapiWebSearch(api, client);
    const results = await getProvider()!.search({ query: "test query", count: 5 });

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
    const { api, getProvider } = createMockApi();

    registerXapiWebSearch(api, client);
    await getProvider()!.search({ query: "test" });

    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ num: 10 }),
    );
  });

  it("uses configured locale and language from api.config", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getProvider } = createMockApi({ locale: "cn", language: "zh-cn" });

    registerXapiWebSearch(api, client);
    await getProvider()!.search({ query: "测试" });

    expect(client.callAction).toHaveBeenCalledWith(
      "web.search",
      expect.objectContaining({ gl: "cn", hl: "zh-cn" }),
    );
  });

  it("throws when callAction returns success: false", async () => {
    const client = createMockClient({ success: false, error: "quota exceeded" } as XapiActionResponse);
    const { api, getProvider } = createMockApi();

    registerXapiWebSearch(api, client);

    await expect(getProvider()!.search({ query: "test" })).rejects.toThrow("quota exceeded");
  });

  it("end-to-end: knowledgeGraph + organic → correct order", async () => {
    const client = createMockClient({
      success: true as const,
      data: {
        knowledgeGraph: { title: "KG", description: "KG desc", descriptionLink: "https://kg.com" },
        organic: [{ title: "O1", link: "https://o1.com", snippet: "S1" }],
      },
    });
    const { api, getProvider } = createMockApi();

    registerXapiWebSearch(api, client);
    const results = await getProvider()!.search({ query: "apple" });

    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe("KG");
    expect(results[1]!.title).toBe("O1");
  });
});

// --- Tool tests ---

describe("registerXapiWebSearch — tool path", () => {
  it("registers a tool with name 'xapi_web_search'", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getTool } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getTool()!.name).toBe("xapi_web_search");
    expect(typeof getTool()!.execute).toBe("function");
  });

  it("returns error result when query is missing", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getTool } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getTool()!.execute("call-1", {});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing required parameter");
  });

  it("returns JSON results on success", async () => {
    const client = createMockClient({
      success: true as const,
      data: { organic: [{ title: "R1", link: "https://r1.com", snippet: "S1" }] },
    });
    const { api, getTool } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getTool()!.execute("call-1", { query: "test", count: 3 });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toEqual([{ title: "R1", url: "https://r1.com", snippet: "S1" }]);
  });

  it("returns error result when API fails", async () => {
    const client: XapiClient = {
      callAction: vi.fn().mockRejectedValue(new Error("network down")),
    };
    const { api, getTool } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getTool()!.execute("call-1", { query: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("network down");
  });
});

// --- Dual registration / feature detection ---

describe("registerXapiWebSearch — dual registration", () => {
  it("registers both provider and tool when both APIs exist", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getProvider, getTool } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getProvider()).toBeDefined();
    expect(getTool()).toBeDefined();
  });

  it("registers only tool when registerWebSearchProvider is absent", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getProvider, getTool } = createMockApi({}, { hasProvider: false });

    registerXapiWebSearch(api, client);

    expect(getProvider()).toBeUndefined();
    expect(getTool()).toBeDefined();
  });

  it("registers only provider when registerTool is absent", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getProvider, getTool } = createMockApi({}, { hasTool: false });

    registerXapiWebSearch(api, client);

    expect(getProvider()).toBeDefined();
    expect(getTool()).toBeUndefined();
  });
});

// --- Chat Command tests ---

describe("registerXapiWebSearch — command path", () => {
  it("registers a command with name 'search'", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCommand } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getCommand()!.name).toBe("search");
    expect(getCommand()!.acceptsArgs).toBe(true);
    expect(typeof getCommand()!.handler).toBe("function");
  });

  it("returns usage text when args are empty", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCommand } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getCommand()!.handler({
      senderId: "user-1", channel: null, isAuthorizedSender: true,
      args: "", commandBody: "/search", config: {},
    });

    expect(result.text).toContain("Usage:");
    expect(client.callAction).not.toHaveBeenCalled();
  });

  it("returns formatted results on success", async () => {
    const client = createMockClient({
      success: true as const,
      data: { organic: [{ title: "R1", link: "https://r1.com", snippet: "S1" }] },
    });
    const { api, getCommand } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getCommand()!.handler({
      senderId: "user-1", channel: null, isAuthorizedSender: true,
      args: "test query", commandBody: "/search test query", config: {},
    });

    expect(result.text).toContain("R1");
    expect(result.text).toContain("https://r1.com");
    expect(result.text).toContain("S1");
  });

  it("returns no-results message when empty", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCommand } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getCommand()!.handler({
      senderId: "user-1", channel: null, isAuthorizedSender: true,
      args: "nothinghere", commandBody: "/search nothinghere", config: {},
    });

    expect(result.text).toContain("No results found");
  });

  it("returns error message on failure", async () => {
    const client: XapiClient = {
      callAction: vi.fn().mockRejectedValue(new Error("network down")),
    };
    const { api, getCommand } = createMockApi();

    registerXapiWebSearch(api, client);
    const result = await getCommand()!.handler({
      senderId: "user-1", channel: null, isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });

    expect(result.text).toContain("Search failed");
    expect(result.text).toContain("network down");
  });

  it("does not register command when registerCommand is absent", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCommand } = createMockApi({}, { hasCommand: false });

    registerXapiWebSearch(api, client);

    expect(getCommand()).toBeUndefined();
  });
});

// --- CLI Command tests ---

function buildCliMock() {
  const actions: Record<string, (...args: unknown[]) => void | Promise<void>> = {};
  const subcommands: string[] = [];

  const makeMockCmd = (): Record<string, unknown> => {
    let currentName = "";
    const cmd: Record<string, unknown> = {
      description: () => cmd,
      argument: () => cmd,
      option: () => cmd,
      action: (fn: (...args: unknown[]) => void | Promise<void>) => { actions[currentName] = fn; return cmd; },
      command: (name: string) => { currentName = name; subcommands.push(name); return cmd; },
    };
    return cmd;
  };

  let rootName = "";
  const rootCmd = makeMockCmd();
  const program = {
    command: (name: string) => { rootName = name; subcommands.push(name); return rootCmd; },
  };

  return { program, subcommands, actions, getRootName: () => rootName };
}

describe("registerXapiWebSearch — CLI path", () => {
  it("registers CLI with command name 'xapi-search'", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCliOptions } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getCliOptions()).toEqual({ commands: ["xapi-search"] });
  });

  it("does not register CLI when registerCli is absent", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCliSetup, getCliOptions } = createMockApi({}, { hasCli: false });

    registerXapiWebSearch(api, client);

    expect(getCliSetup()).toBeUndefined();
    expect(getCliOptions()).toBeUndefined();
  });

  it("sets up search and status subcommands", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCliSetup } = createMockApi();

    registerXapiWebSearch(api, client);

    const { program, subcommands } = buildCliMock();
    getCliSetup()!({ program });

    expect(subcommands).toContain("xapi-search");
    expect(subcommands).toContain("search");
    expect(subcommands).toContain("status");
  });

  it("search action prints formatted results", async () => {
    const client = createMockClient({
      success: true as const,
      data: { organic: [{ title: "R1", link: "https://r1.com", snippet: "S1" }] },
    });
    const { api, getCliSetup } = createMockApi();
    registerXapiWebSearch(api, client);

    const { program, actions } = buildCliMock();
    getCliSetup()!({ program });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await actions["search"]!("my query", { count: "3" });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("R1"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("https://r1.com"));
    } finally {
      logSpy.mockRestore();
    }
  });

  it("search action prints no-results message", async () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getCliSetup } = createMockApi();
    registerXapiWebSearch(api, client);

    const { program, actions } = buildCliMock();
    getCliSetup()!({ program });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await actions["search"]!("nothing", {});
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No results found"));
    } finally {
      logSpy.mockRestore();
    }
  });

  it("search action prints error on failure", async () => {
    const client: XapiClient = { callAction: vi.fn().mockRejectedValue(new Error("timeout")) };
    const { api, getCliSetup } = createMockApi();
    registerXapiWebSearch(api, client);

    const { program, actions } = buildCliMock();
    getCliSetup()!({ program });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await actions["search"]!("test", {});
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    } finally {
      errSpy.mockRestore();
    }
  });

  it("status action reports connected on success", async () => {
    const client = createMockClient({
      success: true as const,
      data: { organic: [{ title: "T", link: "https://t.com", snippet: "S" }] },
    });
    const { api, getCliSetup } = createMockApi();
    registerXapiWebSearch(api, client);

    const { program, actions } = buildCliMock();
    getCliSetup()!({ program });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await actions["status"]!();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("connected"));
    } finally {
      logSpy.mockRestore();
    }
  });

  it("status action reports unreachable on failure", async () => {
    const client: XapiClient = { callAction: vi.fn().mockRejectedValue(new Error("dns fail")) };
    const { api, getCliSetup } = createMockApi();
    registerXapiWebSearch(api, client);

    const { program, actions } = buildCliMock();
    getCliSetup()!({ program });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await actions["status"]!();
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("unreachable"));
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("dns fail"));
    } finally {
      errSpy.mockRestore();
    }
  });
});

// --- Full registration feature detection ---

describe("registerXapiWebSearch — all four paths", () => {
  it("registers all four when all APIs exist", () => {
    const client = createMockClient({ success: true, data: { organic: [] } });
    const { api, getProvider, getTool, getCommand, getCliOptions } = createMockApi();

    registerXapiWebSearch(api, client);

    expect(getProvider()).toBeDefined();
    expect(getTool()).toBeDefined();
    expect(getCommand()).toBeDefined();
    expect(getCliOptions()).toBeDefined();
  });
});

// --- clampCount ---

describe("clampCount", () => {
  it("returns default 10 for undefined", () => {
    expect(clampCount(undefined)).toBe(10);
  });

  it("returns default 10 for null", () => {
    expect(clampCount(null)).toBe(10);
  });

  it("returns default 10 for NaN string", () => {
    expect(clampCount("abc")).toBe(10);
  });

  it("clamps 0 to 1", () => {
    expect(clampCount(0)).toBe(1);
  });

  it("clamps negative to 1", () => {
    expect(clampCount(-5)).toBe(1);
  });

  it("clamps above 20 to 20", () => {
    expect(clampCount(50)).toBe(20);
  });

  it("passes through valid numbers", () => {
    expect(clampCount(5)).toBe(5);
    expect(clampCount(1)).toBe(1);
    expect(clampCount(20)).toBe(20);
  });

  it("coerces numeric strings", () => {
    expect(clampCount("7")).toBe(7);
  });

  it("returns default 10 for Infinity", () => {
    expect(clampCount(Infinity)).toBe(10);
  });
});

// --- executeSearch defensive handling ---

describe("executeSearch — missing data fallback", () => {
  it("returns empty array when success is true but data is undefined", async () => {
    const client = createMockClient({ success: true } as XapiActionResponse);

    const results = await executeSearch(client, "test", 10, "us", "en");

    expect(results).toEqual([]);
  });

  it("returns empty array when success is true but data is null", async () => {
    const client = createMockClient({ success: true, data: null } as unknown as XapiActionResponse);

    const results = await executeSearch(client, "test", 10, "us", "en");

    expect(results).toEqual([]);
  });
});
