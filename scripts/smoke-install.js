#!/usr/bin/env node
import { access, mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prefix = await mkdtemp(join(tmpdir(), 'agent-watch-prefix-'));
const home = join(prefix, 'home');
let tarball;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

try {
  const packed = run('npm', ['pack', '--json']);
  const jsonStart = packed.stdout.indexOf('[');
  if (jsonStart < 0) throw new Error(`npm pack did not return JSON: ${packed.stdout}`);
  const metadata = JSON.parse(packed.stdout.slice(jsonStart));
  tarball = join(root, metadata[0].filename);
  run('npm', ['install', '--global', '--prefix', prefix, tarball, '--ignore-scripts', '--no-audit', '--no-fund']);

  const executable = join(prefix, 'bin', 'agent-watch');
  const version = run(executable, ['--version'], { cwd: prefix }).stdout.trim();
  if (version !== '0.2.0') throw new Error(`Unexpected installed version: ${version}`);
  const help = run(executable, ['--help'], { cwd: prefix }).stdout;
  if (!help.includes('DingTalk')) throw new Error('Installed help output is missing DingTalk content.');

  const isolatedEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_STATE_HOME: join(home, '.local', 'state')
  };
  run(executable, [
    'setup',
    '--non-interactive',
    '--webhook', 'https://oapi.dingtalk.com/robot/send?access_token=smoke-test',
    '--keyword', 'AgentWatch',
    '--preset', 'compact',
    '--hosts', 'all'
  ], { cwd: prefix, env: isolatedEnv });

  const statusRaw = run(executable, ['status', '--json'], { cwd: prefix, env: isolatedEnv }).stdout;
  const status = JSON.parse(statusRaw);
  if (!status.configured || status.config?.provider !== 'dingtalk') throw new Error('Packaged setup did not create a DingTalk configuration.');
  if (!status.integrations?.claude?.exists || !status.integrations?.codex?.exists) {
    throw new Error('Packaged setup did not install both host integrations.');
  }

  await access(join(home, '.claude', 'settings.json'));
  await access(join(home, '.claude', 'commands', 'agent-watch-off.md'));
  await access(join(home, '.codex', 'hooks.json'));
  await access(join(home, '.codex', 'skills', 'agent-watch-off', 'SKILL.md'));

  const configPath = join(home, '.config', 'agent-watch', 'config.json');
  const configText = await readFile(configPath, 'utf8');
  if (!configText.includes('AgentWatch')) throw new Error('Packaged setup config is incomplete.');
  if (((await stat(configPath)).mode & 0o777) !== 0o600) throw new Error('Packaged setup config must use mode 0600.');

  const marketplace = JSON.parse(await readFile(join(home, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  const entry = marketplace.plugins.find((plugin) => plugin.name === 'agent-watch');
  if (entry?.policy?.installation !== 'AVAILABLE' || entry?.policy?.authentication !== 'ON_INSTALL') {
    throw new Error('Packaged Codex marketplace policy is incomplete.');
  }

  console.log(`Isolated global-install and setup smoke test passed (${version}).`);
} finally {
  if (tarball) await unlink(tarball).catch(() => {});
  await rm(prefix, { recursive: true, force: true });
}
