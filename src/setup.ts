import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentKind } from './types.js';

interface HookHandler {
  type?: string;
  command?: string;
  timeout?: number;
  async?: boolean;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookHandler[];
  [key: string]: unknown;
}

interface HookDocument {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

export interface SetupResult {
  agent: AgentKind;
  path: string;
  changed: boolean;
  backupPath?: string;
  warnings: string[];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildHookCommand(agent: AgentKind, executablePath: string): string {
  return `${shellQuote(process.execPath)} ${shellQuote(executablePath)} hook --agent ${agent}`;
}

function isAgentWatchHandler(handler: HookHandler, agent: AgentKind): boolean {
  return typeof handler.command === 'string'
    && handler.command.includes('agent-watch')
    && handler.command.includes(`hook --agent ${agent}`);
}

function appendStopHook(document: HookDocument, agent: AgentKind, command: string): boolean {
  document.hooks ??= {};
  const groups = document.hooks.Stop ?? (document.hooks.Stop = []);

  const alreadyExists = groups.some((group) =>
    Array.isArray(group.hooks) && group.hooks.some((handler) => isAgentWatchHandler(handler, agent))
  );
  if (alreadyExists) return false;

  groups.push({
    hooks: [
      {
        type: 'command',
        command,
        timeout: 10,
        async: true
      }
    ]
  });
  return true;
}

async function readJson(path: string): Promise<{ document: HookDocument; exists: boolean }> {
  try {
    const raw = await readFile(path, 'utf8');
    return { document: JSON.parse(raw) as HookDocument, exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { document: {}, exists: false };
    throw error;
  }
}

async function writeJsonWithBackup(path: string, document: HookDocument, exists: boolean): Promise<string | undefined> {
  await mkdir(dirname(path), { recursive: true });
  let backupPath: string | undefined;
  if (exists) {
    backupPath = `${path}.agent-watch.bak`;
    await copyFile(path, backupPath);
  }
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return backupPath;
}

export async function setupAgent(agent: AgentKind, executablePath: string): Promise<SetupResult> {
  const warnings: string[] = [];
  const path = agent === 'codex'
    ? join(homedir(), '.codex', 'hooks.json')
    : join(homedir(), '.claude', 'settings.json');

  if (agent === 'codex') {
    const tomlPath = join(homedir(), '.codex', 'config.toml');
    try {
      const toml = await readFile(tomlPath, 'utf8');
      if (/^\s*\[\[?hooks(?:\.|\])?/m.test(toml)) {
        warnings.push('~/.codex/config.toml appears to contain inline hooks. Codex will merge them with hooks.json and may warn about using both representations in one config layer.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const { document, exists } = await readJson(path);
  const command = buildHookCommand(agent, executablePath);
  const changed = appendStopHook(document, agent, command);
  if (!changed) return { agent, path, changed: false, warnings };

  const backupPath = await writeJsonWithBackup(path, document, exists);
  return {
    agent,
    path,
    changed: true,
    warnings,
    ...(backupPath ? { backupPath } : {})
  };
}

export function addStopHookForTest(document: HookDocument, agent: AgentKind, command: string): boolean {
  return appendStopHook(document, agent, command);
}
