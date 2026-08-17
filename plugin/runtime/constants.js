export const VERSION = '0.2.0';
export const CONFIG_VERSION = 1;
export const STATE_VERSION = 1;
export const PROVIDER = 'dingtalk';

export const TEMPLATE_PRESETS = Object.freeze({
  compact: ['title', 'project', 'time'],
  standard: ['title', 'agent', 'project', 'status', 'time', 'duration'],
  detailed: ['title', 'agent', 'project', 'status', 'model', 'time', 'duration', 'summary']
});

export const TEMPLATE_FIELDS = Object.freeze([
  'title',
  'agent',
  'project',
  'status',
  'time',
  'duration',
  'model',
  'summary'
]);

export const DEFAULT_NOTIFICATION = Object.freeze({
  preset: 'standard',
  fields: [...TEMPLATE_PRESETS.standard],
  titleTemplate: '{keyword} · {agent} {status}',
  timezone: 'Asia/Shanghai',
  includeSummary: false,
  summaryMaxChars: 180
});

export const DEFAULT_STATE = Object.freeze({
  version: STATE_VERSION,
  enabled: true,
  mutedUntil: null,
  sessions: {}
});

export const MANAGED_MARKER = '--agent-watch-managed';
export const SUPPORTED_HOSTS = Object.freeze(['claude', 'codex']);
export const SUPPORTED_EVENTS = Object.freeze(['SessionStart', 'UserPromptSubmit', 'Stop']);
