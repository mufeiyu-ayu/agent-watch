import { homedir } from 'node:os';
import { join } from 'node:path';

export function getConfigPath(env = process.env) {
  if (env.AGENT_WATCH_CONFIG) return env.AGENT_WATCH_CONFIG;
  const root = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(root, 'agent-watch', 'config.json');
}

export function getStatePath(env = process.env) {
  if (env.AGENT_WATCH_STATE) return env.AGENT_WATCH_STATE;
  const root = env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(root, 'agent-watch', 'state.json');
}

export function getClaudePluginPath(env = process.env) {
  if (env.AGENT_WATCH_CLAUDE_PLUGIN_DIR) return env.AGENT_WATCH_CLAUDE_PLUGIN_DIR;
  return join(homedir(), '.claude', 'plugins', 'agent-watch');
}

export function getClaudeSettingsPath(env = process.env) {
  if (env.AGENT_WATCH_CLAUDE_SETTINGS) return env.AGENT_WATCH_CLAUDE_SETTINGS;
  return join(homedir(), '.claude', 'settings.json');
}

export function getClaudeSkillsPath(env = process.env) {
  if (env.AGENT_WATCH_CLAUDE_SKILLS_DIR) return env.AGENT_WATCH_CLAUDE_SKILLS_DIR;
  return join(homedir(), '.claude', 'skills');
}

export function getClaudeCommandsPath(env = process.env) {
  if (env.AGENT_WATCH_CLAUDE_COMMANDS_DIR) return env.AGENT_WATCH_CLAUDE_COMMANDS_DIR;
  return join(homedir(), '.claude', 'commands');
}

export function getCodexPluginPath(env = process.env) {
  if (env.AGENT_WATCH_CODEX_PLUGIN_DIR) return env.AGENT_WATCH_CODEX_PLUGIN_DIR;
  return join(homedir(), '.codex', 'plugins', 'agent-watch');
}

export function getCodexHooksPath(env = process.env) {
  if (env.AGENT_WATCH_CODEX_HOOKS) return env.AGENT_WATCH_CODEX_HOOKS;
  return join(homedir(), '.codex', 'hooks.json');
}

export function getCodexSkillsPath(env = process.env) {
  if (env.AGENT_WATCH_CODEX_SKILLS_DIR) return env.AGENT_WATCH_CODEX_SKILLS_DIR;
  return join(homedir(), '.codex', 'skills');
}

export function getPersonalMarketplacePath(env = process.env) {
  if (env.AGENT_WATCH_MARKETPLACE) return env.AGENT_WATCH_MARKETPLACE;
  return join(homedir(), '.agents', 'plugins', 'marketplace.json');
}
