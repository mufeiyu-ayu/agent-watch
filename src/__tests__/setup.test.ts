import assert from 'node:assert/strict';
import test from 'node:test';
import { addStopHookForTest } from '../setup.js';

test('adds a Stop hook without replacing existing hooks', () => {
  const document = {
    hooks: {
      Stop: [
        {
          hooks: [
            { type: 'command', command: 'echo existing' }
          ]
        }
      ]
    }
  };

  const changed = addStopHookForTest(document, 'codex', "'/node' '/agent-watch' hook --agent codex");
  assert.equal(changed, true);
  assert.equal(document.hooks.Stop.length, 2);
});

test('does not duplicate an existing Agent Watch hook', () => {
  const document = {
    hooks: {
      Stop: [
        {
          hooks: [
            { type: 'command', command: "'/node' '/usr/local/lib/agent-watch/dist/cli.js' hook --agent claude" }
          ]
        }
      ]
    }
  };

  const changed = addStopHookForTest(document, 'claude', "'/node' '/agent-watch' hook --agent claude");
  assert.equal(changed, false);
  assert.equal(document.hooks.Stop.length, 1);
});
