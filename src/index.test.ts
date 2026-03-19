import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the modules before importing the plugin
vi.mock("./lib/xapi-client.js", () => ({
  createXapiClient: vi.fn().mockReturnValue({ callAction: vi.fn() }),
}));

vi.mock("./providers/web-search.js", () => ({
  registerXapiWebSearch: vi.fn(),
}));

import plugin from "./index.js";
import { createXapiClient } from "./lib/xapi-client.js";
import { registerXapiWebSearch } from "./providers/web-search.js";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.XAPI_API_KEY;
});

afterEach(() => {
  delete process.env.XAPI_API_KEY;
});

describe("plugin", () => {
  it("has correct id and name", () => {
    expect(plugin.id).toBe("xapi-search");
    expect(plugin.name).toBe("xapi.to Web Search");
  });

  it("registers without throwing even when no API key is set", () => {
    const api = {
      config: {},
      registerWebSearchProvider: vi.fn(),
    };

    // Should NOT throw — key check is deferred to search-time
    expect(() => plugin.register(api)).not.toThrow();
    expect(registerXapiWebSearch).toHaveBeenCalledOnce();
  });

  it("passes api and a client factory to registerXapiWebSearch", () => {
    const api = {
      config: { apiKey: "sk-test" },
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    const [passedApi, passedFactory] = vi.mocked(registerXapiWebSearch).mock.calls[0]!;
    expect(passedApi).toBe(api);
    expect(typeof passedFactory).toBe("function");
  });

  it("factory creates client with apiKey from config", () => {
    const mockClient = { callAction: vi.fn() };
    vi.mocked(createXapiClient).mockReturnValueOnce(mockClient);

    const api = {
      config: { apiKey: "sk-from-config" },
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    const factory = vi.mocked(registerXapiWebSearch).mock.calls[0]![1] as () => unknown;
    const client = factory();

    expect(createXapiClient).toHaveBeenCalledWith({ apiKey: "sk-from-config" });
    expect(client).toBe(mockClient);
  });

  it("factory falls back to XAPI_API_KEY env var", () => {
    process.env.XAPI_API_KEY = "sk-from-env";
    const api = {
      config: {},
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    const factory = vi.mocked(registerXapiWebSearch).mock.calls[0]![1] as () => unknown;
    factory();

    expect(createXapiClient).toHaveBeenCalledWith({ apiKey: "sk-from-env" });
  });

  it("factory prefers config.apiKey over env var", () => {
    process.env.XAPI_API_KEY = "sk-from-env";
    const api = {
      config: { apiKey: "sk-from-config" },
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    const factory = vi.mocked(registerXapiWebSearch).mock.calls[0]![1] as () => unknown;
    factory();

    expect(createXapiClient).toHaveBeenCalledWith({ apiKey: "sk-from-config" });
  });

  it("factory throws when no API key is available at call time", () => {
    const api = {
      config: {},
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    const factory = vi.mocked(registerXapiWebSearch).mock.calls[0]![1] as () => unknown;
    expect(() => factory()).toThrow("xapi.to API Key is required");
    expect(createXapiClient).not.toHaveBeenCalled();
  });
});
