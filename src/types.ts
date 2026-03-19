// --- Shared plugin types ---
// Inline types until the actual OpenClaw plugin-sdk is available as a dependency.

export interface PluginConfig {
  readonly apiKey?: string;
  readonly locale?: string;
  readonly language?: string;
}

export interface PluginApi {
  readonly config: PluginConfig;
  registerWebSearchProvider(provider: unknown): void;
}
