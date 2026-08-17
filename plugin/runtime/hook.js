#!/usr/bin/env node
import { detectHost, handleLifecycleEvent } from './lifecycle.js';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const raw = await readStdin();
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const host = detectHost(flag('--host') ?? 'auto');
  const event = flag('--event') ?? payload.hook_event_name ?? 'Stop';
  try {
    await handleLifecycleEvent({ host, event, payload });
  } catch (error) {
    // Notification failures are best-effort and must not alter the parent agent flow.
    console.error(`[agent-watch] ${error instanceof Error ? error.message : String(error)}`);
  }

  // Codex Stop hooks require valid JSON on stdout when exiting 0. The neutral
  // object is also valid for Claude Code and prevents accidental context injection.
  process.stdout.write('{}\n');
}

main().catch((error) => {
  console.error(`[agent-watch] ${error instanceof Error ? error.message : String(error)}`);
  process.stdout.write('{}\n');
});
