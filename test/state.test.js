import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadState, muteFor, notificationGate, setEnabled, unmute } from '../plugin/runtime/state.js';

test('supports global on/off and bounded mute state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-watch-state-'));
  process.env.AGENT_WATCH_STATE = join(dir, 'state.json');

  let state = await setEnabled(false);
  assert.equal(notificationGate(state).reason, 'disabled');

  state = await setEnabled(true);
  assert.equal(notificationGate(state).allowed, true);

  const now = Date.parse('2026-08-17T00:00:00Z');
  state = await muteFor('1h30m', now);
  assert.equal(state.mutedUntil, now + 90 * 60_000);
  assert.equal(notificationGate(state, now + 1_000).reason, 'muted');

  state = await unmute();
  assert.equal(state.mutedUntil, null);
  assert.equal((await loadState()).enabled, true);
  delete process.env.AGENT_WATCH_STATE;
});

test('creates a missing state directory before acquiring the lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-watch-state-parent-'));
  process.env.AGENT_WATCH_STATE = join(dir, 'nested', 'state', 'state.json');

  const state = await setEnabled(false);
  assert.equal(state.enabled, false);
  assert.equal((await loadState()).enabled, false);

  delete process.env.AGENT_WATCH_STATE;
});
