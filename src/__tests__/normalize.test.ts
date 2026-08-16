import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHook, normalizeWhitespace, shouldNotifyStop, truncate } from '../normalize.js';

test('normalizes whitespace', () => {
  assert.equal(normalizeWhitespace(' hello\n  world\t! '), 'hello world !');
});

test('truncates with ellipsis', () => {
  assert.equal(truncate('abcdefghij', 6), 'abcde…');
});

test('normalizes a Codex stop event without leaking summary by default', () => {
  const result = normalizeHook('codex', {
    cwd: '/Users/ayu/dev/agent',
    hook_event_name: 'Stop',
    last_assistant_message: 'Secret implementation details'
  }, {
    includeSummary: false,
    summaryMaxChars: 180
  });

  assert.deepEqual(result, {
    agent: 'codex',
    project: 'agent',
    event: 'Stop'
  });
});

test('includes a bounded summary when explicitly enabled', () => {
  const result = normalizeHook('claude', {
    cwd: '/tmp/topuplist',
    hook_event_name: 'Stop',
    last_assistant_message: 'done '.repeat(20)
  }, {
    includeSummary: true,
    summaryMaxChars: 30
  });

  assert.equal(result.project, 'topuplist');
  assert.equal(result.summary?.length, 30);
  assert.ok(result.summary?.endsWith('…'));
});

test('suppresses Claude Stop notifications while background work is still active', () => {
  assert.equal(shouldNotifyStop('claude', { background_tasks: [{ id: 'task-1' }] }), false);
  assert.equal(shouldNotifyStop('claude', { session_crons: [{ id: 'cron-1' }] }), false);
  assert.equal(shouldNotifyStop('claude', { background_tasks: [], session_crons: [] }), true);
  assert.equal(shouldNotifyStop('codex', { background_tasks: [{ id: 'ignored' }] }), true);
});
