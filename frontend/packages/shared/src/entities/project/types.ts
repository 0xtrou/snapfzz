export type ProjectStatus = 'clarifying' | 'discovering' | 'rating' | 'building' | 'shipping' | 'shipped' | 'paused';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
  deployUrl?: string;
  revenue?: number;
  healthStatus?: 'healthy' | 'degraded' | 'down';
  healthLatencyMs?: number;
  qualityScore?: string;
}

export interface ProjectConfig {
  version: number;
  name: string;
  description: string;
  createdAt: string;
  stage: ProjectStatus;
  source?: {
    type: 'oss' | 'scratch' | 'template';
    repo?: string;
    commit?: string;
    score?: number;
  };
  models: Record<string, string>;
  deploy?: {
    provider: string;
    url: string;
    repo: string;
  };
  payments?: {
    provider: string;
    products: number;
    mode: 'test' | 'live';
  };
  quality?: {
    lastScore: string;
    lastCheck: string;
  };
}
