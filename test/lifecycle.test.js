import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createConfig, saveConfig } from '../plugin/runtime/config.js';
import { handleLifecycleEvent } from '../plugin/runtime/lifecycle.js';
import { setEnabled } from '../plugin/runtime/state.js';

async function setupFiles() {
  const dir = await mkdtemp(join(tmpdir(), 'agent-watch-lifecycle-'));
  process.env.AGENT_WATCH_CONFIG = join(dir, 'config.json');
  process.env.AGENT_WATCH_STATE = join(dir, 'state.json');
  await saveConfig(createConfig({
    webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
    keyword: 'AgentWatch',
    preset: 'standard',
    timezone: 'Asia/Shanghai'
  }));
}

function cleanup() {
  delete process.env.AGENT_WATCH_CONFIG;
  delete process.env.AGENT_WATCH_STATE;
}

test('tracks turn duration, sends once, and does not retain the prompt', async () => {
  await setupFiles();
  const sessionPayload = { session_id: 's1', cwd: '/tmp/agent', model: 'gpt-5.6' };
  await handleLifecycleEvent({ host: 'codex', event: 'UserPromptSubmit', payload: { ...sessionPayload, turn_id: 't1', prompt: 'private prompt' }, now: 1_000 });

  let calls = 0;
  let sentBody;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    sentBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 });
  };
  const result = await handleLifecycleEvent({
    host: 'codex',
    event: 'Stop',
    payload: { ...sessionPayload, turn_id: 't1', last_assistant_message: 'private assistant output' },
    now: 61_000,
    fetchImpl
  });
  assert.equal(result.action, 'notified');
  assert.equal(calls, 1);
  assert.match(sentBody.markdown.text, /1 分/);
  assert.doesNotMatch(sentBody.markdown.text, /private prompt/);
  assert.doesNotMatch(sentBody.markdown.text, /private assistant output/);

  const duplicate = await handleLifecycleEvent({
    host: 'codex',
    event: 'Stop',
    payload: { ...sessionPayload, turn_id: 't1' },
    now: 61_500,
    fetchImpl
  });
  assert.equal(duplicate.action, 'deduplicated');
  assert.equal(calls, 1);
  cleanup();
});

test('honors off state before any network request', async () => {
  await setupFiles();
  await setEnabled(false);
  let called = false;
  const result = await handleLifecycleEvent({
    host: 'claude',
    event: 'Stop',
    payload: { session_id: 's2', cwd: '/tmp/project' },
    fetchImpl: async () => { called = true; }
  });
  assert.equal(result.action, 'skipped-disabled');
  assert.equal(called, false);
  cleanup();
});

test('suppresses premature Claude Stop while background work remains', async () => {
  await setupFiles();
  let called = false;
  const result = await handleLifecycleEvent({
    host: 'claude',
    event: 'Stop',
    payload: { session_id: 's3', cwd: '/tmp/project', background_tasks: [{ id: 'bg-1' }] },
    fetchImpl: async () => { called = true; }
  });
  assert.equal(result.action, 'suppressed-background-work');
  assert.equal(called, false);
  cleanup();
});

test('does not deduplicate a newly tracked fast turn in the same session', async () => {
  await setupFiles();
  const payload = { session_id: 's-fast', cwd: '/tmp/agent', model: 'gpt-5.6' };
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 });
  };

  await handleLifecycleEvent({ host: 'codex', event: 'UserPromptSubmit', payload: { ...payload, turn_id: 'turn-1' }, now: 1_000 });
  await handleLifecycleEvent({ host: 'codex', event: 'Stop', payload: { ...payload, turn_id: 'turn-1' }, now: 2_000, fetchImpl });
  await handleLifecycleEvent({ host: 'codex', event: 'UserPromptSubmit', payload: { ...payload, turn_id: 'turn-2' }, now: 2_100 });
  const second = await handleLifecycleEvent({ host: 'codex', event: 'Stop', payload: { ...payload, turn_id: 'turn-2' }, now: 2_500, fetchImpl });

  assert.equal(second.action, 'notified');
  assert.equal(calls, 2);
  cleanup();
});
