export type AgentStatus = 'active' | 'working' | 'queued' | 'idle' | 'blocked' | 'error';

export interface Agent {
  id: string;
  name: string;
  icon: string;
  status: AgentStatus;
  statusMessage: string;
  model: string;
  tokensUsed: number;
  boxId?: string;
  port?: number;
}

export interface AgentMessage {
  id: string;
  agentId: string;
  role: 'agent' | 'user' | 'system';
  content: string;
  timestamp: string;
  attachments?: string[];
}

export interface AgentNetworkMessage {
  id: string;
  timestamp: string;
  fromAgent: string;
  toAgent?: string;
  content: string;
  type: 'message' | 'approval' | 'status' | 'error';
  attachments?: string[];
  approved?: boolean;
}
