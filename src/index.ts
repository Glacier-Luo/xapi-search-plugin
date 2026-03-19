import { createXapiClient } from "./lib/xapi-client.js";
import { registerXapiWebSearch } from "./providers/web-search.js";
import type { PluginApi } from "./types.js";

// NOTE: OpenClawPluginDefinition type comes from "openclaw/plugin-sdk".
// Using inline type until the actual SDK is available as a dependency.

const plugin = {
  id: "xapi",
  name: "xapi.to",

  register(api: PluginApi) {
    const apiKey = api.config.apiKey ?? process.env.XAPI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "xapi.to API Key is required. Set XAPI_API_KEY env var or configure apiKey in openclaw.json.",
      );
    }

    const client = createXapiClient({ apiKey });
    registerXapiWebSearch(api, client);
  },
};

export default plugin;
