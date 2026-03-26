import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the provider module
vi.mock("./providers/xapi-web-search-provider.js", () => {
  return {
    createXapiWebSearchProvider: vi.fn().mockReturnValue({
      id: "xapi-search",
      label: "xapi.to Web Search",
    }),
    resolveXapiApiKey: vi.fn(),
    resolveSearchCount: vi.fn(),
    runXapiSearch: vi.fn(),
    DEFAULT_LOCALE: "us",
    DEFAULT_LANGUAGE: "en",
    DEFAULT_SEARCH_COUNT: 10,
    DEFAULT_TIMEOUT_SECONDS: 15,
  };
});

// Mock the search tool module
vi.mock("./tools/xapi-search-tool.js", () => ({
  createXapiSearchTool: vi.fn().mockReturnValue({
    name: "xapi_search",
    label: "xapi.to Search",
    description: "Search tool",
    parameters: {},
    execute: vi.fn(),
  }),
}));

// Mock SDK definePluginEntry to pass through
vi.mock("openclaw/plugin-sdk/plugin-entry", () => ({
  definePluginEntry: (def: unknown) => def,
}));

import plugin from "./index.js";
import {
  createXapiWebSearchProvider,
  resolveXapiApiKey,
  resolveSearchCount,
  runXapiSearch,
} from "./providers/xapi-web-search-provider.js";
import { createXapiSearchTool } from "./tools/xapi-search-tool.js";

// Helper: build a minimal API object matching OpenClawPluginApi shape
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
  delete process.env.XAPI_API_KEY;
  process.exitCode = 0;
});

afterEach(() => {
  delete process.env.XAPI_API_KEY;
  process.exitCode = 0;
});

describe("plugin entry", () => {
  it("has correct id and name", () => {
    expect(plugin.id).toBe("xapi-search");
    expect(plugin.name).toBe("xapi.to Web Search");
  });

  it("has description", () => {
    expect(plugin.description).toBeTruthy();
  });
});

describe("plugin.register — provider path", () => {
  it("registers web search provider", () => {
    const api = buildApi();
    plugin.register(api as never);

    expect(api.registerWebSearchProvider).toHaveBeenCalledOnce();
    expect(createXapiWebSearchProvider).toHaveBeenCalledOnce();
  });

  it("registers standalone xapi_search agent tool", () => {
    const api = buildApi();
    plugin.register(api as never);

    expect(api.registerTool).toHaveBeenCalledOnce();
    expect(createXapiSearchTool).toHaveBeenCalledOnce();
    const registeredTool = api.registerTool.mock.calls[0]![0];
    expect(registeredTool.name).toBe("xapi_search");
  });
});

describe("plugin.register — command path", () => {
  it("registers /search command", () => {
    const api = buildApi();
    plugin.register(api as never);

    expect(api.registerCommand).toHaveBeenCalledOnce();
    const cmd = api.registerCommand.mock.calls[0]![0];
    expect(cmd.name).toBe("search");
    expect(cmd.acceptsArgs).toBe(true);
  });

  it("command handler returns usage when args empty", async () => {
    const api = buildApi();
    plugin.register(api as never);

    const handler = api.registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: "test", isAuthorizedSender: true,
      args: "", commandBody: "/search", config: {},
    });
    expect(result.text).toContain("Usage:");
  });

  it("command handler returns error when no API key", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });

    const api = buildApi();
    plugin.register(api as never);

    const handler = api.registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: "test", isAuthorizedSender: true,
      args: "test query", commandBody: "/search test query", config: {},
    });
    expect(result.text).toContain("API Key is required");
  });

  it("command handler returns formatted results on success", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockResolvedValue([
      { title: "R1", url: "https://r1.com", description: "D1" },
    ]);

    const api = buildApi();
    plugin.register(api as never);

    const handler = api.registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: "test", isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });
    expect(result.text).toContain("R1");
    expect(result.text).toContain("https://r1.com");
  });

  it("command handler returns no-results message when empty", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockResolvedValue([]);

    const api = buildApi();
    plugin.register(api as never);

    const handler = api.registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: "test", isAuthorizedSender: true,
      args: "obscure query", commandBody: "/search obscure query", config: {},
    });
    expect(result.text).toContain("No results found");
  });

  it("command handler returns error on search failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockRejectedValue(new Error("network down"));

    const api = buildApi();
    plugin.register(api as never);

    const handler = api.registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: "test", isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });
    expect(result.text).toContain("Search failed");
    expect(result.text).toContain("network down");
  });

  it("reads webSearch config from pluginConfig", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-from-config", source: "config" });
    vi.mocked(runXapiSearch).mockResolvedValue([
      { title: "T1", url: "https://t1.com", description: "D1" },
    ]);

    const api = buildApi({
      pluginConfig: { webSearch: { apiKey: "sk-from-config", locale: "jp" } },
    });
    plugin.register(api as never);

    const handler = api.registerCommand.mock.calls[0]![0].handler;
    await handler({
      senderId: "u1", channel: "test", isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });

    expect(resolveXapiApiKey).toHaveBeenCalled();
  });
});

describe("plugin.register — CLI path", () => {
  it("registers CLI with xapi-search commands", () => {
    const api = buildApi();
    plugin.register(api as never);

    expect(api.registerCli).toHaveBeenCalledOnce();
    expect(api.registerCli.mock.calls[0]![1]).toEqual({ commands: ["xapi-search"] });
  });

  function buildCliProgram(api: ReturnType<typeof buildApi>) {
    const actions: Record<string, (...args: unknown[]) => Promise<void>> = {};
    const mockCmd = {
      command: vi.fn().mockImplementation((name: string) => {
        const sub = {
          description: vi.fn().mockReturnThis(),
          argument: vi.fn().mockReturnThis(),
          option: vi.fn().mockReturnThis(),
          action: vi.fn().mockImplementation((fn: (...args: unknown[]) => Promise<void>) => {
            actions[name] = fn;
            return sub;
          }),
        };
        return sub;
      }),
    };
    const program = {
      command: vi.fn().mockImplementation((_name: string) => {
        return {
          description: vi.fn().mockReturnValue(mockCmd),
        };
      }),
    };

    const setupFn = api.registerCli.mock.calls[0]![0];
    setupFn({ program });

    return actions;
  }

  it("CLI search action prints error and sets exitCode when no API key", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["search"]!("test query", { count: "5" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("API Key is required"),
    );
    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
  });

  it("CLI search action prints results on success", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(resolveSearchCount).mockReturnValue(5);
    vi.mocked(runXapiSearch).mockResolvedValue([
      { title: "Result 1", url: "https://r1.com", description: "Desc 1" },
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["search"]!("test query", { count: "5" });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Result 1"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("https://r1.com"));

    consoleSpy.mockRestore();
  });

  it("CLI search action prints no-results message", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(resolveSearchCount).mockReturnValue(5);
    vi.mocked(runXapiSearch).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["search"]!("obscure", {});
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No results found"));

    consoleSpy.mockRestore();
  });

  it("CLI search action prints error on failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(resolveSearchCount).mockReturnValue(5);
    vi.mocked(runXapiSearch).mockRejectedValue(new Error("timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["search"]!("test", {});
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Search failed"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("timeout"));
    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
  });

  it("CLI status action prints connected on success", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockResolvedValue([{ title: "test", url: "https://test.com", description: "desc" }]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["status"]!();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("connected"));

    consoleSpy.mockRestore();
  });

  it("CLI status action prints error when no API key", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["status"]!();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("API Key is required"));

    consoleSpy.mockRestore();
  });

  it("CLI status action prints unreachable on failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockRejectedValue(new Error("dns fail"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const api = buildApi();
    plugin.register(api as never);
    const actions = buildCliProgram(api);

    await actions["status"]!();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("unreachable"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("dns fail"));
    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
  });
});
