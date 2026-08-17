import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_MARKER, SUPPORTED_EVENTS } from './constants.js';
import { atomicWriteJson, pathExists, readJson, removePath } from './fs-store.js';
import {
  getClaudeCommandsPath,
  getClaudePluginPath,
  getClaudeSettingsPath,
  getClaudeSkillsPath,
  getCodexHooksPath,
  getCodexPluginPath,
  getCodexSkillsPath,
  getPersonalMarketplacePath
} from './paths.js';
import { shellQuote } from './util.js';

const SOURCE_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAMES = [
  'agent-watch',
  'agent-watch-on',
  'agent-watch-off',
  'agent-watch-mute',
  'agent-watch-unmute',
  'agent-watch-status',
  'agent-watch-test',
  'agent-watch-template'
];

function hookCommand(host, pluginRoot, event, nodePath = process.execPath) {
  return `${shellQuote(nodePath)} ${shellQuote(join(pluginRoot, 'runtime', 'hook.js'))} --host ${host} --event ${event} ${MANAGED_MARKER}`;
}

function hookGroup(host, pluginRoot, event) {
  return {
    hooks: [
      {
        type: 'command',
        command: hookCommand(host, pluginRoot, event),
        timeout: event === 'Stop' ? 15 : 5,
        statusMessage: event === 'Stop' ? 'Sending Agent Watch notification' : 'Tracking Agent Watch lifecycle'
      }
    ]
  };
}

function isManagedHook(hook) {
  return typeof hook?.command === 'string' && hook.command.includes(MANAGED_MARKER);
}

function stripManagedHooksFromGroups(groups) {
  const cleaned = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!Array.isArray(group?.hooks)) {
      cleaned.push(group);
      continue;
    }
    const hooks = group.hooks.filter((hook) => !isManagedHook(hook));
    if (hooks.length > 0) cleaned.push({ ...group, hooks });
  }
  return cleaned;
}

export function mergeManagedHooks(document, host, pluginRoot) {
  const next = document && typeof document === 'object' ? structuredClone(document) : {};
  next.hooks ??= {};
  for (const event of SUPPORTED_EVENTS) {
    const groups = stripManagedHooksFromGroups(next.hooks[event]);
    next.hooks[event] = [...groups, hookGroup(host, pluginRoot, event)];
  }
  return next;
}

export function removeManagedHooks(document) {
  const next = document && typeof document === 'object' ? structuredClone(document) : {};
  if (!next.hooks || typeof next.hooks !== 'object') return next;
  for (const [event, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) continue;
    const cleaned = stripManagedHooksFromGroups(groups);
    if (cleaned.length > 0) next.hooks[event] = cleaned;
    else delete next.hooks[event];
  }
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return next;
}

async function copyPlugin(target, host) {
  if (resolve(SOURCE_PLUGIN_ROOT) !== resolve(target)) {
    await removePath(target);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await cp(SOURCE_PLUGIN_ROOT, target, { recursive: true, force: true });
  }

  const hooksPath = join(target, 'hooks', 'hooks.json');
  const hooks = mergeManagedHooks({}, host, target);
  await atomicWriteJson(hooksPath, hooks, { mode: 0o644 });
  return target;
}

async function installUserHooks(path, host, pluginTarget) {
  const existing = await readJson(path, {});
  const merged = mergeManagedHooks(existing, host, pluginTarget);
  const write = await atomicWriteJson(path, merged, { mode: 0o600, backup: true });
  return { path, backupPath: write.backupPath };
}

function absoluteCliCommand(pluginTarget) {
  return `${shellQuote(process.execPath)} ${shellQuote(join(pluginTarget, 'bin', 'agent-watch'))}`;
}

function rewriteMarkdownCommand(markdown, command) {
  const firstFence = markdown.indexOf('---');
  const secondFence = firstFence === 0 ? markdown.indexOf('\n---', 3) : -1;
  if (secondFence === -1) return markdown.replaceAll('agent-watch', command);
  const bodyStart = secondFence + 4;
  return `${markdown.slice(0, bodyStart)}${markdown.slice(bodyStart).replaceAll('agent-watch', command)}`;
}

async function installSkills(root, pluginTarget) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const copied = [];
  const command = absoluteCliCommand(pluginTarget);
  for (const name of SKILL_NAMES) {
    const source = join(SOURCE_PLUGIN_ROOT, 'skills', name);
    const target = join(root, name);
    if (!await pathExists(source)) continue;
    await removePath(target);
    await cp(source, target, { recursive: true, force: true });
    const skillPath = join(target, 'SKILL.md');
    const rewritten = rewriteMarkdownCommand(await readFile(skillPath, 'utf8'), command);
    await writeFile(skillPath, rewritten, { encoding: 'utf8', mode: 0o600 });
    copied.push(target);
  }
  return copied;
}

async function installClaudeCommands(pluginTarget) {
  const root = getClaudeCommandsPath();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const command = absoluteCliCommand(pluginTarget);
  const copied = [];
  for (const name of ['on', 'off', 'mute', 'unmute', 'status', 'test', 'template']) {
    const source = join(SOURCE_PLUGIN_ROOT, 'commands', `${name}.md`);
    if (!await pathExists(source)) continue;
    const target = join(root, `agent-watch-${name}.md`);
    const rewritten = rewriteMarkdownCommand(await readFile(source, 'utf8'), command);
    await writeFile(target, rewritten, { encoding: 'utf8', mode: 0o600 });
    copied.push(target);
  }
  return copied;
}

async function updatePersonalMarketplace(pluginTarget) {
  const path = getPersonalMarketplacePath();
  const marketplace = await readJson(path, {
    name: 'personal-plugins',
    interface: { displayName: 'Personal Plugins' },
    plugins: []
  });
  marketplace.name ??= 'personal-plugins';
  marketplace.interface ??= { displayName: 'Personal Plugins' };
  marketplace.plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];

  let sourcePath;
  const relativeToHome = relative(homedir(), pluginTarget);
  if (relativeToHome && !relativeToHome.startsWith(`..${sep}`) && relativeToHome !== '..') {
    sourcePath = `./${relativeToHome.split(sep).join('/')}`;
  } else {
    // Absolute local paths are retained for non-standard/test installations.
    sourcePath = pluginTarget;
  }

  const entry = {
    name: 'agent-watch',
    source: { source: 'local', path: sourcePath },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Productivity'
  };
  marketplace.plugins = [...marketplace.plugins.filter((plugin) => plugin?.name !== 'agent-watch'), entry];
  const write = await atomicWriteJson(path, marketplace, { mode: 0o600, backup: true });
  return { path, backupPath: write.backupPath, sourcePath };
}

export async function installHost(host) {
  if (host === 'claude') {
    const pluginPath = await copyPlugin(getClaudePluginPath(), 'claude');
    const hooks = await installUserHooks(getClaudeSettingsPath(), 'claude', pluginPath);
    const skills = await installSkills(getClaudeSkillsPath(), pluginPath);
    const commands = await installClaudeCommands(pluginPath);
    return { host, pluginPath, hooks, skills, commands, mode: 'claude-plugin-assets-plus-user-hooks' };
  }
  if (host === 'codex') {
    const pluginPath = await copyPlugin(getCodexPluginPath(), 'codex');
    const hooks = await installUserHooks(getCodexHooksPath(), 'codex', pluginPath);
    const skills = await installSkills(getCodexSkillsPath(), pluginPath);
    const marketplace = await updatePersonalMarketplace(pluginPath);
    return { host, pluginPath, hooks, skills, marketplace, mode: 'codex-plugin-plus-user-hooks' };
  }
  throw new Error(`Unsupported host: ${host}`);
}

export async function installHosts(target = 'all') {
  const hosts = target === 'all' ? ['claude', 'codex'] : [target];
  const results = [];
  for (const host of hosts) results.push(await installHost(host));
  return results;
}

async function uninstallUserHooks(path) {
  if (!await pathExists(path)) return undefined;
  const existing = await readJson(path, {});
  const cleaned = removeManagedHooks(existing);
  const write = await atomicWriteJson(path, cleaned, { mode: 0o600, backup: true });
  return { path, backupPath: write.backupPath };
}

async function uninstallSkills(root) {
  for (const name of SKILL_NAMES) await removePath(join(root, name));
}

async function removePersonalMarketplaceEntry() {
  const path = getPersonalMarketplacePath();
  if (!await pathExists(path)) return undefined;
  const marketplace = await readJson(path, {});
  if (!Array.isArray(marketplace.plugins)) return undefined;
  const next = { ...marketplace, plugins: marketplace.plugins.filter((plugin) => plugin?.name !== 'agent-watch') };
  const write = await atomicWriteJson(path, next, { mode: 0o600, backup: true });
  return { path, backupPath: write.backupPath };
}

export async function uninstallHost(host) {
  if (host === 'claude') {
    const hooks = await uninstallUserHooks(getClaudeSettingsPath());
    await uninstallSkills(getClaudeSkillsPath());
    for (const name of ['on', 'off', 'mute', 'unmute', 'status', 'test', 'template']) {
      await removePath(join(getClaudeCommandsPath(), `agent-watch-${name}.md`));
    }
    await removePath(getClaudePluginPath());
    return { host, removed: true, hooks };
  }
  if (host === 'codex') {
    const hooks = await uninstallUserHooks(getCodexHooksPath());
    await uninstallSkills(getCodexSkillsPath());
    const marketplace = await removePersonalMarketplaceEntry();
    await removePath(getCodexPluginPath());
    return { host, removed: true, hooks, marketplace };
  }
  throw new Error(`Unsupported host: ${host}`);
}

export async function uninstallHosts(target = 'all') {
  const hosts = target === 'all' ? ['claude', 'codex'] : [target];
  const results = [];
  for (const host of hosts) results.push(await uninstallHost(host));
  return results;
}

export async function inventory() {
  const targets = {
    claude: getClaudePluginPath(),
    claudeSettings: getClaudeSettingsPath(),
    claudeCommands: getClaudeCommandsPath(),
    codex: getCodexPluginPath(),
    codexHooks: getCodexHooksPath(),
    marketplace: getPersonalMarketplacePath()
  };
  const result = {};
  for (const [key, path] of Object.entries(targets)) result[key] = { path, exists: await pathExists(path) };
  return result;
}

export { SOURCE_PLUGIN_ROOT };
