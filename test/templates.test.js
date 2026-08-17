import assert from 'node:assert/strict';
import test from 'node:test';
import { createConfig } from '../plugin/runtime/config.js';
import { renderNotification } from '../plugin/runtime/templates.js';

function config(preset, overrides = {}) {
  return createConfig({
    webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc',
    keyword: 'AgentWatch',
    preset,
    timezone: 'Asia/Shanghai',
    ...overrides
  });
}

const event = {
  host: 'codex',
  project: 'agent',
  status: '本轮已完成',
  completedAt: Date.parse('2026-08-17T02:30:00+08:00'),
  durationMs: 125_000,
  model: 'gpt-5.6',
  summary: 'Implemented the requested feature.'
};

test('compact template includes keyword, project, and time', () => {
  const message = renderNotification(config('compact'), event);
  assert.match(message.title, /AgentWatch/);
  assert.match(message.text, /项目/);
  assert.match(message.text, /时间/);
  assert.doesNotMatch(message.text, /模型/);
});

test('standard template includes duration but excludes summary by default', () => {
  const message = renderNotification(config('standard'), event);
  assert.match(message.text, /2 分 5 秒/);
  assert.doesNotMatch(message.text, /Implemented/);
});

test('detailed template includes a bounded summary only when explicitly enabled', () => {
  const message = renderNotification(config('detailed', {
    includeSummary: true,
    summaryMaxChars: 20
  }), event);
  assert.match(message.text, /摘要/);
  assert.ok(message.text.includes('…'));
  assert.match(message.text, /模型/);
});

test('custom title is automatically prefixed with the required keyword', () => {
  const message = renderNotification(config('compact', { titleTemplate: '{agent} {status}' }), event);
  assert.ok(message.title.startsWith('AgentWatch'));
  assert.ok(message.text.includes('AgentWatch'));
});
