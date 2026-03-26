# @xapi/xapi-search

Web search provider for [OpenClaw](https://github.com/nicepkg/openclaw) powered by the [xapi.to](https://xapi.to) unified API.

## Features

- **Web Search Provider** — registers as a `web_search` provider so the LLM can search the web automatically.
- **xapi_search Agent Tool** — standalone tool exposing 9 search verticals: web, realtime, image, news, video, scholar, places, maps, and shopping.
- **Chat Command** — `/search <query>` for quick searches that bypass the LLM.
- **CLI** — `openclaw xapi-search search <query>` and `openclaw xapi-search status` for terminal use.

## Installation

```bash
npm install @xapi/xapi-search
```

Enable the plugin in your OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "xapi-search": {
        "enabled": true
      }
    }
  }
}
```

## Configuration

### API Key (required)

Set via environment variable (recommended):

```bash
export XAPI_KEY="sk-..."
```

Or in your OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "xapi-search": {
        "enabled": true,
        "config": {
          "webSearch": {
            "apiKey": "sk-..."
          }
        }
      }
    }
  }
}
```

### Locale and Language (optional)

| Setting | Description | Default |
| --- | --- | --- |
| `webSearch.locale` | Country/locale code (e.g. `us`, `cn`, `jp`) | `us` |
| `webSearch.language` | Language code (e.g. `en`, `zh-cn`, `ja`) | `en` |

## Integration Paths

### Web Search Provider

Implements `WebSearchProviderPlugin` — the same interface used by bundled providers like Perplexity. When selected, OpenClaw routes all `web_search` tool calls through xapi.to.

### xapi_search Agent Tool

Standalone tool registered via `api.registerTool()`, exposing all 9 search verticals:

| Type | Best for |
| --- | --- |
| `web` | General-purpose queries |
| `realtime` | Breaking news, live events |
| `image` | Finding images |
| `news` | Current events, press coverage |
| `video` | Video content |
| `scholar` | Academic papers, citations |
| `places` | Local businesses |
| `maps` | Geographic location lookup |
| `shopping` | Product search, price comparison |

See [SKILL.md](skills/xapi-search/SKILL.md) for detailed usage guidance.

### Chat Command

```
/search TypeScript 5.8 release date
```

### CLI Commands

```bash
openclaw xapi-search search "TypeScript generics" -n 5
openclaw xapi-search status
```

## Project Structure

```
xapi-search-plugin/
  index.ts                                     # Root entry (re-export for jiti)
  openclaw.plugin.json                         # Plugin manifest
  skills/xapi-search/SKILL.md                  # LLM-facing usage documentation
  src/
    index.ts                                   # definePluginEntry + command/CLI registration
    lib/
      xapi-client.ts                           # HTTP client for xapi.to
      xapi-client.test.ts                      # Client tests
    providers/
      xapi-web-search-provider.ts              # Web search provider factory
      xapi-web-search-provider.test.ts         # Provider tests
    tools/
      xapi-search-tool.ts                      # Standalone agent tool (9 search types)
      xapi-search-tool.test.ts                 # Agent tool tests
```

## Development

```bash
npm install
npm test            # Run all tests (164 tests)
npm run test:watch  # Watch mode
npm run build       # TypeScript compilation
```

## License

MIT
