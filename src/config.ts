import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentWatchConfig } from './types.js';

const DEFAULT_SUMMARY_MAX_CHARS = 180;

export function getConfigPath(): string {
  if (process.env.AGENT_WATCH_CONFIG) return process.env.AGENT_WATCH_CONFIG;
  const configRoot = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(configRoot, 'agent-watch', 'config.json');
}

export async function loadConfig(): Promise<AgentWatchConfig> {
  const path = getConfigPath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Agent Watch is not configured. Run: agent-watch configure pushover --user <USER_KEY> --token <APP_TOKEN>`);
    }
    throw error;
  }

  const parsed = JSON.parse(raw) as Partial<AgentWatchConfig>;
  if (parsed.provider !== 'pushover') throw new Error('Unsupported or missing provider in config.');
  if (!parsed.pushover?.appToken || !parsed.pushover.userKey) {
    throw new Error('Pushover appToken/userKey are missing in config.');
  }

  return {
    provider: 'pushover',
    includeSummary: parsed.includeSummary ?? false,
    summaryMaxChars: parsed.summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS,
    pushover: {
      appToken: parsed.pushover.appToken,
      userKey: parsed.pushover.userKey,
      ...(parsed.pushover.device ? { device: parsed.pushover.device } : {}),
      ...(parsed.pushover.sound ? { sound: parsed.pushover.sound } : {})
    }
  };
}

export async function saveConfig(config: AgentWatchConfig): Promise<string> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

export function createPushoverConfig(input: {
  appToken: string;
  userKey: string;
  device?: string;
  sound?: string;
  includeSummary?: boolean;
  summaryMaxChars?: number;
}): AgentWatchConfig {
  return {
    provider: 'pushover',
    includeSummary: input.includeSummary ?? false,
    summaryMaxChars: input.summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS,
    pushover: {
      appToken: input.appToken,
      userKey: input.userKey,
      ...(input.device ? { device: input.device } : {}),
      ...(input.sound ? { sound: input.sound } : {})
    }
  };
}
