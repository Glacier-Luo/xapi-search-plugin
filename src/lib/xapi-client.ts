const DEFAULT_HOST = "https://c.xapi.to";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface XapiClientConfig {
  readonly apiKey: string;
  readonly host?: string;
  readonly timeoutMs?: number;
}

export type XapiActionResponse<T = unknown> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string; readonly data?: undefined };

export interface XapiClient {
  callAction<T = unknown>(
    actionId: string,
    input: Record<string, unknown>,
  ): Promise<XapiActionResponse<T>>;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function createXapiClient(config: XapiClientConfig): XapiClient {
  const host = config.host ?? process.env.XAPI_ACTION_HOST ?? DEFAULT_HOST;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async callAction<T = unknown>(
      actionId: string,
      input: Record<string, unknown>,
    ): Promise<XapiActionResponse<T>> {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        timeoutMs,
      );

      try {
        const response = await fetch(`${host}/v1/actions/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "XAPI-Key": config.apiKey,
          },
          body: JSON.stringify({ action_id: actionId, input }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `xapi.to ${actionId} failed: ${response.status} ${response.statusText}`,
          );
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new Error(`xapi.to ${actionId}: response is not valid JSON`);
        }

        if (typeof body !== "object" || body === null || !("success" in body)) {
          throw new Error(`xapi.to ${actionId}: unexpected response shape`);
        }

        return body as XapiActionResponse<T>;
      } catch (err) {
        if (isAbortError(err)) {
          throw new Error(
            `xapi.to ${actionId} timed out after ${timeoutMs}ms`,
          );
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
