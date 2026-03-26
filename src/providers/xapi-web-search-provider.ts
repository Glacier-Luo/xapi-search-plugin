import { Type } from "@sinclair/typebox";
import {
  enablePluginInConfig,
  getScopedCredentialValue,
  setScopedCredentialValue,
  resolveProviderWebSearchPluginConfig,
  setProviderWebSearchPluginConfigValue,
  wrapWebContent,
  readCache,
  writeCache,
  normalizeCacheKey,
  resolveSiteName,
} from "openclaw/plugin-sdk/provider-web-search";
import { createXapiClient } from "../lib/xapi-client.js";
import type {
  SearchConfigRecord,
  WebSearchProviderPlugin,
  WebSearchProviderToolDefinition,
  WebSearchCredentialResolutionSource,
} from "openclaw/plugin-sdk/provider-web-search";
import type { OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";

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
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// --- Cache (using SDK readCache/writeCache with a local Map) ---

const SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; expiresAt: number; insertedAt: number }
>();

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
 * reference object. Simpler version of SDK's readConfiguredSecretString
 * (which requires a path parameter for diagnostics).
 */
function readConfiguredSecret(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
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

/**
 * Clamp count to [1, MAX_SEARCH_COUNT]. The SDK's resolveSearchCount caps at 10;
 * xapi.to supports up to 20, so we keep our own implementation.
 */
export function resolveSearchCount(count: unknown, fallback: number): number {
  const n = count != null ? Number(count) : fallback;
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 1), MAX_SEARCH_COUNT);
}

// --- Config merging ---

/**
 * Merge scoped search config (searchConfig.xapi) with plugin-level config
 * (resolved from full OpenClawConfig via SDK). Plugin config is the base;
 * search config's `xapi` section overrides.
 */
function mergeXapiSearchConfig(
  searchConfig?: SearchConfigRecord,
  fullConfig?: OpenClawConfig,
): SearchConfigRecord {
  const fromSearch = resolveXapiSearchConfig(searchConfig);
  const fromPlugin = resolveProviderWebSearchPluginConfig(fullConfig, "xapi-search") ?? {};

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
      title: wrapWebContent(data.knowledgeGraph.title, "web_search"),
      url: data.knowledgeGraph.descriptionLink ?? "",
      description: wrapWebContent(data.knowledgeGraph.description, "web_search"),
      siteName: resolveSiteName(data.knowledgeGraph.descriptionLink),
    });
  }

  if (data.organic) {
    for (const item of data.organic) {
      results.push({
        title: wrapWebContent(item.title, "web_search"),
        url: item.link,
        description: wrapWebContent(item.snippet, "web_search"),
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

      // --- Cache lookup ---
      const cacheKey = normalizeCacheKey(
        JSON.stringify({
          type: "xapi-search",
          q: query,
          count,
          locale,
          language,
        }),
      );
      const cached = readCache(SEARCH_CACHE, cacheKey);
      if (cached) {
        return { ...cached.value, cached: true };
      }

      const start = Date.now();

      try {
        const results = await runXapiSearch({
          query,
          apiKey: auth.apiKey,
          count,
          locale,
          language,
          timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        });

        const result: Record<string, unknown> = {
          query,
          provider: "xapi",
          count: results.length,
          tookMs: Date.now() - start,
          externalContent: {
            untrusted: true,
            source: "web_search",
            provider: "xapi",
            wrapped: true,
          },
          results,
        };

        // --- Cache write ---
        writeCache(SEARCH_CACHE, cacheKey, result, DEFAULT_CACHE_TTL_MS);

        return result;
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
    requiresCredential: true,
    credentialLabel: "xapi.to API key",
    envVars: ["XAPI_API_KEY"],
    placeholder: "sk-...",
    signupUrl: "https://xapi.to",
    docsUrl: "https://xapi.to",
    autoDetectOrder: 10,

    credentialPath: "plugins.entries.xapi-search.config.webSearch.apiKey",
    inactiveSecretPaths: ["plugins.entries.xapi-search.config.webSearch.apiKey"],

    // Credential from scoped search config (searchConfig.xapi.apiKey)
    getCredentialValue: (searchConfig) =>
      getScopedCredentialValue(searchConfig, "xapi"),
    setCredentialValue: (searchConfigTarget, value) =>
      setScopedCredentialValue(searchConfigTarget, "xapi", value),

    // Credential from full OpenClawConfig (plugins.entries.xapi-search.config.webSearch.apiKey)
    getConfiguredCredentialValue: (config) =>
      resolveProviderWebSearchPluginConfig(config, "xapi-search")?.apiKey,
    setConfiguredCredentialValue: (configTarget, value) =>
      setProviderWebSearchPluginConfigValue(configTarget, "xapi-search", "apiKey", value),

    applySelectionConfig: (config) =>
      enablePluginInConfig(config, "xapi-search").config,

    resolveRuntimeMetadata: (ctx) => ({
      selectedProviderKeySource: ctx.resolvedCredential?.source,
    }),

    createTool: (ctx) =>
      createXapiToolDefinition(
        mergeXapiSearchConfig(ctx.searchConfig, ctx.config),
      ),
  };
}

// --- Exported for testing ---

export const __testing = {
  resolveXapiSearchConfig,
  readConfiguredSecret,
  mergeXapiSearchConfig,
  createXapiToolDefinition,
  createXapiSchema,
  SEARCH_CACHE,
} as const;
