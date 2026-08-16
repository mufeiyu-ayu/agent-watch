import type { PushoverConfig } from '../types.js';

const PUSHOVER_ENDPOINT = 'https://api.pushover.net/1/messages.json';

export async function sendPushover(
  config: PushoverConfig,
  input: { title: string; message: string }
): Promise<void> {
  const body = new URLSearchParams({
    token: config.appToken,
    user: config.userKey,
    title: input.title,
    message: input.message
  });

  if (config.device) body.set('device', config.device);
  if (config.sound) body.set('sound', config.sound);

  const response = await fetch(PUSHOVER_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8_000)
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Pushover HTTP ${response.status}: ${responseBody.slice(0, 300)}`);
  }

  let parsed: { status?: number; errors?: string[] } | undefined;
  try {
    parsed = JSON.parse(responseBody) as { status?: number; errors?: string[] };
  } catch {
    throw new Error('Pushover returned a non-JSON response.');
  }

  if (parsed.status !== 1) {
    throw new Error(`Pushover rejected the notification: ${(parsed.errors ?? ['unknown error']).join(', ')}`);
  }
}
