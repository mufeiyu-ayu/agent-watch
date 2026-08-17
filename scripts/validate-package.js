#!/usr/bin/env node
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  'bin/agent-watch.js',
  'plugin/.claude-plugin/plugin.json',
  'plugin/.codex-plugin/plugin.json',
  'plugin/hooks/hooks.json',
  'plugin/runtime/hook.js',
  'plugin/runtime/cli.js',
  'plugin/bin/agent-watch',
  '.claude-plugin/marketplace.json',
  '.agents/plugins/marketplace.json',
  'README.md',
  'LICENSE'
];

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

for (const path of required) await access(join(root, path));
for (const forbidden of ['READMD.md', 'src', 'dist']) {
  try {
    await access(join(root, forbidden));
    throw new Error(`Obsolete path must not exist: ${forbidden}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const pkg = await json(join(root, 'package.json'));
const claude = await json(join(root, 'plugin', '.claude-plugin', 'plugin.json'));
const codex = await json(join(root, 'plugin', '.codex-plugin', 'plugin.json'));
const hooks = await json(join(root, 'plugin', 'hooks', 'hooks.json'));
const claudeMarketplace = await json(join(root, '.claude-plugin', 'marketplace.json'));
const codexMarketplace = await json(join(root, '.agents', 'plugins', 'marketplace.json'));

if (pkg.version !== claude.version || pkg.version !== codex.version) throw new Error('Package and plugin versions differ.');
if (claude.name !== 'agent-watch' || codex.name !== 'agent-watch') throw new Error('Plugin names must be agent-watch.');
if (claudeMarketplace.plugins?.[0]?.source !== './plugin') throw new Error('Claude marketplace source must be ./plugin.');
if (codexMarketplace.plugins?.[0]?.source?.path !== './plugin') throw new Error('Codex marketplace source must be ./plugin.');
if (codexMarketplace.plugins?.[0]?.policy?.installation !== 'AVAILABLE') throw new Error('Codex marketplace must declare policy.installation.');
if (codexMarketplace.plugins?.[0]?.policy?.authentication !== 'ON_INSTALL') throw new Error('Codex marketplace must declare policy.authentication.');
if (!codexMarketplace.plugins?.[0]?.category) throw new Error('Codex marketplace must declare category.');
for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
  if (!Array.isArray(hooks.hooks?.[event])) throw new Error(`Missing ${event} hook.`);
}

const files = await walk(root);
for (const file of files.filter((path) => path.endsWith('.json'))) await json(file);
for (const file of files.filter((path) => path.endsWith('.js'))) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Syntax check failed for ${relative(root, file)}:\n${check.stderr}`);
}

const runtimeFiles = files.filter((file) => file.includes(`${join('plugin', 'runtime')}`) || file.endsWith('package.json'));
for (const file of runtimeFiles) {
  const text = await readFile(file, 'utf8');
  if (/api\.pushover\.net|sendPushover|createPushoverConfig/.test(text)) {
    throw new Error(`Obsolete Pushover implementation remains in ${relative(root, file)}.`);
  }
}

for (const executable of ['bin/agent-watch.js', 'plugin/bin/agent-watch', 'plugin/runtime/hook.js']) {
  const mode = (await stat(join(root, executable))).mode & 0o111;
  if (mode === 0) throw new Error(`${executable} is not executable.`);
}

console.log(`Validated Agent Watch ${pkg.version}.`);
