# Changelog

## 0.2.0 — 2026-08-17

- Rebuilt Agent Watch around DingTalk custom-robot Webhooks.
- Added required keyword validation and optional timestamp/HMAC-SHA256 signing.
- Added compact, standard, detailed, and custom-field notification rendering.
- Added lifecycle tracking for `SessionStart`, `UserPromptSubmit`, and `Stop`.
- Added Claude Code and Codex plugin manifests, hooks, commands, and skills.
- Added global on/off, timed mute, status, test, template, and uninstall commands.
- Added atomic local configuration/state writes, credential masking, deduplication, tests, CI, and isolated npm install verification.
- Removed the previous Pushover implementation and obsolete generated files.
