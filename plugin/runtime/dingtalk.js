import { createHmac } from 'node:crypto';

export function signDingTalkWebhook(webhook, secret, timestamp = Date.now()) {
  const url = new URL(webhook);
  if (!secret) return url;
  const timestampText = String(timestamp);
  const stringToSign = `${timestampText}\n${secret}`;
  const sign = createHmac('sha256', secret).update(stringToSign).digest('base64');
  url.searchParams.set('timestamp', timestampText);
  url.searchParams.set('sign', sign);
  return url;
}

export function createDingTalkPayload(message) {
  return {
    msgtype: 'markdown',
    markdown: {
      title: message.title,
      text: message.text
    },
    at: {
      atMobiles: [],
      atUserIds: [],
      isAtAll: false
    }
  };
}

export async function sendDingTalk(config, message, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
  timestamp = Date.now()
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch API is unavailable; Node.js 20 or newer is required.');
  if (!message.title.includes(config.keyword) || !message.text.includes(config.keyword)) {
    throw new Error('DingTalk security keyword must appear in both the title and message body.');
  }

  const endpoint = signDingTalkWebhook(config.webhook, config.secret, timestamp);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(createDingTalkPayload(message)),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(`DingTalk request failed: ${redactRequestError(error, config)}`);
  }

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`DingTalk returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(`DingTalk HTTP ${response.status}: ${safeErrorText(body, raw)}`);
  }
  if (body.errcode !== 0) {
    throw new Error(`DingTalk rejected the notification (${body.errcode ?? 'unknown'}): ${body.errmsg ?? 'unknown error'}`);
  }
  return body;
}

function safeErrorText(body, raw) {
  if (body && typeof body === 'object') {
    const code = body.errcode ?? body.code;
    const message = body.errmsg ?? body.message;
    if (code || message) return `${code ?? 'unknown'} ${message ?? ''}`.trim();
  }
  return String(raw).slice(0, 300);
}


function redactRequestError(error, config) {
  let text = error instanceof Error ? error.message : String(error);
  const sensitive = [config.webhook, config.secret];
  try {
    sensitive.push(new URL(config.webhook).searchParams.get('access_token'));
  } catch {
    // The configuration validator normally prevents this path.
  }
  for (const value of sensitive.filter(Boolean)) text = text.replaceAll(String(value), '[redacted]');
  return text
    .replace(/([?&](?:access_token|sign|timestamp)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300);
}
