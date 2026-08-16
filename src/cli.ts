#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { createPushoverConfig, getConfigPath, loadConfig, saveConfig } from './config.js';
import { readStdin } from './io.js';
import { normalizeHook, shouldNotifyStop } from './normalize.js';
import { notify } from './notify.js';
import { setupAgent } from './setup.js';
import type { AgentKind, HookPayload } from './types.js';

const VERSION = '0.1.0';

function usage(): string {
  return `agent-watch ${VERSION}

Usage:
  agent-watch configure pushover --user <USER_KEY> --token <APP_TOKEN> [options]
  agent-watch setup [all|claude|codex]
  agent-watch test
  agent-watch hook --agent <claude|codex>
  agent-watch config-path

Configure options:
  --device <name>           Target one Pushover device
  --sound <name>            Pushover sound name
  --include-summary         Include a truncated final assistant message (off by default)
  --summary-max <chars>     Maximum summary length (default: 180)

Notes:
  - Hook mode is designed to be non-blocking: notification failures never fail Claude/Codex.
  - Pushover credentials are stored in a user-only (0600) config file.
`;
}

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseAgent(value: string | undefined): AgentKind {
  if (value === 'claude' || value === 'codex') return value;
  throw new Error('Expected --agent claude or --agent codex.');
}

async function configure(args: string[]): Promise<void> {
  const provider = args[0];
  if (provider !== 'pushover') throw new Error('Only the pushover provider is supported in v0.1.0.');

  const userKey = getFlag(args, '--user') ?? process.env.PUSHOVER_USER_KEY;
  const appToken = getFlag(args, '--token') ?? process.env.PUSHOVER_APP_TOKEN;
  if (!userKey || !appToken) {
    throw new Error('Missing Pushover credentials. Pass --user/--token or set PUSHOVER_USER_KEY/PUSHOVER_APP_TOKEN.');
  }

  const summaryMaxRaw = getFlag(args, '--summary-max');
  const summaryMaxChars = summaryMaxRaw ? Number.parseInt(summaryMaxRaw, 10) : undefined;
  if (summaryMaxChars !== undefined && (!Number.isFinite(summaryMaxChars) || summaryMaxChars < 20 || summaryMaxChars > 1000)) {
    throw new Error('--summary-max must be an integer between 20 and 1000.');
  }

  const device = getFlag(args, '--device');
  const sound = getFlag(args, '--sound');
  const config = createPushoverConfig({
    userKey,
    appToken,
    ...(device ? { device } : {}),
    ...(sound ? { sound } : {}),
    includeSummary: hasFlag(args, '--include-summary'),
    ...(summaryMaxChars !== undefined ? { summaryMaxChars } : {})
  });

  const path = await saveConfig(config);
  console.log(`Saved configuration to ${path}`);
}

async function runSetup(args: string[]): Promise<void> {
  const target = args[0] ?? 'all';
  if (!['all', 'claude', 'codex'].includes(target)) {
    throw new Error('setup target must be all, claude, or codex.');
  }

  const executablePath = fileURLToPath(import.meta.url);
  const agents: AgentKind[] = target === 'all' ? ['claude', 'codex'] : [target as AgentKind];

  for (const agent of agents) {
    const result = await setupAgent(agent, executablePath);
    if (result.changed) {
      console.log(`Configured ${agent} Stop hook in ${result.path}`);
      if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
    } else {
      console.log(`${agent} Stop hook already configured in ${result.path}`);
    }
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  }

  if (agents.includes('codex')) {
    console.log('Codex: open /hooks once and trust the new non-managed hook if prompted.');
  }
}

async function runHook(args: string[]): Promise<void> {
  try {
    const agent = parseAgent(getFlag(args, '--agent'));
    const raw = await readStdin();
    const payload = raw.trim() ? JSON.parse(raw) as HookPayload : {};
    if (!shouldNotifyStop(agent, payload)) return;
    const config = await loadConfig();
    const normalized = normalizeHook(agent, payload, {
      includeSummary: config.includeSummary,
      summaryMaxChars: config.summaryMaxChars
    });
    await notify(config, normalized);
  } catch (error) {
    // Lifecycle notifications must never block or alter the agent's decision path.
    console.error(`[agent-watch] ${(error as Error).message}`);
  }
}

async function runTest(): Promise<void> {
  const config = await loadConfig();
  await notify(config, {
    agent: 'codex',
    project: 'agent-watch',
    event: 'Stop',
    ...(config.includeSummary ? { summary: 'Test notification from Agent Watch.' } : {})
  });
  console.log('Test notification sent.');
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'configure':
      await configure(args);
      break;
    case 'setup':
      await runSetup(args);
      break;
    case 'test':
      await runTest();
      break;
    case 'hook':
      await runHook(args);
      break;
    case 'config-path':
      console.log(getConfigPath());
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;
    case '--help':
    case '-h':
    case undefined:
      console.log(usage());
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}

main().catch((error) => {
  console.error(`agent-watch: ${(error as Error).message}`);
  process.exitCode = 1;
});
