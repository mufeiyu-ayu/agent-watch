import { createHash } from 'node:crypto';
import { loadConfig } from './config.js';
import { sendDingTalk } from './dingtalk.js';
import { getSession, mutateState, notificationGate, sessionKey, setSession } from './state.js';
import { renderNotification } from './templates.js';
import { normalizeWhitespace, projectFromCwd, truncate } from './util.js';

export function detectHost(explicit = 'auto', env = process.env) {
  if (explicit === 'claude' || explicit === 'codex') return explicit;
  if (env.PLUGIN_ROOT || env.CODEX_HOME || env.CODEX_THREAD_ID) return 'codex';
  return 'claude';
}

export function normalizeHookEvent(payload, fallbackEvent) {
  const event = payload.hook_event_name ?? payload.hookEventName ?? fallbackEvent;
  return typeof event === 'string' && event ? event : fallbackEvent;
}

export function hasActiveClaudeBackgroundWork(payload) {
  const tasks = Array.isArray(payload.background_tasks) ? payload.background_tasks : [];
  const crons = Array.isArray(payload.session_crons) ? payload.session_crons : [];
  return tasks.length > 0 || crons.length > 0;
}

function modelFromPayload(payload, session) {
  const candidate = payload.model ?? payload.model_id ?? payload.model_name ?? session.model;
  return typeof candidate === 'string' ? normalizeWhitespace(candidate) : undefined;
}

function cwdFromPayload(payload, session) {
  const candidate = payload.cwd ?? payload.working_directory ?? session.cwd;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : process.cwd();
}

function summaryFromPayload(payload, config) {
  if (!config.notification.includeSummary) return undefined;
  const raw = typeof payload.last_assistant_message === 'string'
    ? payload.last_assistant_message
    : typeof payload.lastAssistantMessage === 'string'
      ? payload.lastAssistantMessage
      : '';
  const summary = truncate(normalizeWhitespace(raw), config.notification.summaryMaxChars);
  return summary || undefined;
}

function stopKey(payload, host, key, now) {
  const turnId = payload.turn_id ?? payload.turnId;
  if (typeof turnId === 'string' && turnId) return `${host}:${turnId}`;
  const stable = `${key}:${normalizeWhitespace(payload.last_assistant_message ?? '').slice(0, 120)}`;
  if (stable.endsWith(':')) return `${key}:time:${Math.floor(now / 2_000)}`;
  return createHash('sha256').update(stable).digest('hex').slice(0, 24);
}

export async function handleLifecycleEvent({
  host,
  event,
  payload,
  now = Date.now(),
  fetchImpl = globalThis.fetch
}) {
  const actualEvent = normalizeHookEvent(payload, event);

  const plan = await mutateState((state) => {
    const key = sessionKey(payload, host);
    const session = getSession(state, key);
    const cwd = cwdFromPayload(payload, session);
    const model = modelFromPayload(payload, session);

    if (actualEvent === 'SessionStart') {
      setSession(state, key, {
        ...session,
        host,
        cwd,
        model,
        sessionStartedAt: now,
        updatedAt: now
      });
      return { action: 'tracked-session-start', key };
    }

    if (actualEvent === 'UserPromptSubmit') {
      setSession(state, key, {
        ...session,
        host,
        cwd,
        model,
        turnStartedAt: now,
        turnId: typeof payload.turn_id === 'string' ? payload.turn_id : undefined,
        updatedAt: now
      });
      return { action: 'tracked-turn-start', key };
    }

    if (actualEvent !== 'Stop') {
      return { action: 'ignored-event', event: actualEvent };
    }

    if (host === 'claude' && hasActiveClaudeBackgroundWork(payload)) {
      setSession(state, key, { ...session, host, cwd, model, updatedAt: now });
      return { action: 'suppressed-background-work', key };
    }

    const currentStopKey = stopKey(payload, host, key, now);
    const hasNewTrackedTurn = Number.isFinite(session.turnStartedAt)
      && (!Number.isFinite(session.lastStopAt) || session.turnStartedAt > session.lastStopAt);
    const recentlyStopped = Number.isFinite(session.lastStopAt) && now - session.lastStopAt < 5_000;
    if (!hasNewTrackedTurn && (session.lastStopKey === currentStopKey || recentlyStopped)) {
      return { action: 'deduplicated', key };
    }

    const durationStart = session.turnStartedAt ?? session.sessionStartedAt;
    const durationMs = Number.isFinite(durationStart) ? Math.max(0, now - durationStart) : undefined;
    setSession(state, key, {
      ...session,
      host,
      cwd,
      model,
      turnStartedAt: undefined,
      turnId: undefined,
      lastStopKey: currentStopKey,
      lastStopAt: now,
      updatedAt: now
    });

    const gate = notificationGate(state, now);
    if (!gate.allowed) return { action: `skipped-${gate.reason}`, key, gate };

    return {
      action: 'ready-to-notify',
      key,
      cwd,
      model,
      durationMs
    };
  });

  if (plan.action !== 'ready-to-notify') return plan;

  const config = await loadConfig({ allowMissing: true });
  if (!config) return { action: 'skipped-unconfigured', key: plan.key };

  const normalized = {
    host,
    project: projectFromCwd(plan.cwd),
    status: '本轮已完成',
    completedAt: now,
    durationMs: plan.durationMs,
    model: plan.model,
    summary: summaryFromPayload(payload, config)
  };
  const message = renderNotification(config, normalized, now);
  await sendDingTalk(config.dingtalk, message, { fetchImpl });
  return { action: 'notified', key: plan.key, message, normalized };
}
