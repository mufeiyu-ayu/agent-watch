export type AgentKind = 'claude' | 'codex';

export interface HookPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  last_assistant_message?: string | null;
  background_tasks?: unknown[];
  session_crons?: unknown[];
  [key: string]: unknown;
}

export interface NormalizedNotification {
  agent: AgentKind;
  project: string;
  event: string;
  summary?: string;
}

export interface PushoverConfig {
  appToken: string;
  userKey: string;
  device?: string;
  sound?: string;
}

export interface AgentWatchConfig {
  provider: 'pushover';
  includeSummary: boolean;
  summaryMaxChars: number;
  pushover: PushoverConfig;
}
