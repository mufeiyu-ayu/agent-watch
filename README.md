# Agent Watch

Receive Claude Code and Codex lifecycle notifications on Apple Watch through Pushover.

Agent Watch is a small TypeScript CLI that installs official lifecycle hooks for Claude Code and Codex, normalizes completion events, and sends privacy-conscious notifications without uploading source code, prompts, transcripts, or full assistant responses by default.

## Status

Current version: `0.1.0`

- Claude Code `Stop` hook support
- Codex `Stop` hook support
- Pushover provider
- Apple Watch delivery through the Pushover iPhone/watchOS notification path
- Safe failure behavior: notification failures never block the agent
- Existing hook configurations are preserved
- Automatic backups before configuration changes
- Optional bounded final-message summary
- Claude background-task suppression to avoid premature “done” notifications

## Requirements

- macOS
- Node.js 20+
- Claude Code and/or Codex
- A Pushover account and application token
- Pushover installed and configured on your iPhone / Apple Watch

## Install

For local development:

```bash
npm install
npm run build
npm link
```

Once the repository is ready to use directly:

```bash
npm install -g github:mufeiyu-ayu/agent-watch
```

## Configure Pushover

```bash
agent-watch configure pushover <USER_KEY> <APP_TOKEN>
```

Credentials are stored in the Agent Watch config file with user-only permissions (`0600`).

By default Agent Watch does **not** include the final assistant response in a notification.

To enable a short bounded summary:

```bash
agent-watch configure summary on
```

Disable it again with:

```bash
agent-watch configure summary off
```

## Test the notification path

```bash
agent-watch test
```

This sends a test notification through Pushover. If your iPhone is locked and Apple Watch is eligible to receive the mirrored notification, the watch should alert according to your watch notification/haptic settings.

## Install hooks

Install both Claude Code and Codex hooks:

```bash
agent-watch setup all
```

Or install one integration only:

```bash
agent-watch setup claude
agent-watch setup codex
```

The installer preserves existing hooks and creates a backup before changing configuration.

### Claude Code

Agent Watch adds a `Stop` command hook to:

```text
~/.claude/settings.json
```

When Claude reports active `background_tasks` or `session_crons`, Agent Watch suppresses the completion notification so a foreground stop does not look like the entire task is finished.

### Codex

Agent Watch adds a `Stop` command hook to:

```text
~/.codex/hooks.json
```

Codex may require you to review/trust a command hook before it runs.

## Notification content

Default completion notification:

```text
Codex completed
agent
Task finished
```

or:

```text
Claude Code completed
topuplist
Task finished
```

The default payload is intentionally minimal:

- agent name
- project/directory name
- lifecycle status

It does not send:

- source code
- prompts
- transcript files
- tool results
- full assistant messages

If summaries are enabled, only a whitespace-normalized and length-bounded final assistant message excerpt is sent.

## Commands

```text
agent-watch setup <all|claude|codex>
agent-watch configure pushover <USER_KEY> <APP_TOKEN>
agent-watch configure summary <on|off>
agent-watch test
agent-watch hook --agent <claude|codex>
agent-watch help
```

`hook` is intended for Claude Code/Codex lifecycle integration and reads the hook JSON payload from stdin.

## Failure behavior

Notification delivery is deliberately best-effort. A malformed event, missing configuration, network failure, or Pushover outage will not cause an agent lifecycle hook to fail the parent Claude Code/Codex task.

## Development

```bash
npm install
npm test
```

The tests build the TypeScript project first and then use Node's built-in test runner.

## Architecture

```text
Claude Code ── Stop ──┐
                      ├── Agent Watch CLI ── Pushover ── iPhone ── Apple Watch
Codex ─────── Stop ───┘
```

Agent Watch keeps the agent-specific payload parsing separate from notification delivery so additional providers and agents can be added later.

## License

MIT
