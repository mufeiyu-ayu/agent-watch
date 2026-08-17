import { CONFIG_VERSION, DEFAULT_NOTIFICATION, PROVIDER, TEMPLATE_FIELDS, TEMPLATE_PRESETS } from './constants.js';
import { atomicWriteJson, readJson } from './fs-store.js';
import { getConfigPath } from './paths.js';

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export function validateWebhook(value, { allowHttp = false } = {}) {
  const raw = requireString(value, 'DingTalk Webhook');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DingTalk Webhook must be a valid URL.');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('DingTalk Webhook must use HTTPS.');
  }
  if (!allowHttp) {
    if (url.hostname !== 'oapi.dingtalk.com' || url.pathname !== '/robot/send') {
      throw new Error('DingTalk Webhook must use https://oapi.dingtalk.com/robot/send.');
    }
    if (!url.searchParams.get('access_token')) {
      throw new Error('DingTalk Webhook must contain an access_token query parameter.');
    }
  }
  url.searchParams.delete('sign');
  url.searchParams.delete('timestamp');
  return url.toString();
}

export function validateKeyword(value) {
  const keyword = requireString(value, 'DingTalk security keyword');
  if (/\r|\n/.test(keyword)) {
    throw new Error('DingTalk security keyword must be a single line.');
  }
  if (keyword.length > 100) {
    throw new Error('DingTalk security keyword must not exceed 100 characters.');
  }
  return keyword;
}

export function validateSecret(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const secret = requireString(value, 'DingTalk signing secret');
  if (/\r|\n/.test(secret)) {
    throw new Error('DingTalk signing secret must be a single line.');
  }
  return secret;
}

export function validateTimezone(value) {
  const timezone = requireString(value, 'Timezone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
  return timezone;
}

export function validatePreset(value) {
  if (typeof value !== 'string' || !(value in TEMPLATE_PRESETS)) {
    throw new Error(`Template preset must be one of: ${Object.keys(TEMPLATE_PRESETS).join(', ')}.`);
  }
  return value;
}

export function validateFields(value) {
  const input = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const fields = [...new Set(input.map((item) => String(item).trim()).filter(Boolean))];
  if (fields.length === 0) throw new Error('At least one notification field is required.');
  const invalid = fields.filter((field) => !TEMPLATE_FIELDS.includes(field));
  if (invalid.length > 0) {
    throw new Error(`Unsupported notification fields: ${invalid.join(', ')}.`);
  }
  if (!fields.includes('title')) fields.unshift('title');
  return fields;
}

export function validateTitleTemplate(value) {
  const template = requireString(value, 'Title template');
  if (/\r|\n/.test(template)) throw new Error('Title template must be a single line.');
  if (template.length > 200) throw new Error('Title template must not exceed 200 characters.');
  return template;
}

export function validateSummaryMax(value) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number) || number < 20 || number > 1000) {
    throw new Error('summaryMaxChars must be an integer between 20 and 1000.');
  }
  return number;
}

export function createConfig(input, { allowHttp = false } = {}) {
  const preset = validatePreset(input.preset ?? DEFAULT_NOTIFICATION.preset);
  const explicitFields = input.fields === undefined
    ? [...TEMPLATE_PRESETS[preset]]
    : validateFields(input.fields);

  return {
    version: CONFIG_VERSION,
    provider: PROVIDER,
    dingtalk: {
      webhook: validateWebhook(input.webhook, { allowHttp }),
      keyword: validateKeyword(input.keyword),
      ...(validateSecret(input.secret) ? { secret: validateSecret(input.secret) } : {})
    },
    notification: {
      preset,
      fields: explicitFields,
      titleTemplate: validateTitleTemplate(input.titleTemplate ?? DEFAULT_NOTIFICATION.titleTemplate),
      timezone: validateTimezone(input.timezone ?? DEFAULT_NOTIFICATION.timezone),
      includeSummary: Boolean(input.includeSummary),
      summaryMaxChars: validateSummaryMax(input.summaryMaxChars ?? DEFAULT_NOTIFICATION.summaryMaxChars)
    }
  };
}

export function normalizeConfig(parsed, options = {}) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Agent Watch configuration must be a JSON object.');
  if (parsed.provider === 'pushover') {
    throw new Error('Legacy Pushover configuration detected. Run `agent-watch setup` to migrate to DingTalk.');
  }
  if (parsed.provider !== PROVIDER) throw new Error('Unsupported or missing provider; expected dingtalk.');
  return createConfig({
    webhook: parsed.dingtalk?.webhook,
    keyword: parsed.dingtalk?.keyword,
    secret: parsed.dingtalk?.secret,
    preset: parsed.notification?.preset,
    fields: parsed.notification?.fields,
    titleTemplate: parsed.notification?.titleTemplate,
    timezone: parsed.notification?.timezone,
    includeSummary: parsed.notification?.includeSummary,
    summaryMaxChars: parsed.notification?.summaryMaxChars
  }, options);
}

export async function loadConfig({ allowMissing = false, allowHttp = false } = {}) {
  const path = getConfigPath();
  let parsed;
  try {
    parsed = await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT' && allowMissing) return undefined;
    if (error?.code === 'ENOENT') {
      throw new Error('Agent Watch is not configured. Run `agent-watch setup`.');
    }
    throw error;
  }
  return normalizeConfig(parsed, { allowHttp });
}

export async function saveConfig(config, { allowHttp = false } = {}) {
  const normalized = normalizeConfig(config, { allowHttp });
  return atomicWriteJson(getConfigPath(), normalized, { mode: 0o600, backup: true });
}

export function redactWebhook(webhook) {
  try {
    const url = new URL(webhook);
    if (url.searchParams.has('access_token')) {
      const token = url.searchParams.get('access_token') ?? '';
      url.searchParams.set('access_token', token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '***');
    }
    url.searchParams.delete('sign');
    url.searchParams.delete('timestamp');
    return url.toString();
  } catch {
    return '<invalid webhook>';
  }
}

export function publicConfig(config) {
  return {
    version: config.version,
    provider: config.provider,
    dingtalk: {
      webhook: redactWebhook(config.dingtalk.webhook),
      keyword: config.dingtalk.keyword,
      signing: Boolean(config.dingtalk.secret)
    },
    notification: structuredClone(config.notification)
  };
}
