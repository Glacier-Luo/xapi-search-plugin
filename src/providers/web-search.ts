import type { XapiClient } from "../lib/xapi-client.js";
import type { PluginApi } from "../types.js";

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

// --- OpenClaw search result type ---

interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/**
 * Transform xapi.to search response to OpenClaw format.
 *
 * Strategy:
 * - knowledgeGraph → first result (provides direct answer)
 * - organic → mapped one-to-one
 * - peopleAlsoAsk / relatedSearches / sitelinks → not mapped (unsupported by OpenClaw search contract)
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

// --- Registration ---

// NOTE: `createPluginBackedWebSearchProvider` API signature is not fully confirmed.
// The types below are based on OpenClaw documentation examples.
// If the actual SDK differs, adjust the registration call accordingly.

const DEFAULT_LOCALE = "us";
const DEFAULT_LANGUAGE = "en";

interface WebSearchArgs {
  readonly query: string;
  readonly count?: number;
}

export function registerXapiWebSearch(api: PluginApi, client: XapiClient): void {
  const locale = api.config.locale ?? DEFAULT_LOCALE;
  const language = api.config.language ?? DEFAULT_LANGUAGE;

  // Register directly since createPluginBackedWebSearchProvider signature is unconfirmed.
  // If the SDK helper is available, wrap with it:
  //   api.registerWebSearchProvider(createPluginBackedWebSearchProvider({ id, search }));
  api.registerWebSearchProvider({
    id: "xapi-search",

    async search(args: WebSearchArgs): Promise<readonly SearchResult[]> {
      const result = await client.callAction<SerperSearchData>("web.search", {
        q: args.query,
        num: args.count ?? 10,
        gl: locale,
        hl: language,
        autocorrect: true,
      });

      if (!result.success) {
        throw new Error(
          `xapi.to web.search error: ${result.error ?? "unknown"}`,
        );
      }

      return transformResults(result.data);
    },
  });
}
