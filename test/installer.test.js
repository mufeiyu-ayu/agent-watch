import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installHosts, mergeManagedHooks, removeManagedHooks, uninstallHosts } from '../plugin/runtime/installer.js';

const ENV_KEYS = [
  'AGENT_WATCH_CLAUDE_PLUGIN_DIR',
  'AGENT_WATCH_CLAUDE_SETTINGS',
  'AGENT_WATCH_CLAUDE_SKILLS_DIR',
  'AGENT_WATCH_CLAUDE_COMMANDS_DIR',
  'AGENT_WATCH_CODEX_PLUGIN_DIR',
  'AGENT_WATCH_CODEX_HOOKS',
  'AGENT_WATCH_CODEX_SKILLS_DIR',
  'AGENT_WATCH_MARKETPLACE'
];

function configurePaths(root) {
  process.env.AGENT_WATCH_CLAUDE_PLUGIN_DIR = join(root, '.claude', 'plugins', 'agent-watch');
  process.env.AGENT_WATCH_CLAUDE_SETTINGS = join(root, '.claude', 'settings.json');
  process.env.AGENT_WATCH_CLAUDE_SKILLS_DIR = join(root, '.claude', 'skills');
  process.env.AGENT_WATCH_CLAUDE_COMMANDS_DIR = join(root, '.claude', 'commands');
  process.env.AGENT_WATCH_CODEX_PLUGIN_DIR = join(root, '.codex', 'plugins', 'agent-watch');
  process.env.AGENT_WATCH_CODEX_HOOKS = join(root, '.codex', 'hooks.json');
  process.env.AGENT_WATCH_CODEX_SKILLS_DIR = join(root, '.codex', 'skills');
  process.env.AGENT_WATCH_MARKETPLACE = join(root, '.agents', 'plugins', 'marketplace.json');
}

function clearPaths() {
  for (const key of ENV_KEYS) delete process.env[key];
}

test('installs idempotently and preserves unrelated Claude/Codex hooks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-watch-install-'));
  configurePaths(root);
  await mkdir(join(root, '.claude'), { recursive: true });
  await mkdir(join(root, '.codex'), { recursive: true });
  const unrelated = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing' }] }] } };
  await writeFile(process.env.AGENT_WATCH_CLAUDE_SETTINGS, JSON.stringify(unrelated, null, 2));
  await writeFile(process.env.AGENT_WATCH_CODEX_HOOKS, JSON.stringify(unrelated, null, 2));

  await installHosts('all');
  await installHosts('all');

  for (const hooksPath of [process.env.AGENT_WATCH_CLAUDE_SETTINGS, process.env.AGENT_WATCH_CODEX_HOOKS]) {
    const hooks = JSON.parse(await readFile(hooksPath, 'utf8'));
    assert.equal(hooks.hooks.Stop.filter((group) => group.hooks.some((hook) => hook.command === 'echo existing')).length, 1);
    assert.equal(hooks.hooks.Stop.filter((group) => group.hooks.some((hook) => hook.command.includes('--agent-watch-managed'))).length, 1);
  }

  const claudeManifest = JSON.parse(await readFile(join(process.env.AGENT_WATCH_CLAUDE_PLUGIN_DIR, '.claude-plugin', 'plugin.json'), 'utf8'));
  const codexManifest = JSON.parse(await readFile(join(process.env.AGENT_WATCH_CODEX_PLUGIN_DIR, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(claudeManifest.name, 'agent-watch');
  assert.equal(codexManifest.name, 'agent-watch');

  const marketplace = JSON.parse(await readFile(process.env.AGENT_WATCH_MARKETPLACE, 'utf8'));
  const marketplaceEntry = marketplace.plugins.find((plugin) => plugin.name === 'agent-watch');
  assert.equal(marketplaceEntry.policy.installation, 'AVAILABLE');
  assert.equal(marketplaceEntry.policy.authentication, 'ON_INSTALL');
  assert.equal(marketplaceEntry.category, 'Productivity');

  const copiedClaudeSkill = await readFile(join(process.env.AGENT_WATCH_CLAUDE_SKILLS_DIR, 'agent-watch-off', 'SKILL.md'), 'utf8');
  const copiedCodexSkill = await readFile(join(process.env.AGENT_WATCH_CODEX_SKILLS_DIR, 'agent-watch-off', 'SKILL.md'), 'utf8');
  const copiedClaudeCommand = await readFile(join(process.env.AGENT_WATCH_CLAUDE_COMMANDS_DIR, 'agent-watch-off.md'), 'utf8');
  for (const content of [copiedClaudeSkill, copiedCodexSkill, copiedClaudeCommand]) {
    assert.match(content, new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(content, /bin\/agent-watch/);
  }
  assert.match(copiedClaudeSkill, /name: agent-watch-off/);

  await uninstallHosts('all');
  for (const hooksPath of [process.env.AGENT_WATCH_CLAUDE_SETTINGS, process.env.AGENT_WATCH_CODEX_HOOKS]) {
    const cleaned = JSON.parse(await readFile(hooksPath, 'utf8'));
    assert.equal(cleaned.hooks.Stop.length, 1);
    assert.equal(cleaned.hooks.Stop[0].hooks[0].command, 'echo existing');
  }
  clearPaths();
});


test('updates stale managed paths while preserving unrelated hooks in the same group', () => {
  const existing = {
    hooks: {
      Stop: [{
        matcher: 'shared',
        hooks: [
          { type: 'command', command: "'/old/node' '/old/plugin/runtime/hook.js' --host codex --event Stop --agent-watch-managed" },
          { type: 'command', command: 'echo keep-me' }
        ]
      }]
    }
  };

  const merged = mergeManagedHooks(existing, 'codex', '/new/plugin');
  const commands = merged.hooks.Stop.flatMap((group) => group.hooks.map((hook) => hook.command));
  assert.equal(commands.filter((command) => command === 'echo keep-me').length, 1);
  assert.equal(commands.filter((command) => command.includes('--agent-watch-managed')).length, 1);
  assert.equal(commands.some((command) => command.includes('/old/plugin')), false);
  assert.equal(commands.some((command) => command.includes('/new/plugin')), true);

  const cleaned = removeManagedHooks(merged);
  assert.deepEqual(cleaned.hooks.Stop, [{ matcher: 'shared', hooks: [{ type: 'command', command: 'echo keep-me' }] }]);
});
