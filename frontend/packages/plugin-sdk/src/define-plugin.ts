import type { PluginManifest, PluginContext, PluginHandle } from './types';

export interface PluginDefinition extends PluginManifest {
  activate?: (ctx: PluginContext) => Promise<PluginHandle>;
}

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}
