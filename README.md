# xapi.to Web Search Plugin for OpenClaw

Web search provider plugin powered by [xapi.to](https://xapi.to) unified API. Provides four integration paths with OpenClaw, supporting runtime feature detection for maximum compatibility.

## Installation

```bash
# In your OpenClaw project
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
      "apiKey": "sk-..."
    }
  }
}
```

> API key validation is deferred to search-time. The plugin loads as "installed but not configured" until the first search call, avoiding startup crashes.

### Optional Settings

| Setting    | Description                        | Default |
|------------|------------------------------------|---------|
| `locale`   | Search locale / country code       | `"us"`  |
| `language` | Search language code               | `"en"`  |

Examples: `locale: "cn"`, `language: "zh-cn"` for Chinese results.

## Four Integration Paths

The plugin uses runtime feature detection (`typeof api.registerXxx === "function"`) to register all available paths. This ensures forward and backward compatibility across OpenClaw versions.

### Path 1: Web Search Provider (OpenClaw >= 2026.3.7)

Replaces OpenClaw's built-in `web_search` with xapi.to. When registered, all LLM web search requests are automatically routed through xapi.to.

No user action needed — works transparently once the plugin is installed.

### Path 2: Standalone Tool `xapi_web_search` (OpenClaw >= 2026.3.2)

Registers an independent tool that LLM can invoke directly. Useful as a fallback on older OpenClaw versions, or when you want both the built-in provider and a separate xapi.to tool.

LLM usage example:

```
I'll search for the latest TypeScript release notes using xapi_web_search.
```

Tool parameters:

| Parameter | Type     | Required | Description                   |
|-----------|----------|----------|-------------------------------|
| `query`   | `string` | Yes      | The search query to execute   |
| `count`   | `number` | No       | Number of results (1-20, default 10) |

### Path 3: Chat Command `/search` (OpenClaw >= 2026.3.2)

Slash command that bypasses LLM and returns search results directly to the chat.

```
/search TypeScript 5.8 release date
```

Output:

```
Search results for "TypeScript 5.8 release date":

1. **Announcing TypeScript 5.8**
   https://devblogs.microsoft.com/typescript/...
   TypeScript 5.8 was released on February 28, 2025...

2. **TypeScript 5.8 Release Notes**
   https://www.typescriptlang.org/docs/...
   ...
```

### Path 4: CLI Commands (OpenClaw >= 2026.3.2)

Terminal subcommands for command-line usage.

**Search from terminal:**

```bash
openclaw xapi-search search "TypeScript generics"
openclaw xapi-search search "Node.js performance" -n 5
```

**Check connectivity:**

```bash
openclaw xapi-search status
```

## Search Results

All paths return results in the same format:

```typescript
interface SearchResult {
  title: string;   // Page title
  url: string;     // Page URL
  snippet: string; // Text excerpt
}
```

Results are assembled from:
- **Knowledge Graph** (if available) — inserted as the first result for direct answers
- **Organic results** — mapped one-to-one from the search engine response

## Project Structure

```
xapi-search-plugin/
  index.ts                    # Root entry point (re-exports src/index)
  openclaw.plugin.json        # Plugin manifest with capabilities
  src/
    index.ts                  # Plugin registration and API key resolution
    types.ts                  # Shared TypeScript interfaces
    lib/
      xapi-client.ts          # HTTP client for xapi.to unified action API
      xapi-client.test.ts     # Client unit tests
    providers/
      web-search.ts           # Search logic + 4-path registration
      web-search.test.ts      # Unit tests (transformResults, etc.)
      web-search.integration.test.ts  # Integration tests (all paths)
```

## Development

```bash
npm test          # Run all tests
npm run test:watch # Watch mode
npm run build     # TypeScript compilation
```

## License

MIT
