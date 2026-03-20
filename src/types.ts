// --- Shared plugin types ---
// Inline types until the actual OpenClaw plugin-sdk is available as a dependency.

export interface PluginConfig {
  readonly apiKey?: string;
  readonly locale?: string;
  readonly language?: string;
}

// --- Search result ---

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

// --- Web Search Provider types (OpenClaw >= 2026.3.7) ---

export interface WebSearchProvider {
  readonly id: string;
  search(args: {
    readonly query: string;
    readonly count?: number;
  }): Promise<readonly SearchResult[]>;
}

// --- Tool registration types (OpenClaw >= 2026.3.2) ---

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

// --- Chat Command types (OpenClaw >= 2026.3.2) ---

export interface CommandContext {
  readonly senderId: string;
  readonly channel: unknown;
  readonly isAuthorizedSender: boolean;
  readonly args: string;
  readonly commandBody: string;
  readonly config: Record<string, unknown>;
}

export interface CommandDefinition {
  readonly name: string;
  readonly description: string;
  readonly acceptsArgs?: boolean;
  readonly requireAuth?: boolean;
  readonly handler: (ctx: CommandContext) => { text: string } | Promise<{ text: string }>;
}

// --- CLI Command types (OpenClaw >= 2026.3.2) ---

export interface CliSetupContext {
  readonly program: {
    command(name: string): CliCommand;
  };
}

export interface CliCommand {
  description(desc: string): CliCommand;
  argument(name: string, desc?: string): CliCommand;
  option(flags: string, desc?: string, defaultValue?: unknown): CliCommand;
  action(fn: (...args: unknown[]) => void | Promise<void>): CliCommand;
  command(name: string): CliCommand;
}

// --- Plugin API (supports all registration paths) ---

export interface PluginApi {
  readonly config: PluginConfig;
  registerWebSearchProvider?(provider: WebSearchProvider): void;
  registerTool?(tool: ToolDefinition): void;
  registerCommand?(command: CommandDefinition): void;
  registerCli?(setup: (ctx: CliSetupContext) => void, options: { commands: string[] }): void;
}
