import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = join(root, 'plugin');

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

test('Claude and Codex plugin manifests point at valid assets', async () => {
  const pkg = await json(join(root, 'package.json'));
  const claude = await json(join(plugin, '.claude-plugin', 'plugin.json'));
  const codex = await json(join(plugin, '.codex-plugin', 'plugin.json'));
  const hooks = await json(join(plugin, 'hooks', 'hooks.json'));
  assert.equal(claude.name, 'agent-watch');
  assert.equal(codex.name, 'agent-watch');
  assert.equal(claude.version, pkg.version);
  assert.equal(codex.version, pkg.version);
  assert.equal(codex.skills, './skills/');
  assert.equal(codex.hooks, './hooks/hooks.json');
  for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
    assert.ok(Array.isArray(hooks.hooks[event]));
  }
  await access(join(plugin, 'runtime', 'hook.js'));
  await access(join(plugin, 'bin', 'agent-watch'));
});

test('all bundled skills have valid name and description frontmatter', async () => {
  const skillRoot = join(plugin, 'skills');
  const names = await readdir(skillRoot);
  assert.ok(names.length >= 8);
  for (const name of names) {
    const content = await readFile(join(skillRoot, name, 'SKILL.md'), 'utf8');
    assert.match(content, /^---\n/);
    assert.match(content, new RegExp(`\\nname: ${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\n`));
    assert.match(content, /\ndescription: .+\n/);
  }
});

test('repo marketplaces expose the plugin from ./plugin', async () => {
  const claude = await json(join(root, '.claude-plugin', 'marketplace.json'));
  const codex = await json(join(root, '.agents', 'plugins', 'marketplace.json'));
  assert.equal(claude.plugins[0].source, './plugin');
  assert.equal(codex.plugins[0].source.path, './plugin');
  assert.equal(codex.plugins[0].policy.installation, 'AVAILABLE');
  assert.equal(codex.plugins[0].policy.authentication, 'ON_INSTALL');
  assert.equal(codex.plugins[0].category, 'Productivity');
});
