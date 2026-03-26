import { Type } from "@sinclair/typebox";
import { jsonResult, readStringParam, readNumberParam } from "openclaw/plugin-sdk/agent-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { createXapiClient } from "../lib/xapi-client.js";
import {
  resolveXapiApiKey,
  resolveSearchCount,
  DEFAULT_LOCALE,
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_SEARCH_COUNT,
} from "../providers/xapi-web-search-provider.js";

// --- Search type → action_id mapping ---

const SEARCH_TYPES = [
  "web",
  "realtime",
  "image",
  "news",
  "video",
  "scholar",
  "places",
  "maps",
  "shopping",
] as const;

type SearchType = (typeof SEARCH_TYPES)[number];

const ACTION_ID_MAP: Record<SearchType, string> = {
  web: "web.search",
  realtime: "web.search.realtime",
  image: "web.search.image",
  news: "web.search.news",
  video: "web.search.video",
  scholar: "web.search.scholar",
  places: "web.search.places",
  maps: "web.search.maps",
  shopping: "web.search.shopping",
};

// --- Time range → tbs mapping (for image/news/video/shopping) ---

const TIME_RANGE_TBS: Record<string, string> = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

// --- Helper: optional string enum ---

function optionalStringEnum<const T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Optional(
    Type.Unsafe<T[number]>({
      type: "string",
      enum: [...values],
      ...options,
    }),
  );
}

// --- Tool schema ---

const XapiSearchToolSchema = Type.Object(
  {
    query: Type.String({ description: "Search query string." }),
    type: optionalStringEnum(SEARCH_TYPES, {
      description:
        'Search type: "web" (default), "realtime" (time-filtered), "image", "news", "video", "scholar", "places", "maps", or "shopping".',
    }),
    count: Type.Optional(
      Type.Number({
        description: `Number of results to return (1-${MAX_SEARCH_COUNT}).`,
        minimum: 1,
        maximum: MAX_SEARCH_COUNT,
      }),
    ),
    time_range: optionalStringEnum(
      ["hour", "day", "week", "month", "year"] as const,
      {
        description:
          'Time range filter for realtime/news/image/video/shopping searches: "hour", "day", "week", "month", or "year".',
      },
    ),
    gl: Type.Optional(
      Type.String({
        description:
          "Country/locale code (e.g. us, cn, jp). Defaults to configured locale.",
      }),
    ),
    hl: Type.Optional(
      Type.String({
        description:
          "Language code (e.g. en, zh, ja). Defaults to configured language.",
      }),
    ),
    location: Type.Optional(
      Type.String({
        description:
          "Geographic location for localized results (e.g. 'San Francisco, California'). Used by web, realtime, places, and shopping searches.",
      }),
    ),
    ll: Type.Optional(
      Type.String({
        description:
          "Latitude/longitude coordinates (e.g. '@37.7749295,-122.4194155,14z'). Used by places and maps searches.",
      }),
    ),
  },
  { additionalProperties: false },
);

// --- Build request body based on search type ---

// Types that support each optional parameter (per API docs)
const TYPES_WITH_NUM: ReadonlySet<SearchType> = new Set(["web", "realtime"]);
// tbs: image/news/video/shopping accept tbs directly; realtime uses timeRange (converted by action)
const TYPES_WITH_TBS: ReadonlySet<SearchType> = new Set(["image", "news", "video", "shopping"]);
const TYPES_WITH_TIME_RANGE: ReadonlySet<SearchType> = new Set(["realtime"]);
const TYPES_WITH_LOCATION: ReadonlySet<SearchType> = new Set(["web", "realtime", "places", "shopping"]);
const TYPES_WITH_LL: ReadonlySet<SearchType> = new Set(["places", "maps"]);
const TYPES_WITH_AUTOCORRECT: ReadonlySet<SearchType> = new Set(["web", "image", "news", "video", "scholar", "places", "maps", "shopping"]);

function buildRequestBody(params: {
  readonly query: string;
  readonly type: SearchType;
  readonly count: number;
  readonly gl: string;
  readonly hl: string;
  readonly timeRange?: string;
  readonly location?: string;
  readonly ll?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    q: params.query,
    gl: params.gl,
    hl: params.hl,
    page: 1,
  };

  // autocorrect: all types except realtime
  if (TYPES_WITH_AUTOCORRECT.has(params.type)) {
    body.autocorrect = true;
  }

  // num: only web and realtime
  if (TYPES_WITH_NUM.has(params.type)) {
    body.num = params.count;
  }

  // timeRange: realtime action accepts timeRange directly (action converts to tbs internally)
  if (params.timeRange && TYPES_WITH_TIME_RANGE.has(params.type)) {
    body.timeRange = params.timeRange;
  }

  // tbs: image, news, video, shopping accept tbs directly
  if (params.timeRange && TYPES_WITH_TBS.has(params.type)) {
    const tbs = TIME_RANGE_TBS[params.timeRange];
    if (tbs) {
      body.tbs = tbs;
    }
  }

  // location: web, realtime, places, shopping
  if (params.location && TYPES_WITH_LOCATION.has(params.type)) {
    body.location = params.location;
  }

  // ll: places, maps
  if (params.ll && TYPES_WITH_LL.has(params.type)) {
    body.ll = params.ll;
  }

  return body;
}

// --- Tool factory ---

export function createXapiSearchTool(api: OpenClawPluginApi) {
  const pluginCfg = api.pluginConfig ?? {};
  const webSearchConfig =
    pluginCfg.webSearch &&
    typeof pluginCfg.webSearch === "object" &&
    !Array.isArray(pluginCfg.webSearch)
      ? (pluginCfg.webSearch as Record<string, unknown>)
      : {};

  const defaultLocale =
    (webSearchConfig.locale as string | undefined) ?? DEFAULT_LOCALE;
  const defaultLanguage =
    (webSearchConfig.language as string | undefined) ?? DEFAULT_LANGUAGE;

  return {
    name: "xapi_search",
    label: "xapi.to Search",
    description:
      "Search the web using xapi.to unified API. Supports multiple search types: web, realtime (time-filtered), image, news, video, scholar (academic papers), places, maps, and shopping. Returns structured results tailored to each search type.",
    parameters: XapiSearchToolSchema,

    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      const query = readStringParam(rawParams, "query", { required: true });
      if (!query.trim()) {
        return jsonResult({
          error: "missing_query",
          message: "query parameter is required.",
        });
      }

      const auth = resolveXapiApiKey(webSearchConfig);
      if (!auth.apiKey) {
        return jsonResult({
          error: "missing_xapi_api_key",
          message:
            "xapi.to API Key is required. Set XAPI_API_KEY env var or configure webSearch.apiKey.",
          docs: "https://xapi.to",
        });
      }

      const searchType = (readStringParam(rawParams, "type") || "web") as SearchType;
      if (!SEARCH_TYPES.includes(searchType)) {
        return jsonResult({
          error: "invalid_search_type",
          message: `Invalid search type "${searchType}". Must be one of: ${SEARCH_TYPES.join(", ")}`,
        });
      }

      const count = resolveSearchCount(
        readNumberParam(rawParams, "count", { integer: true }),
        10,
      );
      const timeRange = readStringParam(rawParams, "time_range") || undefined;
      const gl = readStringParam(rawParams, "gl") || defaultLocale;
      const hl = readStringParam(rawParams, "hl") || defaultLanguage;
      const location = readStringParam(rawParams, "location") || undefined;
      const ll = readStringParam(rawParams, "ll") || undefined;

      const actionId = ACTION_ID_MAP[searchType];
      const body = buildRequestBody({
        query: query.trim(),
        type: searchType,
        count,
        gl,
        hl,
        timeRange,
        location,
        ll,
      });

      const client = createXapiClient({
        apiKey: auth.apiKey,
        timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1000,
      });

      const start = Date.now();

      try {
        const result = await client.callAction<Record<string, unknown>>(
          actionId,
          body,
        );

        if (!result.success) {
          return jsonResult({
            error: "xapi_search_failed",
            message: result.error ?? "unknown xapi.to error",
            docs: "https://xapi.to",
            tookMs: Date.now() - start,
          });
        }

        // Remove credits from response if present
        const data = { ...(result.data ?? {}) };
        delete data.credits;

        return jsonResult({
          query: query.trim(),
          searchType,
          provider: "xapi",
          tookMs: Date.now() - start,
          ...data,
        });
      } catch (err) {
        return jsonResult({
          error: "xapi_search_failed",
          message: err instanceof Error ? err.message : String(err),
          docs: "https://xapi.to",
          tookMs: Date.now() - start,
        });
      }
    },
  };
}

// --- Exported for testing ---

export const __testing = {
  SEARCH_TYPES,
  ACTION_ID_MAP,
  TIME_RANGE_TBS,
  TYPES_WITH_NUM,
  TYPES_WITH_TBS,
  TYPES_WITH_TIME_RANGE,
  TYPES_WITH_LOCATION,
  TYPES_WITH_LL,
  TYPES_WITH_AUTOCORRECT,
  buildRequestBody,
  XapiSearchToolSchema,
} as const;
