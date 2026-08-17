import assert from 'node:assert/strict';
import { chmod, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createConfig, loadConfig, publicConfig, saveConfig } from '../plugin/runtime/config.js';

function validInput(overrides = {}) {
  return {
    webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abcdef123456',
    keyword: 'AgentWatch',
    preset: 'standard',
    timezone: 'Asia/Shanghai',
    ...overrides
  };
}

test('creates a DingTalk config with keyword and default privacy settings', () => {
  const config = createConfig(validInput());
  assert.equal(config.provider, 'dingtalk');
  assert.equal(config.dingtalk.keyword, 'AgentWatch');
  assert.equal(config.notification.includeSummary, false);
  assert.deepEqual(config.notification.fields, ['title', 'agent', 'project', 'status', 'time', 'duration']);
});

test('rejects invalid webhook and empty keyword', () => {
  assert.throws(() => createConfig(validInput({ webhook: 'http://example.com/?access_token=x' })), /HTTPS/);
  assert.throws(() => createConfig(validInput({ webhook: 'https://oapi.dingtalk.com/robot/send' })), /access_token/);
  assert.throws(() => createConfig(validInput({ webhook: 'https://example.com/robot/send?access_token=x' })), /oapi\.dingtalk\.com/);
  assert.throws(() => createConfig(validInput({ webhook: 'https://oapi.dingtalk.com/not-robot?access_token=x' })), /robot\/send/);
  assert.throws(() => createConfig(validInput({ keyword: '  ' })), /keyword/);
});

test('stores config with mode 0600 and redacts credentials in public status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-watch-config-'));
  process.env.AGENT_WATCH_CONFIG = join(dir, 'config.json');
  const config = createConfig(validInput({ secret: 'SEC-super-secret' }));
  await saveConfig(config);
  const mode = (await stat(process.env.AGENT_WATCH_CONFIG)).mode & 0o777;
  assert.equal(mode, 0o600);
  const loaded = await loadConfig();
  const exposed = publicConfig(loaded);
  assert.equal(exposed.dingtalk.signing, true);
  assert.equal(JSON.stringify(exposed).includes('SEC-super-secret'), false);
  assert.equal(JSON.stringify(exposed).includes('abcdef123456'), false);
  delete process.env.AGENT_WATCH_CONFIG;
});
