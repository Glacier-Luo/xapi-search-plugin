import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the provider module — use proper named exports (not __testing)
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

import plugin from "./index.js";
import {
  createXapiWebSearchProvider,
  resolveXapiApiKey,
  resolveSearchCount,
  runXapiSearch,
} from "./providers/xapi-web-search-provider.js";

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
  it("registers web search provider when registerWebSearchProvider exists", () => {
    const registerWebSearchProvider = vi.fn();
    plugin.register({
      config: {},
      registerWebSearchProvider,
    });

    expect(registerWebSearchProvider).toHaveBeenCalledOnce();
    expect(createXapiWebSearchProvider).toHaveBeenCalledOnce();
  });

  it("does not throw when registerWebSearchProvider is absent", () => {
    expect(() => plugin.register({ config: {} })).not.toThrow();
  });
});

describe("plugin.register — command path", () => {
  it("registers /search command when registerCommand exists", () => {
    const registerCommand = vi.fn();
    plugin.register({
      config: {},
      registerCommand,
    });

    expect(registerCommand).toHaveBeenCalledOnce();
    const cmd = registerCommand.mock.calls[0]![0];
    expect(cmd.name).toBe("search");
    expect(cmd.acceptsArgs).toBe(true);
  });

  it("does not register command when registerCommand is absent", () => {
    const registerWebSearchProvider = vi.fn();
    plugin.register({ config: {}, registerWebSearchProvider });

    // no error, and registerCommand not called
    expect(registerWebSearchProvider).toHaveBeenCalledOnce();
  });

  it("command handler returns usage when args empty", async () => {
    const registerCommand = vi.fn();
    plugin.register({ config: {}, registerCommand });

    const handler = registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: null, isAuthorizedSender: true,
      args: "", commandBody: "/search", config: {},
    });
    expect(result.text).toContain("Usage:");
  });

  it("command handler returns error when no API key", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });

    const registerCommand = vi.fn();
    plugin.register({ config: {}, registerCommand });

    const handler = registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: null, isAuthorizedSender: true,
      args: "test query", commandBody: "/search test query", config: {},
    });
    expect(result.text).toContain("API Key is required");
  });

  it("command handler returns formatted results on success", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockResolvedValue([
      { title: "R1", url: "https://r1.com", description: "D1" },
    ]);

    const registerCommand = vi.fn();
    plugin.register({ config: {}, registerCommand });

    const handler = registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: null, isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });
    expect(result.text).toContain("R1");
    expect(result.text).toContain("https://r1.com");
  });

  it("command handler returns no-results message when empty", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockResolvedValue([]);

    const registerCommand = vi.fn();
    plugin.register({ config: {}, registerCommand });

    const handler = registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: null, isAuthorizedSender: true,
      args: "obscure query", commandBody: "/search obscure query", config: {},
    });
    expect(result.text).toContain("No results found");
  });

  it("command handler returns error on search failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockRejectedValue(new Error("network down"));

    const registerCommand = vi.fn();
    plugin.register({ config: {}, registerCommand });

    const handler = registerCommand.mock.calls[0]![0].handler;
    const result = await handler({
      senderId: "u1", channel: null, isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });
    expect(result.text).toContain("Search failed");
    expect(result.text).toContain("network down");
  });

  it("reads webSearch config from api.config for API key resolution", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-from-config", source: "config" });
    vi.mocked(runXapiSearch).mockResolvedValue([
      { title: "T1", url: "https://t1.com", description: "D1" },
    ]);

    const registerCommand = vi.fn();
    plugin.register({
      config: { webSearch: { apiKey: "sk-from-config", locale: "jp" } },
      registerCommand,
    });

    const handler = registerCommand.mock.calls[0]![0].handler;
    await handler({
      senderId: "u1", channel: null, isAuthorizedSender: true,
      args: "test", commandBody: "/search test", config: {},
    });

    // resolveXapiApiKey should have been called with the webSearch sub-config
    expect(resolveXapiApiKey).toHaveBeenCalled();
  });
});

describe("plugin.register — CLI path", () => {
  it("registers CLI with xapi-search commands", () => {
    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });

    expect(registerCli).toHaveBeenCalledOnce();
    expect(registerCli.mock.calls[0]![1]).toEqual({ commands: ["xapi-search"] });
  });

  it("does not register CLI when registerCli is absent", () => {
    expect(() => plugin.register({ config: {} })).not.toThrow();
  });

  // --- M5: CLI action callback execution tests ---

  function buildCliProgram(registerCli: ReturnType<typeof vi.fn>) {
    // Simulate the commander-like program structure
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

    // Call the CLI setup callback
    const setupFn = registerCli.mock.calls[0]![0];
    setupFn({ program });

    return actions;
  }

  it("CLI search action prints error and sets exitCode when no API key", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

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

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

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

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

    await actions["search"]!("obscure", {});
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No results found"));

    consoleSpy.mockRestore();
  });

  it("CLI search action prints error on failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(resolveSearchCount).mockReturnValue(5);
    vi.mocked(runXapiSearch).mockRejectedValue(new Error("timeout"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

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

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

    await actions["status"]!();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("connected"));

    consoleSpy.mockRestore();
  });

  it("CLI status action prints error when no API key", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: undefined, source: "missing" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

    await actions["status"]!();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("API Key is required"));

    consoleSpy.mockRestore();
  });

  it("CLI status action prints unreachable on failure", async () => {
    vi.mocked(resolveXapiApiKey).mockReturnValue({ apiKey: "sk-test", source: "env" });
    vi.mocked(runXapiSearch).mockRejectedValue(new Error("dns fail"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const registerCli = vi.fn();
    plugin.register({ config: {}, registerCli });
    const actions = buildCliProgram(registerCli);

    await actions["status"]!();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("unreachable"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("dns fail"));
    expect(process.exitCode).toBe(1);

    consoleSpy.mockRestore();
  });
});
