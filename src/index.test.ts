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
    expect(plugin.id).toBe("xapi");
    expect(plugin.name).toBe("xapi.to");
  });

  it("uses apiKey from config when provided", () => {
    const api = {
      config: { apiKey: "sk-from-config" },
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    expect(createXapiClient).toHaveBeenCalledWith({ apiKey: "sk-from-config" });
    expect(registerXapiWebSearch).toHaveBeenCalledOnce();
  });

  it("falls back to XAPI_API_KEY env var when config.apiKey is missing", () => {
    process.env.XAPI_API_KEY = "sk-from-env";
    const api = {
      config: {},
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    expect(createXapiClient).toHaveBeenCalledWith({ apiKey: "sk-from-env" });
  });

  it("prefers config.apiKey over env var", () => {
    process.env.XAPI_API_KEY = "sk-from-env";
    const api = {
      config: { apiKey: "sk-from-config" },
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    expect(createXapiClient).toHaveBeenCalledWith({ apiKey: "sk-from-config" });
  });

  it("throws when no API key is available", () => {
    const api = {
      config: {},
      registerWebSearchProvider: vi.fn(),
    };

    expect(() => plugin.register(api)).toThrow(
      "xapi.to API Key is required",
    );
    expect(createXapiClient).not.toHaveBeenCalled();
  });

  it("passes api and client to registerXapiWebSearch", () => {
    const mockClient = { callAction: vi.fn() };
    vi.mocked(createXapiClient).mockReturnValueOnce(mockClient);

    const api = {
      config: { apiKey: "sk-test" },
      registerWebSearchProvider: vi.fn(),
    };

    plugin.register(api);

    expect(registerXapiWebSearch).toHaveBeenCalledWith(api, mockClient);
  });
});
