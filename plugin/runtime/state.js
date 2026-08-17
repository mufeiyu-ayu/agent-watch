import { DEFAULT_STATE, STATE_VERSION } from './constants.js';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicWriteJson, readJson } from './fs-store.js';
import { getStatePath } from './paths.js';
import { parseDuration } from './util.js';

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

function normalizeSession(session = {}) {
  return {
    host: typeof session.host === 'string' ? session.host : undefined,
    cwd: typeof session.cwd === 'string' ? session.cwd : undefined,
    model: typeof session.model === 'string' ? session.model : undefined,
    sessionStartedAt: Number.isFinite(session.sessionStartedAt) ? session.sessionStartedAt : undefined,
    turnStartedAt: Number.isFinite(session.turnStartedAt) ? session.turnStartedAt : undefined,
    turnId: typeof session.turnId === 'string' ? session.turnId : undefined,
    lastStopKey: typeof session.lastStopKey === 'string' ? session.lastStopKey : undefined,
    lastStopAt: Number.isFinite(session.lastStopAt) ? session.lastStopAt : undefined,
    updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : Date.now()
  };
}

export function normalizeState(parsed) {
  const state = parsed && typeof parsed === 'object' ? parsed : {};
  const sessions = {};
  for (const [key, value] of Object.entries(state.sessions ?? {})) {
    if (value && typeof value === 'object') sessions[key] = normalizeSession(value);
  }
  return {
    version: STATE_VERSION,
    enabled: state.enabled !== false,
    mutedUntil: Number.isFinite(state.mutedUntil) ? state.mutedUntil : null,
    sessions
  };
}

export async function loadState() {
  return normalizeState(await readJson(getStatePath(), DEFAULT_STATE));
}

export async function saveState(state) {
  const normalized = pruneSessions(normalizeState(state));
  await atomicWriteJson(getStatePath(), normalized, { mode: 0o600 });
  return normalized;
}

export function pruneSessions(state, now = Date.now()) {
  const cutoff = now - SESSION_RETENTION_MS;
  const sessions = Object.fromEntries(
    Object.entries(state.sessions).filter(([, session]) => (session.updatedAt ?? 0) >= cutoff)
  );
  return { ...state, sessions };
}

export function notificationGate(state, now = Date.now()) {
  if (!state.enabled) return { allowed: false, reason: 'disabled' };
  if (state.mutedUntil && state.mutedUntil > now) {
    return { allowed: false, reason: 'muted', mutedUntil: state.mutedUntil };
  }
  return { allowed: true };
}

export async function setEnabled(enabled) {
  return mutateState((state) => {
    state.enabled = Boolean(enabled);
    if (enabled) state.mutedUntil = null;
    return state;
  });
}

export async function muteFor(value, now = Date.now()) {
  return mutateState((state) => {
    state.mutedUntil = parseDuration(value, now);
    return state;
  });
}

export async function unmute() {
  return mutateState((state) => {
    state.mutedUntil = null;
    return state;
  });
}

export function sessionKey(payload, host) {
  const id = payload.session_id ?? payload.sessionId ?? payload.conversation_id;
  if (typeof id === 'string' && id.trim()) return `${host}:${id.trim()}`;
  const cwd = typeof payload.cwd === 'string' && payload.cwd.trim() ? payload.cwd.trim() : process.cwd();
  return `${host}:cwd:${cwd}`;
}

export function getSession(state, key) {
  return normalizeSession(state.sessions[key]);
}

export function setSession(state, key, session) {
  state.sessions[key] = normalizeSession({ ...session, updatedAt: Date.now() });
  return state;
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withStateLock(callback, { timeoutMs = 2_500, staleMs = 15_000 } = {}) {
  const lockPath = `${getStatePath()}.lock`;
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();
  while (true) {
    try {
      await mkdir(lockPath, { recursive: false, mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error('Timed out waiting for Agent Watch state lock.');
      }
      await sleep(25);
    }
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function mutateState(mutator) {
  return withStateLock(async () => {
    const state = await loadState();
    const result = await mutator(state);
    await saveState(state);
    return result;
  });
}
