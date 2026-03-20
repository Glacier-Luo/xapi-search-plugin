// NOTE: When openclaw/plugin-sdk is available as a dependency, replace with:
//   import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { definePluginEntry } from "./types.js";
import type { CommandContext } from "./types.js";
import {
  createXapiWebSearchProvider,
  resolveXapiApiKey,
  resolveSearchCount,
  runXapiSearch,
  DEFAULT_LOCALE,
  DEFAULT_LANGUAGE,
  DEFAULT_SEARCH_COUNT,
  DEFAULT_TIMEOUT_SECONDS,
} from "./providers/xapi-web-search-provider.js";

export default definePluginEntry({
  id: "xapi-search",
  name: "xapi.to Web Search",
  description: "Web search provider powered by xapi.to unified API",

  register(api) {
    // Path 1: Web Search Provider (the primary integration point)
    if (typeof api.registerWebSearchProvider === "function") {
      api.registerWebSearchProvider(createXapiWebSearchProvider());
    }

    // --- Shared helpers for command/CLI paths ---
    // Read webSearch sub-config from plugin config (matches manifest's configSchema)
    const webSearchConfig = api.config.webSearch;
    const pluginXapiConfig = webSearchConfig && typeof webSearchConfig === "object" && !Array.isArray(webSearchConfig)
      ? (webSearchConfig as Record<string, unknown>)
      : {};
    const locale = (pluginXapiConfig.locale as string | undefined) ?? DEFAULT_LOCALE;
    const language = (pluginXapiConfig.language as string | undefined) ?? DEFAULT_LANGUAGE;

    // Path 2: Chat Command (/search <query>) — complementary, bypasses LLM
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

          const auth = resolveXapiApiKey(pluginXapiConfig);
          if (!auth.apiKey) {
            return { text: "xapi.to API Key is required. Set XAPI_API_KEY env var or configure webSearch.apiKey." };
          }

          try {
            const results = await runXapiSearch({
              query,
              apiKey: auth.apiKey,
              count: DEFAULT_SEARCH_COUNT,
              locale,
              language,
              timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
            });

            if (results.length === 0) {
              return { text: `No results found for "${query}".` };
            }
            const lines = results.map(
              (r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`,
            );
            return { text: `Search results for "${query}":\n\n${lines.join("\n\n")}` };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { text: `Search failed: ${message}` };
          }
        },
      });
    }

    // Path 3: CLI Command (openclaw xapi-search ...)
    if (typeof api.registerCli === "function") {
      api.registerCli(
        ({ program }) => {
          const cmd = program.command("xapi-search").description("xapi.to web search commands");

          cmd.command("search")
            .description("Search the web from the command line")
            .argument("<query>", "Search query")
            .option("-n, --count <number>", "Number of results", String(DEFAULT_SEARCH_COUNT))
            .action(async (query: unknown, opts: unknown) => {
              const auth = resolveXapiApiKey(pluginXapiConfig);
              if (!auth.apiKey) {
                console.error("xapi.to API Key is required. Set XAPI_API_KEY env var or configure webSearch.apiKey.");
                process.exitCode = 1;
                return;
              }

              try {
                const count = resolveSearchCount((opts as Record<string, unknown>)?.count, DEFAULT_SEARCH_COUNT);
                const results = await runXapiSearch({
                  query: String(query),
                  apiKey: auth.apiKey,
                  count,
                  locale,
                  language,
                  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
                });

                if (results.length === 0) {
                  console.log(`No results found for "${query}".`);
                  return;
                }
                for (const [i, r] of results.entries()) {
                  console.log(`${i + 1}. ${r.title}`);
                  console.log(`   ${r.url}`);
                  console.log(`   ${r.description}\n`);
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Search failed: ${message}`);
                process.exitCode = 1;
              }
            });

          cmd.command("status")
            .description("Check xapi.to connectivity")
            .action(async () => {
              const auth = resolveXapiApiKey(pluginXapiConfig);
              if (!auth.apiKey) {
                console.error("xapi.to API Key is required. Set XAPI_API_KEY env var or configure webSearch.apiKey.");
                process.exitCode = 1;
                return;
              }

              try {
                const results = await runXapiSearch({
                  query: "test",
                  apiKey: auth.apiKey,
                  count: 1,
                  locale,
                  language,
                  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
                });
                console.log(results.length > 0
                  ? "xapi.to web search: connected"
                  : "xapi.to web search: no results returned");
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`xapi.to web search: unreachable — ${message}`);
                process.exitCode = 1;
              }
            });
        },
        { commands: ["xapi-search"] },
      );
    }
  },
});
