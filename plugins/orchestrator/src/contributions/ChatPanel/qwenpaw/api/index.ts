// Ported from qwenpaw/console/src/api/index.ts — adapted for Snapfzz plugin context.
// SURGICAL EDIT: Only exports the APIs actually used by ChatPage + sessionApi.
// Removed all modules not copied into this port (root, channel, heartbeat, cronJob,
// env, skill, agent, agents, workspace, localModel, mcp, tokenUsage, tools, security,
// userTimezone, language).

export * from "./types";

export { request } from "./request";

export { getApiUrl, getApiToken } from "./config";

import { chatApi, sessionApi as sessionModuleApi } from "./modules/chat";
import { providerApi } from "./modules/provider";

export const api = {
  // Chats
  ...chatApi,
  // Sessions (legacy aliases — same endpoints)
  ...sessionModuleApi,
  // Providers
  ...providerApi,
};

export default api;

export { providerApi };
