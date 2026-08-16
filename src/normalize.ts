import { basename } from 'node:path';
import type { AgentKind, HookPayload, NormalizedNotification } from './types.js';

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return '…'.slice(0, maxChars);
  return `${value.slice(0, maxChars - 1)}…`;
}

export function normalizeHook(
  agent: AgentKind,
  payload: HookPayload,
  options: { includeSummary: boolean; summaryMaxChars: number }
): NormalizedNotification {
  const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd();
  const project = basename(cwd) || cwd;
  const event = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'Stop';

  const rawSummary = typeof payload.last_assistant_message === 'string'
    ? normalizeWhitespace(payload.last_assistant_message)
    : '';

  return {
    agent,
    project,
    event,
    ...(options.includeSummary && rawSummary
      ? { summary: truncate(rawSummary, options.summaryMaxChars) }
      : {})
  };
}

export function shouldNotifyStop(agent: AgentKind, payload: HookPayload): boolean {
  if (agent !== 'claude') return true;

  const backgroundTasks = Array.isArray(payload.background_tasks) ? payload.background_tasks : [];
  const sessionCrons = Array.isArray(payload.session_crons) ? payload.session_crons : [];

  // Claude Code can emit Stop while the foreground turn is paused but background
  // work is still scheduled. Do not tell the user the agent is finished yet.
  return backgroundTasks.length === 0 && sessionCrons.length === 0;
}

export function displayAgent(agent: AgentKind): string {
  return agent === 'claude' ? 'Claude Code' : 'Codex';
}
