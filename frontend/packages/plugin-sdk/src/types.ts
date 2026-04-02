import type { ComponentType } from 'react';

export type HostSurface = 'launcher' | 'project';

export type ActivationEvent =
  | 'onStartupFinished'
  | `onViewVisible:${string}`
  | `onCommand:${string}`
  | `onEvent:${string}`
  | 'onWorkspaceOpened';

export interface Disposable {
  (): void;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  surface: HostSurface[];
  activationEvents: ActivationEvent[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  requiredCapabilities?: string[];
  contributes?: PluginContributions;
}

export interface PluginContributions {
  workspaceTabs?: TabContribution[];
  leftPanelTabs?: TabContribution[];
  bottomPanels?: PanelContribution[];
  statusItems?: StatusItemContribution[];
  commands?: CommandContribution[];
  shortcuts?: ShortcutContribution[];
  settings?: SettingsContribution[];
  genericComponents?: ComponentContribution[];
  agentSkills?: SkillContribution[];
  agentTools?: ToolContribution[];
  evalBenchmarks?: BenchmarkContribution[];
  evalGraders?: GraderContribution[];
  deployTargets?: DeployTargetContribution[];
  identityProviders?: IdentityProviderContribution[];
  complianceTemplates?: ComplianceTemplateContribution[];
  miniApps?: MiniAppContribution[];
}

export interface TabContribution {
  id: string;
  label: string;
  icon: string;
  component: () => Promise<{ default: ComponentType }>;
}

export interface PanelContribution {
  id: string;
  label: string;
  component: () => Promise<{ default: ComponentType }>;
  defaultCollapsed?: boolean;
}

export interface StatusItemContribution {
  id: string;
  position: 'left' | 'right';
  component: () => Promise<{ default: ComponentType }>;
}

export interface CommandContribution {
  id: string;
  title: string;
}

export interface ShortcutContribution {
  command: string;
  key: string;
}

export interface SettingsContribution {
  id: string;
  label: string;
  schema: Record<string, unknown>;
}

export interface ComponentContribution {
  id: string;
  name: string;
  component: () => Promise<{ default: ComponentType }>;
}

export interface SkillContribution {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  targetAgents: string[];
  knowledgeRefs?: string[];
}

export interface ToolContribution {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: () => Promise<{ default: ToolHandler }>;
  capabilities?: string[];
}

export type ToolHandler = (
  params: Record<string, unknown>,
  ctx: PluginContext,
) => Promise<unknown>;

export interface BenchmarkContribution {
  id: string;
  name: string;
  description: string;
  type: 'hard' | 'judge' | 'both';
  targetAgent: string;
  grader?: string;
  dataset: {
    source: 'inline' | 'url';
    cases?: Array<{ input: string; expectedScore?: number }>;
    url?: string;
  };
}

export interface GraderContribution {
  id: string;
  name: string;
  description: string;
  type: 'hard' | 'judge';
  model?: 'cheap' | 'expensive';
  judgePrompt?: string;
  outputSchema?: Record<string, unknown>;
  handler?: () => Promise<{ default: (input: unknown) => Promise<unknown> }>;
}

export interface DeployTargetContribution {
  id: string;
  name: string;
  icon: string;
  description: string;
  supportedFrameworks: string[];
  requiredIdentity?: string;
  configSchema: Record<string, unknown>;
  handlers: {
    deploy: () => Promise<{ default: ToolHandler }>;
    rollback?: () => Promise<{ default: ToolHandler }>;
    healthCheck?: () => Promise<{ default: ToolHandler }>;
    logs?: () => Promise<{ default: ToolHandler }>;
  };
}

export interface IdentityProviderContribution {
  id: string;
  name: string;
  icon: string;
  description?: string;
  authType: 'oauth' | 'api-key' | 'token';
  configSchema: Record<string, unknown>;
  testConnection: () => Promise<{ default: (config: unknown) => Promise<boolean> }>;
  provides: string[];
}

export interface ComplianceTemplateContribution {
  id: string;
  name: string;
  jurisdiction?: string;
  description?: string;
  areas: Array<{
    name: string;
    items: Array<{ label: string; link?: string }>;
  }>;
}

export interface MiniAppContribution {
  id: string;
  name: string;
  description?: string;
  targetTab: string;
  source: () => Promise<{ default: string }>;
  dataAccess?: string[];
}

export interface SnapfzzPlugin {
  manifest: PluginManifest;
  activate(ctx: PluginContext): Promise<PluginHandle>;
}

export interface PluginHandle {
  deactivate?(): Promise<void>;
}

export interface PluginContext {
  bus: EventBus;
  commands: CommandRegistry;
  registry: ContributionRegistry;
  settings: SettingsRegistry;
  storage: PluginStorage;
  apis: ApiBroker;
  rust: RustBridge;
  logger: Logger;
  surface: HostSurface;
  projectPath?: string;
}

export interface EventBus {
  emit(topic: string, payload: unknown): void;
  on(topic: string, handler: (payload: unknown) => void): Disposable;
}

export interface CommandRegistry {
  execute<T = unknown>(commandId: string, args?: unknown): Promise<T>;
  register(commandId: string, handler: (args?: unknown) => Promise<unknown>): Disposable;
}

export interface ContributionRegistry {
  registerTab(surface: 'workspace' | 'leftPanel', tab: TabContribution): Disposable;
  registerBottomPanel(panel: PanelContribution): Disposable;
  registerStatusItem(item: StatusItemContribution): Disposable;
  registerComponent(component: ComponentContribution): Disposable;
}

export interface SettingsRegistry {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  onChange(key: string, handler: (value: unknown) => void): Disposable;
}

export interface PluginStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ApiBroker {
  get<T>(token: string): T;
  provide<T>(token: string, impl: T): void;
}

export interface RustBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<Disposable>;
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}
