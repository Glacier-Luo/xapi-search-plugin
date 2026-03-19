// --- Shared plugin types ---
// Inline types until the actual OpenClaw plugin-sdk is available as a dependency.

export interface PluginConfig {
  readonly apiKey?: string;
  readonly locale?: string;
  readonly language?: string;
}

// --- Tool registration types (matches OpenClaw 2026.3.2 runtime) ---

export interface ToolContentBlock {
  readonly type: "text";
  readonly text: string;
}

export interface ToolResult {
  readonly content: readonly ToolContentBlock[];
  readonly isError?: boolean;
}

export interface ToolDefinition {
  readonly name: string;
  readonly label?: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly execute: (
    toolCallId: string,
    params: Record<string, unknown>,
  ) => Promise<ToolResult>;
}

export interface RegisterToolOptions {
  readonly optional?: boolean;
}

export interface PluginApi {
  readonly config: PluginConfig;
  registerTool(tool: ToolDefinition, options?: RegisterToolOptions): void;
}
