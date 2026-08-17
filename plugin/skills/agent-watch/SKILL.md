---
name: agent-watch
description: Configure or control DingTalk lifecycle notifications for Claude Code and Codex. Use when the user asks to set up, enable, disable, mute, test, inspect, or change Agent Watch notification templates.
---

Use the local `agent-watch` CLI. Choose the exact subcommand that matches the user's request. Do not read or reveal the raw configuration file, Webhook access token, or signing secret.

Common commands:

```bash
agent-watch setup
agent-watch on
agent-watch off
agent-watch mute 1h
agent-watch unmute
agent-watch status
agent-watch test
agent-watch template compact
```

Run only the necessary command and report its output. Agent Watch controls are global for the current operating-system user, not scoped to one conversation.
