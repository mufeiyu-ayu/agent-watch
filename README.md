# Agent Watch

Send **Claude Code** and **Codex** lifecycle notifications to your iPhone / Apple Watch.

The CLI installs lifecycle `Stop` hooks and forwards a small notification through Pushover. It does **not** parse transcript files and, by default, it does **not** send prompts, source code, or the assistant's final message.

## Why hooks instead of a Skill?

Completion notifications are deterministic lifecycle side effects. They should run whenever the agent finishes a turn, regardless of whether the model decides to invoke a Skill. Both Claude Code and Codex expose lifecycle hooks for this purpose.

## Architecture

```text
Claude Code ── Stop hook ──┐
                           ├── agent-watch ── Pushover ── iPhone ── Apple Watch
Codex ─────── Stop hook ───┘
```

## Requirements

- macOS or Linux
- Node.js 20+
- Claude Code and/or Codex
- Pushover account/app credentials
- Pushover installed on the iPhone; enable Apple Watch notification mirroring / Watch app as appropriate

## Install from GitHub

```bash
npm install -g github:mufeiyu-ayu/agent-watch
```

For local development:

```bash
git clone https://github.com/mufeiyu-ayu/agent-watch.git
cd agent-watch
npm install
npm run build
npm link
```

## 1. Configure Pushover

Create a Pushover application to obtain an application API token and find your user key.

```bash
agent-watch configure pushover \
  --user YOUR_USER_KEY \
  --token YOUR_APP_TOKEN
```

The configuration is stored at:

```text
~/.config/agent-watch/config.json
```

with file mode `0600`.

Environment variables can be used instead of CLI flags:

```bash
export PUSHOVER_USER_KEY='...'
export PUSHOVER_APP_TOKEN='...'
agent-watch configure pushover
```

By default, Agent Watch sends only:

- agent name
- project directory name
- lifecycle event / completion state

To explicitly include a truncated final assistant message:

```bash
agent-watch configure pushover \
  --user YOUR_USER_KEY \
  --token YOUR_APP_TOKEN \
  --include-summary \
  --summary-max 180
```

## 2. Send a test notification

```bash
agent-watch test
```

## 3. Install hooks

Both agents:

```bash
agent-watch setup all
```

Only Codex:

```bash
agent-watch setup codex
```

Only Claude Code:

```bash
agent-watch setup claude
```

Agent Watch merges its hook into existing JSON instead of replacing existing hooks. If a target file already exists, it creates a `.agent-watch.bak` backup before writing.

### Codex trust step

Codex requires non-managed command hooks to be reviewed and trusted. After setup, open Codex and run:

```text
/hooks
```

Review and trust the Agent Watch hook if prompted.

## What gets installed?

### Codex

User-level hook file:

```text
~/.codex/hooks.json
```

Conceptually:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "... agent-watch ... hook --agent codex",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ]
  }
}
```

### Claude Code

User settings:

```text
~/.claude/settings.json
```

Conceptually:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "... agent-watch ... hook --agent claude",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ]
  }
}
```

The installed command uses absolute Node/script paths so hooks launched from a GUI app do not depend on the shell's `PATH` containing `agent-watch`.

## Privacy model

Agent Watch intentionally treats push providers as third parties.

Default notification payload:

```text
Codex finished
agent
Turn finished.
```

It does **not** read transcript files. Final assistant text is only included when `--include-summary` is explicitly enabled, and is bounded by `summaryMaxChars`.

Pushover credentials are stored locally with user-only file permissions. Do not commit the config file or credentials into a repository.

## Semantics: “finished” means end of a turn

A `Stop` hook means the main agent finished responding for the current turn. It is not a formal proof that every real-world task objective has been completed. For example, an agent can stop because it needs additional user input. The notification therefore says `Turn finished.` rather than claiming a task was definitely successful.

## Commands

```text
agent-watch configure pushover ...
agent-watch setup all|claude|codex
agent-watch test
agent-watch hook --agent claude|codex
agent-watch config-path
agent-watch --version
agent-watch --help
```

## Development

```bash
npm install
npm test
```

The runtime has zero third-party npm dependencies; only TypeScript and Node type definitions are development dependencies.

## Roadmap

- Permission-request notifications
- ntfy provider
- macOS Keychain-backed secret storage
- notification deduplication / cooldown
- richer status classification without sending source/transcript data
- optional menu-bar companion app

## License

MIT

## References

- Codex Hooks: https://developers.openai.com/codex/hooks
- Claude Code Hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Pushover Message API: https://pushover.net/api
