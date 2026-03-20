// --- SDK types (inline until openclaw/plugin-sdk is available as a dependency) ---
// These types mirror the real SDK interfaces from openclaw/plugin-sdk/provider-web-search.
// When the SDK is published, replace these with:
//   import type { WebSearchProviderPlugin, ... } from "openclaw/plugin-sdk/provider-web-search";

// --- Credential resolution ---

export type WebSearchCredentialResolutionSource =
  | "config"
  | "secretRef"
  | "env"
  | "missing";

// --- Search config ---

export type SearchConfigRecord = Record<string, unknown>;

// --- Provider runtime metadata context ---

export interface RuntimeMetadataContext {
  readonly searchConfig?: SearchConfigRecord;
  readonly config?: Record<string, unknown>;
  readonly resolvedCredential?: {
    readonly value?: string;
    readonly source: WebSearchCredentialResolutionSource;
    readonly fallbackEnvVar?: string;
  };
}

// --- Tool creation context ---

export interface ToolCreationContext {
  readonly searchConfig?: SearchConfigRecord;
  readonly config?: Record<string, unknown>;
  readonly runtimeMetadata?: Record<string, unknown>;
}

// --- Provider tool definition ---

export interface WebSearchProviderToolDefinition {
  readonly description: string;
  readonly parameters: unknown;
  readonly execute: (args: unknown) => Promise<Record<string, unknown>>;
}

// --- Web Search Provider Plugin (the core interface) ---

export interface WebSearchProviderPlugin {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly envVars: readonly string[];
  readonly placeholder: string;
  readonly signupUrl: string;
  readonly docsUrl: string;
  readonly autoDetectOrder: number;
  readonly credentialPath: string;
  readonly inactiveSecretPaths?: readonly string[];
  readonly getCredentialValue: (searchConfig?: SearchConfigRecord) => string | undefined;
  readonly setCredentialValue: (searchConfigTarget: SearchConfigRecord, value: string) => void;
  readonly getConfiguredCredentialValue: (config: Record<string, unknown>) => string | undefined;
  readonly setConfiguredCredentialValue: (configTarget: Record<string, unknown>, value: string) => void;
  readonly resolveRuntimeMetadata: (ctx: RuntimeMetadataContext) => Record<string, unknown>;
  readonly createTool: (ctx: ToolCreationContext) => WebSearchProviderToolDefinition;
}

// --- Plugin entry ---

export interface PluginEntryDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly register: (api: PluginApi) => void;
}

// --- Plugin API ---

export interface PluginApi {
  readonly config: Record<string, unknown>;
  registerWebSearchProvider?(provider: WebSearchProviderPlugin): void;
  registerCommand?(command: CommandDefinition): void;
  registerCli?(setup: (ctx: CliSetupContext) => void, options: { commands: string[] }): void;
}

// --- Chat Command types ---

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

// --- CLI Command types ---

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

// --- definePluginEntry (inline until SDK is available) ---

export function definePluginEntry(definition: PluginEntryDefinition): PluginEntryDefinition {
  return definition;
}
