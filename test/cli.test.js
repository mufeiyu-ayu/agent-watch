import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../plugin/runtime/cli.js';
import { loadConfig } from '../plugin/runtime/config.js';

const KEYS = [
  'AGENT_WATCH_CONFIG',
  'AGENT_WATCH_STATE',
  'AGENT_WATCH_CLAUDE_PLUGIN_DIR',
  'AGENT_WATCH_CLAUDE_SETTINGS',
  'AGENT_WATCH_CLAUDE_SKILLS_DIR',
  'AGENT_WATCH_CLAUDE_COMMANDS_DIR'
];

test('non-interactive setup writes config and installs the selected host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-watch-cli-'));
  process.env.AGENT_WATCH_CONFIG = join(root, 'config.json');
  process.env.AGENT_WATCH_STATE = join(root, 'state.json');
  process.env.AGENT_WATCH_CLAUDE_PLUGIN_DIR = join(root, '.claude', 'plugins', 'agent-watch');
  process.env.AGENT_WATCH_CLAUDE_SETTINGS = join(root, '.claude', 'settings.json');
  process.env.AGENT_WATCH_CLAUDE_SKILLS_DIR = join(root, '.claude', 'skills');
  process.env.AGENT_WATCH_CLAUDE_COMMANDS_DIR = join(root, '.claude', 'commands');

  await runCli([
    'setup',
    '--non-interactive',
    '--webhook', 'https://oapi.dingtalk.com/robot/send?access_token=abc',
    '--keyword', 'AgentWatch',
    '--preset', 'compact',
    '--timezone', 'Asia/Shanghai',
    '--hosts', 'claude'
  ]);

  const config = await loadConfig();
  assert.equal(config.notification.preset, 'compact');
  assert.deepEqual(config.notification.fields, ['title', 'project', 'time']);
  const manifest = JSON.parse(await readFile(join(process.env.AGENT_WATCH_CLAUDE_PLUGIN_DIR, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'agent-watch');
  const settings = JSON.parse(await readFile(process.env.AGENT_WATCH_CLAUDE_SETTINGS, 'utf8'));
  assert.equal(settings.hooks.Stop.length, 1);
  assert.match(settings.hooks.Stop[0].hooks[0].command, /--host claude/);

  for (const key of KEYS) delete process.env[key];
});
