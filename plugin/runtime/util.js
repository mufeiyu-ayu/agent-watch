import { basename } from 'node:path';

export function normalizeWhitespace(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function truncate(value, maxChars) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return '…'.slice(0, maxChars);
  return `${text.slice(0, maxChars - 1)}…`;
}

export function projectFromCwd(cwd) {
  const normalized = normalizeWhitespace(cwd || process.cwd());
  return basename(normalized) || normalized || 'unknown';
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function parseDuration(value, now = Date.now()) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Mute duration is required, for example: 30m, 1h, 2h30m, or until 2026-08-17T18:00:00+08:00.');
  }
  const input = value.trim();
  if (input.toLowerCase().startsWith('until ')) {
    const target = Date.parse(input.slice(6).trim());
    if (!Number.isFinite(target) || target <= now) throw new Error('Mute-until timestamp must be a valid future date.');
    return target;
  }

  const compact = input.replace(/\s+/g, '').toLowerCase();
  const pattern = /(\d+(?:\.\d+)?)([smhd])/g;
  let totalMs = 0;
  let consumed = '';
  for (const match of compact.matchAll(pattern)) {
    consumed += match[0];
    const amount = Number(match[1]);
    const unit = match[2];
    const factor = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    totalMs += amount * factor;
  }
  if (consumed !== compact || totalMs <= 0) {
    throw new Error('Invalid duration. Use combinations such as 30m, 1h, 2h30m, or 1d.');
  }
  return Math.round(now + totalMs);
}

export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '未知';
  const seconds = Math.round(durationMs / 1_000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (minutes < 60) return remainderSeconds ? `${minutes} 分 ${remainderSeconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes ? `${hours} 小时 ${remainderMinutes} 分` : `${hours} 小时`;
}

export function formatTimestamp(timestamp, timezone) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Expected a boolean value, received: ${value}`);
}
