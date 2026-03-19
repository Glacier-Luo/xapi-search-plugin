import { createXapiClient } from "./lib/xapi-client.js";
import { registerXapiWebSearch } from "./providers/web-search.js";
import type { PluginApi } from "./types.js";

// NOTE: OpenClawPluginDefinition type comes from "openclaw/plugin-sdk".
// Using inline type until the actual SDK is available as a dependency.

function resolveApiKey(api: PluginApi): string | undefined {
  return api.config.apiKey ?? process.env.XAPI_API_KEY;
}

const plugin = {
  id: "xapi-search",
  name: "xapi.to Web Search",

  register(api: PluginApi) {
    // Defer API key validation to search-time.
    // This allows the plugin to load as "installed but not configured"
    // instead of crashing the entire plugin at register() time.
    registerXapiWebSearch(api, () => {
      const apiKey = resolveApiKey(api);
      if (!apiKey) {
        throw new Error(
          "xapi.to API Key is required. Set XAPI_API_KEY env var or configure apiKey in openclaw.json.",
        );
      }
      return createXapiClient({ apiKey });
    });
  },
};

export default plugin;
