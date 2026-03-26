---
name: xapi-search
description: "xapi.to unified search: web, realtime, image, news, video, scholar, places, maps, and shopping."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔍",
        "requires": { "config": ["plugins.entries.xapi-search.enabled"] },
      },
  }
---

# xapi.to Search Tools

## Setup

An API key from [xapi.to](https://xapi.to) is **required** before using any search tool.

**Option 1 — Environment variable (recommended):**

```bash
export XAPI_KEY="sk-..."
```

**Option 2 — OpenClaw config:**

```json
{
  "plugins": {
    "entries": {
      "xapi-search": {
        "config": {
          "webSearch": { "apiKey": "sk-..." }
        }
      }
    }
  }
}
```

## When to use which tool

| Need | Tool | When |
| --- | --- | --- |
| Quick web search | `web_search` | Basic queries, no special options needed |
| Advanced search with type selection | `xapi_search` | Need specific search types (news, image, scholar, etc.), time filtering, or location-based results |

## web_search

xapi.to powers this automatically when selected as the search provider. Use for
straightforward web queries. Locale and language are determined by plugin
configuration and cannot be overridden per-call — use `xapi_search` if you need
to change them.

| Parameter | Description | Default |
| --- | --- | --- |
| `query` | Search query string | — |
| `count` | Number of results (1-20) | `10` |

## xapi_search

Use when you need a specific search vertical or advanced options.

| Parameter | Description | Default |
| --- | --- | --- |
| `query` | Search query string | — |
| `type` | Search type (see table below) | `web` |
| `count` | Number of results (1-20). Only effective for `web` and `realtime` | `10` |
| `time_range` | Filter by recency: `hour`, `day`, `week`, `month`, `year` | — |
| `gl` | Country/locale code (e.g. `us`, `cn`, `jp`) | configured locale or `us` |
| `hl` | Language code (e.g. `en`, `zh`, `ja`) | configured language or `en` |
| `location` | Geographic location text (e.g. `San Francisco, California`) | — |
| `ll` | Latitude/longitude (e.g. `@37.7749,-122.4194,14z`) | — |

### Search types

| Type | Best for | Returns |
| --- | --- | --- |
| `web` | General-purpose queries | Organic results, knowledge graph, related searches |
| `realtime` | Breaking news, live events, recent updates | Time-filtered organic results with dates |
| `image` | Finding images, visual references | Image URLs, dimensions, thumbnails, sources |
| `news` | Current events, press coverage | News articles with source, date, images |
| `video` | Finding video content | Video links, channels, duration, dates |
| `scholar` | Academic papers, research citations | Papers with publication info, citation counts, year |
| `places` | Restaurants, stores, local businesses | Names, addresses, ratings, phone numbers, websites |
| `maps` | Geographic location lookup | Places with coordinates, ratings, categories |
| `shopping` | Product search, price comparison | Products with prices, ratings, merchant sources |

### Which type to choose

Follow this decision tree:

1. **General information?** Use `web` (default)
2. **Need very recent results?** Use `realtime` with `time_range`
3. **Looking for images?** Use `image`
4. **Current events or press?** Use `news`
5. **Video tutorials or content?** Use `video`
6. **Academic research?** Use `scholar`
7. **Find a local business?** Use `places` with `location`
8. **Need coordinates on a map?** Use `maps` with `ll`
9. **Compare products or prices?** Use `shopping`

### Parameter availability by type

Not all parameters work with all types:

| Parameter | Available for |
| --- | --- |
| `count` | `web`, `realtime` |
| `time_range` | `realtime`, `image`, `news`, `video`, `shopping` |
| `gl` | all types |
| `hl` | all types |
| `location` | `web`, `realtime`, `places`, `shopping` |
| `ll` | `places`, `maps` |

Parameters not listed for a type are silently ignored.

### Tips

- **Start with `web`** — only switch to a specific type when you need vertical-specific results.
- **Use `realtime` + `time_range: "hour"`** for breaking news or events happening right now.
- **Use `scholar`** when the user asks about research, papers, studies, or citations.
- **Combine `places` + `location`** for local business queries (e.g., "best pizza in Tokyo").
- **Use `maps` + `ll`** when you already have coordinates and want nearby results.
- **Use `shopping`** when the user wants to compare prices or find products to buy.
- **`gl` and `hl`** default to the configured locale/language. Override when the user asks for results from a specific country or language.

## Choosing the right workflow

Start simple, escalate only when needed:

1. **`web_search`** — Quick lookup, no special options needed.
2. **`xapi_search` with `type: "web"`** — Need locale/language override or location filtering.
3. **`xapi_search` with specific type** — Need a search vertical (news, image, scholar, etc.).
