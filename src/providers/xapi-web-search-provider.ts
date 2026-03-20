import { Type } from "@sinclair/typebox";
import { createXapiClient } from "../lib/xapi-client.js";
import type {
  SearchConfigRecord,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchCredentialResolutionSource,
  RuntimeMetadataContext,
  ToolCreationContext,
} from "../types.js";

// --- xapi.to API response types (verified against actual response) ---

interface SerperOrganicResult {
  readonly title: string;
  readonly link: string;
  readonly snippet: string;
  readonly position?: number;
  readonly date?: string;
  readonly sitelinks?: ReadonlyArray<{ title: string; link: string }>;
}

interface SerperKnowledgeGraph {
  readonly title?: string;
  readonly description?: string;
  readonly descriptionSource?: string;
  readonly descriptionLink?: string;
  readonly imageUrl?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

interface SerperSearchData {
  readonly searchParameters?: {
    readonly q: string;
    readonly gl: string;
    readonly hl: string;
    readonly num: number;
    readonly type: string;
    readonly page: number;
    readonly engine: string;
    readonly autocorrect: boolean;
  };
  readonly knowledgeGraph?: SerperKnowledgeGraph;
  readonly organic?: readonly SerperOrganicResult[];
  readonly peopleAlsoAsk?: ReadonlyArray<{
    question: string;
    snippet: string;
    title: string;
    link: string;
  }>;
  readonly relatedSearches?: ReadonlyArray<{ query: string }>;
}

// --- Public constants ---

export const DEFAULT_LOCALE = "us";
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_SEARCH_COUNT = 10;
export const MAX_SEARCH_COUNT = 20;
export const DEFAULT_TIMEOUT_SECONDS = 15;

// --- Configuration resolution ---

interface XapiSearchConfig {
  readonly apiKey?: unknown; // string or secret reference object
  readonly locale?: string;
  readonly language?: string;
}

function resolveXapiSearchConfig(searchConfig?: SearchConfigRecord): XapiSearchConfig {
  const xapi = searchConfig?.xapi;
  return xapi && typeof xapi === "object" && !Array.isArray(xapi)
    ? (xapi as XapiSearchConfig)
    : {};
}

/**
 * Read a configured secret value that may be a plain string or a secret
 * reference object. When the SDK is available, replace with:
 *   import { readConfiguredSecretString } from "openclaw/plugin-sdk/provider-web-search";
 */
function readConfiguredSecret(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  // Secret reference objects (e.g. { $ref: "vault://..." }) are resolved
  // by the host before reaching the plugin. If we still see an object here,
  // it means resolution hasn't happened yet — return undefined.
  return undefined;
}

export function resolveXapiApiKey(
  xapiConfig?: XapiSearchConfig,
): { apiKey?: string; source: WebSearchCredentialResolutionSource; fallbackEnvVar?: string } {
  const fromConfig = readConfiguredSecret(xapiConfig?.apiKey);
  if (fromConfig) {
    return { apiKey: fromConfig, source: "config" };
  }

  const fromEnv = process.env.XAPI_API_KEY?.trim();
  if (fromEnv) {
    return { apiKey: fromEnv, source: "env", fallbackEnvVar: "XAPI_API_KEY" };
  }

  return { apiKey: undefined, source: "missing" };
}

export function resolveSearchCount(count: unknown, fallback: number): number {
  const n = count != null ? Number(count) : fallback;
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 1), MAX_SEARCH_COUNT);
}

function resolveSiteName(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// --- Config merging ---

/**
 * Merge scoped search config (from global search settings) with plugin-level
 * config (from openclaw.json plugins.entries.xapi-search.config).
 *
 * Plugin config is the base; search config's `xapi` section overrides.
 *
 * When the SDK is available, replace with:
 *   import { mergeScopedSearchConfig } from "openclaw/plugin-sdk/provider-web-search";
 */
function mergeXapiSearchConfig(
  searchConfig?: SearchConfigRecord,
  pluginConfig?: Record<string, unknown>,
): SearchConfigRecord {
  const fromSearch = resolveXapiSearchConfig(searchConfig);
  const webSearch = pluginConfig?.webSearch;
  const fromPlugin = webSearch && typeof webSearch === "object" && !Array.isArray(webSearch)
    ? (webSearch as Record<string, unknown>)
    : {};

  // Plugin config is base, search config overrides
  const merged: Record<string, unknown> = { ...fromPlugin };
  for (const [k, v] of Object.entries(fromSearch)) {
    if (v !== undefined) {
      merged[k] = v;
    }
  }

  return {
    ...searchConfig,
    xapi: merged,
  };
}

/**
 * Read xapi-search plugin config from the full plugin config object.
 *
 * When the SDK is available, replace with:
 *   import { resolveProviderWebSearchPluginConfig } from "openclaw/plugin-sdk/provider-web-search";
 */
function resolvePluginWebSearchConfig(
  config?: Record<string, unknown>,
): XapiSearchConfig | undefined {
  const webSearch = config?.webSearch;
  if (webSearch && typeof webSearch === "object" && !Array.isArray(webSearch)) {
    return webSearch as XapiSearchConfig;
  }
  return undefined;
}

// --- Search result type ---

export interface XapiSearchResult {
  readonly title: string;
  readonly url: string;
  readonly description: string;
  readonly published?: string;
  readonly siteName?: string;
}

// --- Search execution ---

export async function runXapiSearch(params: {
  readonly query: string;
  readonly apiKey: string;
  readonly count: number;
  readonly locale: string;
  readonly language: string;
  readonly timeoutSeconds: number;
}): Promise<readonly XapiSearchResult[]> {
  const client = createXapiClient({
    apiKey: params.apiKey,
    timeoutMs: params.timeoutSeconds * 1000,
  });

  const result = await client.callAction<SerperSearchData>("web.search", {
    q: params.query,
    num: params.count,
    gl: params.locale,
    hl: params.language,
    autocorrect: true,
  });

  if (!result.success) {
    throw new Error(result.error ?? "unknown xapi.to error");
  }

  const data: SerperSearchData = result.data ?? {};
  const results: XapiSearchResult[] = [];

  if (data.knowledgeGraph?.title && data.knowledgeGraph.description) {
    results.push({
      title: data.knowledgeGraph.title,
      url: data.knowledgeGraph.descriptionLink ?? "",
      description: data.knowledgeGraph.description,
      siteName: resolveSiteName(data.knowledgeGraph.descriptionLink),
    });
  }

  if (data.organic) {
    for (const item of data.organic) {
      results.push({
        title: item.title,
        url: item.link,
        description: item.snippet,
        published: item.date,
        siteName: resolveSiteName(item.link),
      });
    }
  }

  return results;
}

// --- Tool definition ---

function createXapiSchema() {
  return Type.Object({
    query: Type.String({ description: "Search query string." }),
    count: Type.Optional(
      Type.Number({
        description: `Number of results to return (1-${MAX_SEARCH_COUNT}).`,
        minimum: 1,
        maximum: MAX_SEARCH_COUNT,
      }),
    ),
  });
}

function createXapiToolDefinition(
  searchConfig?: SearchConfigRecord,
): WebSearchProviderToolDefinition {
  const xapiConfig = resolveXapiSearchConfig(searchConfig);
  const locale = xapiConfig.locale ?? DEFAULT_LOCALE;
  const language = xapiConfig.language ?? DEFAULT_LANGUAGE;

  return {
    description:
      "Search the web using xapi.to unified API. Returns structured results with title, url, and description.",
    parameters: createXapiSchema(),
    execute: async (args) => {
      const auth = resolveXapiApiKey(xapiConfig);
      if (!auth.apiKey) {
        return {
          error: "missing_xapi_api_key",
          message:
            "web_search (xapi) needs an API key. Set XAPI_API_KEY in the environment, or configure plugins.entries.xapi-search.config.webSearch.apiKey.",
          docs: "https://xapi.to",
        };
      }

      const params = args as Record<string, unknown>;
      const rawQuery = params.query;
      const query = (typeof rawQuery === "string" ? rawQuery : String(rawQuery ?? "")).trim();
      if (!query) {
        return {
          error: "missing_query",
          message: "query parameter is required.",
        };
      }

      const count = resolveSearchCount(params.count, DEFAULT_SEARCH_COUNT);
      const start = Date.now();

      // H1 fix: catch API errors and return error objects instead of throwing
      try {
        const results = await runXapiSearch({
          query,
          apiKey: auth.apiKey,
          count,
          locale,
          language,
          timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        });

        return {
          query,
          provider: "xapi",
          count: results.length,
          tookMs: Date.now() - start,
          externalContent: {
            untrusted: true,
            source: "web_search",
            provider: "xapi",
            // Not using wrapWebContent yet — set wrapped: false.
            // When SDK is available, wrap content and set wrapped: true.
            wrapped: false,
          },
          results,
        };
      } catch (err) {
        return {
          error: "xapi_search_failed",
          message: err instanceof Error ? err.message : String(err),
          docs: "https://xapi.to",
          tookMs: Date.now() - start,
        };
      }
    },
  };
}

// --- Provider factory ---

export function createXapiWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "xapi-search",
    label: "xapi.to Web Search",
    hint: "Web search via xapi.to unified API",
    envVars: ["XAPI_API_KEY"],
    placeholder: "sk-...",
    signupUrl: "https://xapi.to",
    docsUrl: "https://xapi.to",
    autoDetectOrder: 60,

    credentialPath: "plugins.entries.xapi-search.config.webSearch.apiKey",
    inactiveSecretPaths: ["plugins.entries.xapi-search.config.webSearch.apiKey"],

    getCredentialValue: (searchConfig) => {
      const xapi = resolveXapiSearchConfig(searchConfig);
      return readConfiguredSecret(xapi.apiKey);
    },
    setCredentialValue: (searchConfigTarget, value) => {
      if (!searchConfigTarget.xapi || typeof searchConfigTarget.xapi !== "object" || Array.isArray(searchConfigTarget.xapi)) {
        searchConfigTarget.xapi = {};
      }
      (searchConfigTarget.xapi as Record<string, unknown>).apiKey = value;
    },
    getConfiguredCredentialValue: (config) => {
      return readConfiguredSecret(resolvePluginWebSearchConfig(config)?.apiKey);
    },
    setConfiguredCredentialValue: (configTarget, value) => {
      if (!configTarget.webSearch || typeof configTarget.webSearch !== "object" || Array.isArray(configTarget.webSearch)) {
        configTarget.webSearch = {};
      }
      (configTarget.webSearch as Record<string, unknown>).apiKey = value;
    },

    resolveRuntimeMetadata: (ctx: RuntimeMetadataContext) => ({
      transport: "xapi_unified_api",
      credentialSource: ctx.resolvedCredential?.source ?? "missing",
    }),

    createTool: (ctx: ToolCreationContext) =>
      createXapiToolDefinition(
        mergeXapiSearchConfig(ctx.searchConfig, ctx.config),
      ),
  };
}

// --- Exported for testing ---

export const __testing = {
  resolveXapiSearchConfig,
  readConfiguredSecret,
  resolveSiteName,
  mergeXapiSearchConfig,
  resolvePluginWebSearchConfig,
  createXapiToolDefinition,
  createXapiSchema,
} as const;
