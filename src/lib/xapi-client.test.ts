import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createXapiClient } from "./xapi-client.js";

// --- Mock fetch globally ---

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  delete process.env.XAPI_ACTION_HOST;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Helpers ---

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  } as Response;
}

// --- Tests ---

describe("createXapiClient", () => {
  it("sends correct request to the unified action endpoint", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { organic: [] } }),
    );

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });
    await client.callAction("web.search", { q: "hello", num: 5 });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://test.xapi.to/v1/actions/execute");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["XAPI-Key"]).toBe("sk-test");
    expect(JSON.parse(options.body)).toEqual({
      action_id: "web.search",
      input: { q: "hello", num: 5 },
    });
  });

  it("returns typed response on success", async () => {
    const payload = { success: true as const, data: { organic: [{ title: "A" }] } };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });
    const result = await client.callAction<{ organic: Array<{ title: string }> }>(
      "web.search",
      { q: "test" },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.organic[0]!.title).toBe("A");
    }
  });

  it("returns error response when success is false", async () => {
    const payload = { success: false, error: "quota exceeded" };
    mockFetch.mockResolvedValueOnce(jsonResponse(payload));

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });
    const result = await client.callAction("web.search", { q: "test" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("quota exceeded");
    }
  });

  it("throws on non-ok HTTP status", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    const client = createXapiClient({ apiKey: "bad-key", host: "https://test.xapi.to" });

    await expect(
      client.callAction("web.search", { q: "test" }),
    ).rejects.toThrow("xapi.to web.search failed: 401");
  });

  it("throws on network error", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });

    await expect(
      client.callAction("web.search", { q: "test" }),
    ).rejects.toThrow("fetch failed");
  });

  it("throws descriptive message on timeout (AbortError)", async () => {
    // Simulate AbortError thrown by fetch when signal is aborted
    mockFetch.mockImplementationOnce(() => {
      const err = new DOMException("The operation was aborted.", "AbortError");
      return Promise.reject(err);
    });

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });

    await expect(
      client.callAction("web.search", { q: "test" }),
    ).rejects.toThrow("xapi.to web.search timed out after 15000ms");
  });

  it("throws when response body is not valid JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    } as Response);

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });

    await expect(
      client.callAction("web.search", { q: "test" }),
    ).rejects.toThrow("response is not valid JSON");
  });

  it("throws when response is missing 'success' field", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "rate limited" }),
    );

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });

    await expect(
      client.callAction("web.search", { q: "test" }),
    ).rejects.toThrow("unexpected response shape");
  });

  it("throws when response is null", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(null));

    const client = createXapiClient({ apiKey: "sk-test", host: "https://test.xapi.to" });

    await expect(
      client.callAction("web.search", { q: "test" }),
    ).rejects.toThrow("unexpected response shape");
  });

  it("uses DEFAULT_HOST when no host is provided and env is unset", async () => {
    delete process.env.XAPI_ACTION_HOST;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, data: {} }),
    );

    const client = createXapiClient({ apiKey: "sk-test" });
    await client.callAction("test.action", {});

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://c.xapi.to/v1/actions/execute");
  });
});
