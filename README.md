# xapi.to Web Search Plugin for OpenClaw

Web search provider plugin powered by [xapi.to](https://xapi.to) unified API. Implements `WebSearchProviderPlugin` interface to integrate as a first-class web search provider in OpenClaw.

## Architecture

This plugin follows the same pattern as OpenClaw's bundled providers (e.g. Perplexity):

```
definePluginEntry → register(api) → api.registerWebSearchProvider(createXapiWebSearchProvider())
```

The provider factory `createXapiWebSearchProvider()` returns a `WebSearchProviderPlugin` with:

- Credential resolution (config + `XAPI_API_KEY` env var)
- `createTool()` factory — OpenClaw calls this to create the web search tool
- Structured result payload (query, provider, count, tookMs, externalContent, results)

Additionally, the plugin registers chat command (`/search`) and CLI commands as complementary paths.

## Installation

```bash
npm install @xapi/xapi-search
```

Or add to `openclaw.json`:

```json
{
  "plugins": ["@xapi/xapi-search"]
}
```

## Configuration

### API Key (required)

Set via environment variable (recommended):

```bash
export XAPI_API_KEY="sk-..."
```

Or configure in `openclaw.json`:

```json
{
  "plugins": {
    "@xapi/xapi-search": {
      "config": {
        "webSearch": {
          "apiKey": "sk-..."
        }
      }
    }
  }
}
```

### Optional Settings

Configure under `webSearch`:

| Setting    | Description                  | Default |
|------------|------------------------------|---------|
| `locale`   | Search country code          | `"us"`  |
| `language` | Search language code         | `"en"`  |

## Integration Paths

### Primary: Web Search Provider

Implements `WebSearchProviderPlugin` — the same interface used by Perplexity and other bundled providers. When registered, OpenClaw routes all `web_search` tool calls through xapi.to.

The provider's `createTool()` returns a `WebSearchProviderToolDefinition` whose `execute()` returns structured payloads:

```typescript
{
  query: "TypeScript generics",
  provider: "xapi",
  count: 5,
  tookMs: 230,
  externalContent: { untrusted: true, source: "web_search", provider: "xapi" },
  results: [
    { title: "...", url: "...", description: "...", siteName: "...", published: "..." }
  ]
}
```

### Complementary: Chat Command `/search`

Slash command that bypasses LLM and returns search results directly:

```
/search TypeScript 5.8 release date
```

### Complementary: CLI Commands

```bash
openclaw xapi-search search "TypeScript generics" -n 5
openclaw xapi-search status
```

## Project Structure

```
xapi-search-plugin/
  index.ts                                     # Root entry (re-export)
  openclaw.plugin.json                         # Plugin manifest
  src/
    index.ts                                   # definePluginEntry + command/CLI registration
    types.ts                                   # SDK types (inline until SDK available)
    lib/
      xapi-client.ts                           # HTTP client for xapi.to
      xapi-client.test.ts                      # Client tests
    providers/
      xapi-web-search-provider.ts              # Provider factory (core)
      xapi-web-search-provider.test.ts         # Provider tests
```

## Development

```bash
npm install
npm test            # Run all tests (71 tests)
npm run test:watch  # Watch mode
npm run build       # TypeScript compilation

# Smoke test (requires real API key)
XAPI_API_KEY=sk-xxx SMOKE=1 npx vitest run src/smoke.test.ts
```

## SDK Migration

When `openclaw/plugin-sdk` is published:

1. Replace inline types in `src/types.ts` with SDK imports:
   ```typescript
   import { definePluginEntry } from "openclaw/plugin-sdk/core";
   import type { WebSearchProviderPlugin } from "openclaw/plugin-sdk/provider-web-search";
   ```

2. Replace custom HTTP client with SDK utilities:
   ```typescript
   import { withTrustedWebSearchEndpoint, wrapWebContent } from "openclaw/plugin-sdk/provider-web-search";
   ```

3. Add caching via SDK:
   ```typescript
   import { buildSearchCacheKey, readCachedSearchPayload, writeCachedSearchPayload } from "openclaw/plugin-sdk/provider-web-search";
   ```

## License

MIT
