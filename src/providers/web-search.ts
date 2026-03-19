import type { XapiClient } from "../lib/xapi-client.js";
import type { PluginApi, ToolDefinition, ToolResult } from "../types.js";

// --- Serper response types (verified against actual xapi.to response) ---

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

// --- Transformed search result ---

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/**
 * Transform xapi.to search response to a flat result list.
 *
 * Strategy:
 * - knowledgeGraph → first result (provides direct answer)
 * - organic → mapped one-to-one
 * - peopleAlsoAsk / relatedSearches / sitelinks → not mapped
 */
export function transformResults(data: SerperSearchData): readonly SearchResult[] {
  const results: SearchResult[] = [];

  if (data.knowledgeGraph?.title && data.knowledgeGraph.description) {
    results.push({
      title: data.knowledgeGraph.title,
      url: data.knowledgeGraph.descriptionLink ?? "",
      snippet: data.knowledgeGraph.description,
    });
  }

  if (data.organic) {
    for (const item of data.organic) {
      results.push({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
      });
    }
  }

  return results;
}

// --- Tool registration ---

const DEFAULT_LOCALE = "us";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_COUNT = 10;

const TOOL_PARAMETERS = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The search query to execute",
    },
    count: {
      type: "number",
      description: "Number of results to return (1-20)",
      default: DEFAULT_COUNT,
    },
  },
  required: ["query"],
} as const;

function makeSuccessResult(results: readonly SearchResult[]): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
  };
}

function makeErrorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function createXapiSearchTool(
  api: PluginApi,
  getClient: XapiClient | (() => XapiClient),
): ToolDefinition {
  const locale = api.config.locale ?? DEFAULT_LOCALE;
  const language = api.config.language ?? DEFAULT_LANGUAGE;

  return {
    name: "xapi_web_search",
    label: "xapi.to Web Search",
    description:
      "Search the web using xapi.to. Returns a list of results with title, url, and snippet.",
    parameters: TOOL_PARAMETERS,

    async execute(_toolCallId, params): Promise<ToolResult> {
      if (typeof params.query !== "string" || !params.query.trim()) {
        return makeErrorResult("Missing required parameter: query (must be a non-empty string)");
      }
      const query = params.query;

      const raw = params.count != null ? Number(params.count) : DEFAULT_COUNT;
      const count = Math.min(Math.max(Number.isFinite(raw) ? raw : DEFAULT_COUNT, 1), 20);

      try {
        const client = typeof getClient === "function" ? getClient() : getClient;
        const result = await client.callAction<SerperSearchData>("web.search", {
          q: query,
          num: count,
          gl: locale,
          hl: language,
          autocorrect: true,
        });

        if (!result.success) {
          return makeErrorResult(
            `xapi.to web.search error: ${result.error ?? "unknown"}`,
          );
        }

        return makeSuccessResult(transformResults(result.data));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return makeErrorResult(`xapi.to web.search failed: ${message}`);
      }
    },
  };
}

/**
 * Register the xapi_web_search tool with OpenClaw.
 */
export function registerXapiWebSearch(
  api: PluginApi,
  getClient: XapiClient | (() => XapiClient),
): void {
  api.registerTool(createXapiSearchTool(api, getClient));
}
