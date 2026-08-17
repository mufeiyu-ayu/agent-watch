import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hook = join(root, 'plugin', 'runtime', 'hook.js');

test('Codex Stop hook always emits neutral valid JSON on stdout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-watch-hook-'));
  const result = spawnSync(process.execPath, [hook, '--host', 'codex', '--event', 'Stop'], {
    input: JSON.stringify({ session_id: 's1', turn_id: 't1', cwd: '/tmp/demo' }),
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_WATCH_CONFIG: join(dir, 'missing-config.json'),
      AGENT_WATCH_STATE: join(dir, 'state.json')
    }
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
});
