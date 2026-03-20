import type { XapiClient } from "../lib/xapi-client.js";
import type { PluginApi, SearchResult, ToolResult, CommandContext } from "../types.js";

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

// --- Shared search logic ---

const DEFAULT_LOCALE = "us";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_COUNT = 10;

export function clampCount(raw: unknown): number {
  const n = raw != null ? Number(raw) : DEFAULT_COUNT;
  return Math.min(Math.max(Number.isFinite(n) ? n : DEFAULT_COUNT, 1), 20);
}

/**
 * Core search function shared by both provider and tool registration paths.
 */
export async function executeSearch(
  getClient: XapiClient | (() => XapiClient),
  query: string,
  count: number,
  locale: string,
  language: string,
): Promise<readonly SearchResult[]> {
  const client = typeof getClient === "function" ? getClient() : getClient;
  const result = await client.callAction<SerperSearchData>("web.search", {
    q: query,
    num: count,
    gl: locale,
    hl: language,
    autocorrect: true,
  });

  if (!result.success) {
    throw new Error(
      `xapi.to web.search error: ${result.error ?? "unknown"}`,
    );
  }

  return transformResults(result.data ?? {});
}

// --- Registration ---

/**
 * Register xapi.to web search with OpenClaw.
 *
 * Dual registration strategy:
 * - registerWebSearchProvider (>= 2026.3.7): replaces built-in web_search provider
 * - registerTool (>= 2026.3.2): adds standalone xapi_web_search tool
 *
 * Both paths share the same search logic via executeSearch().
 */
export function registerXapiWebSearch(
  api: PluginApi,
  getClient: XapiClient | (() => XapiClient),
): void {
  const locale = api.config.locale ?? DEFAULT_LOCALE;
  const language = api.config.language ?? DEFAULT_LANGUAGE;

  // Path 1: Web Search Provider (replaces built-in web_search)
  if (typeof api.registerWebSearchProvider === "function") {
    api.registerWebSearchProvider({
      id: "xapi-search",

      async search(args): Promise<readonly SearchResult[]> {
        if (typeof args.query !== "string" || !args.query.trim()) {
          throw new Error("Missing required parameter: query");
        }
        return executeSearch(getClient, args.query, clampCount(args.count), locale, language);
      },
    });
  }

  // Path 2: Standalone Tool (fallback for older versions, always registered)
  if (typeof api.registerTool === "function") {
    api.registerTool({
      name: "xapi_web_search",
      label: "xapi.to Web Search",
      description:
        "Search the web using xapi.to. Returns a list of results with title, url, and snippet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query to execute" },
          count: { type: "number", description: "Number of results to return (1-20)", default: DEFAULT_COUNT },
        },
        required: ["query"],
      } as const,

      async execute(_toolCallId, params): Promise<ToolResult> {
        if (typeof params.query !== "string" || !params.query.trim()) {
          return { content: [{ type: "text", text: "Missing required parameter: query" }], isError: true };
        }
        try {
          const results = await executeSearch(getClient, params.query, clampCount(params.count), locale, language);
          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `xapi.to web.search failed: ${message}` }], isError: true };
        }
      },
    });
  }

  // Path 3: Chat Command (/search <query>)
  if (typeof api.registerCommand === "function") {
    api.registerCommand({
      name: "search",
      description: "Search the web using xapi.to (bypasses LLM, returns results directly)",
      acceptsArgs: true,

      async handler(ctx: CommandContext): Promise<{ text: string }> {
        const query = ctx.args.trim();
        if (!query) {
          return { text: "Usage: /search <query>" };
        }
        try {
          const results = await executeSearch(getClient, query, DEFAULT_COUNT, locale, language);
          if (results.length === 0) {
            return { text: `No results found for "${query}".` };
          }
          const lines = results.map(
            (r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`,
          );
          return { text: `Search results for "${query}":\n\n${lines.join("\n\n")}` };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { text: `Search failed: ${message}` };
        }
      },
    });
  }

  // Path 4: CLI Command (openclaw xapi-search ...)
  if (typeof api.registerCli === "function") {
    api.registerCli(
      ({ program }) => {
        const cmd = program.command("xapi-search").description("xapi.to web search commands");

        cmd.command("search")
          .description("Search the web from the command line")
          .argument("<query>", "Search query")
          .option("-n, --count <number>", "Number of results", String(DEFAULT_COUNT))
          .action(async (query: unknown, opts: unknown) => {
            try {
              const count = clampCount((opts as Record<string, unknown>)?.count);
              const results = await executeSearch(getClient, String(query), count, locale, language);
              if (results.length === 0) {
                console.log(`No results found for "${query}".`);
                return;
              }
              for (const [i, r] of results.entries()) {
                console.log(`${i + 1}. ${r.title}`);
                console.log(`   ${r.url}`);
                console.log(`   ${r.snippet}\n`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`Search failed: ${message}`);
            }
          });

        cmd.command("status")
          .description("Check xapi.to connectivity")
          .action(async () => {
            try {
              const results = await executeSearch(getClient, "test", 1, locale, language);
              console.log(results.length > 0 ? "xapi.to web search: connected" : "xapi.to web search: no results returned");
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`xapi.to web search: unreachable — ${message}`);
            }
          });
      },
      { commands: ["xapi-search"] },
    );
  }
}
