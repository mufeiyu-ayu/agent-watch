import { TEMPLATE_FIELDS, TEMPLATE_PRESETS } from './constants.js';
import { formatDuration, formatTimestamp, normalizeWhitespace, truncate } from './util.js';

const LABELS = Object.freeze({
  agent: 'Agent',
  project: '项目',
  status: '状态',
  model: '模型',
  time: '时间',
  duration: '耗时',
  summary: '摘要'
});

export function displayAgent(host) {
  return host === 'claude' ? 'Claude Code' : host === 'codex' ? 'Codex' : normalizeWhitespace(host) || 'Agent';
}

export function ensureKeyword(value, keyword) {
  const text = normalizeWhitespace(value);
  return text.includes(keyword) ? text : `${keyword} · ${text}`;
}

export function applyTitleTemplate(template, values) {
  const replacements = {
    keyword: values.keyword,
    agent: values.agent,
    project: values.project,
    status: values.status,
    time: values.time,
    duration: values.duration,
    model: values.model
  };
  return normalizeWhitespace(template.replace(/\{(keyword|agent|project|status|time|duration|model)\}/g, (_, key) => replacements[key] ?? ''));
}

export function renderNotification(config, event, now = Date.now()) {
  const notification = config.notification;
  const keyword = config.dingtalk.keyword;
  const status = event.status ?? '本轮已完成';
  const values = {
    keyword,
    agent: displayAgent(event.host),
    project: normalizeWhitespace(event.project) || 'unknown',
    status: normalizeWhitespace(status),
    time: formatTimestamp(event.completedAt ?? now, notification.timezone),
    duration: Number.isFinite(event.durationMs) ? formatDuration(event.durationMs) : '未知',
    model: normalizeWhitespace(event.model) || '未知'
  };

  const rawTitle = applyTitleTemplate(notification.titleTemplate, values);
  const title = truncate(ensureKeyword(rawTitle || `${values.agent} ${values.status}`, keyword), 100);
  const configuredFields = Array.isArray(notification.fields)
    ? notification.fields
    : TEMPLATE_PRESETS[notification.preset] ?? TEMPLATE_PRESETS.standard;
  const fields = configuredFields.filter((field) => TEMPLATE_FIELDS.includes(field));

  const lines = [`### ${title}`, '', `> ${keyword}`];
  for (const field of fields) {
    if (field === 'title') continue;
    if (field === 'summary') {
      if (!notification.includeSummary) continue;
      const summary = truncate(normalizeWhitespace(event.summary), notification.summaryMaxChars);
      if (!summary) continue;
      lines.push(`- **${LABELS.summary}**：${summary}`);
      continue;
    }
    const value = values[field];
    if (!value) continue;
    lines.push(`- **${LABELS[field]}**：${value}`);
  }

  const text = lines.join('\n');
  if (!text.includes(keyword)) {
    throw new Error('Internal error: DingTalk keyword is missing from the rendered message.');
  }
  return { title, text };
}

export function presetFields(preset) {
  const fields = TEMPLATE_PRESETS[preset];
  if (!fields) throw new Error(`Unknown template preset: ${preset}`);
  return [...fields];
}
