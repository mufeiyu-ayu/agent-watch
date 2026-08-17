import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { VERSION, DEFAULT_NOTIFICATION, TEMPLATE_FIELDS, TEMPLATE_PRESETS, SUPPORTED_HOSTS } from './constants.js';
import {
  createConfig,
  loadConfig,
  publicConfig,
  redactWebhook,
  saveConfig,
  validateFields,
  validatePreset,
  validateSummaryMax,
  validateTimezone,
  validateTitleTemplate
} from './config.js';
import { sendDingTalk } from './dingtalk.js';
import { installHosts, inventory, uninstallHosts } from './installer.js';
import { getConfigPath, getStatePath } from './paths.js';
import { loadState, muteFor, notificationGate, setEnabled, unmute } from './state.js';
import { presetFields, renderNotification } from './templates.js';
import { parseBoolean, projectFromCwd } from './util.js';

const HELP = `agent-watch ${VERSION}

DingTalk notifications for Claude Code and Codex lifecycle events.

Usage:
  agent-watch setup [options]
  agent-watch install [all|claude|codex]
  agent-watch uninstall [all|claude|codex]
  agent-watch test [--host claude|codex]
  agent-watch on | off
  agent-watch mute <30m|1h|2h30m|1d|until ISO_DATE>
  agent-watch unmute
  agent-watch status [--json]
  agent-watch template <compact|standard|detailed>
  agent-watch fields <comma-separated-fields>
  agent-watch title <template>
  agent-watch config-path | state-path
  agent-watch hook --host <auto|claude|codex> --event <event>   # internal

Setup options:
  --webhook <url>           DingTalk custom-robot Webhook
  --keyword <text>          Required DingTalk security keyword
  --secret <SEC...>         Optional signing secret
  --no-secret               Remove an existing signing secret
  --preset <name>           compact, standard, or detailed
  --fields <list>           title,agent,project,status,time,duration,model,summary
  --title <template>        Supports {keyword}, {agent}, {project}, {status},
                            {time}, {duration}, and {model}
  --timezone <IANA>         Default: Asia/Shanghai
  --include-summary [bool]  Explicitly allow a bounded final-message excerpt
  --summary-max <20-1000>   Default: 180
  --hosts <all|claude|codex>
  --test                    Send a test notification after setup
  --non-interactive         Fail instead of prompting for missing values

Conversation controls:
  Claude Code (npm setup): /agent-watch-off, /agent-watch-mute 1h, /agent-watch-status
  Claude Code (marketplace): /agent-watch:off, /agent-watch:mute 1h, /agent-watch:status
  Codex: $agent-watch-off, $agent-watch-mute, $agent-watch-status

Privacy:
  Prompts, source code, transcripts, and tool outputs are never read. The final
  assistant message is excluded unless include-summary is explicitly enabled.
`;

export function parseCliArgs(args) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [name, inline] = token.split('=', 2);
    if (inline !== undefined) {
      options[name] = inline;
      continue;
    }
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options[name] = next;
      index += 1;
    } else {
      options[name] = true;
    }
  }
  return { options, positionals };
}

function assertTarget(target) {
  if (!['all', ...SUPPORTED_HOSTS].includes(target)) {
    throw new Error('Host target must be all, claude, or codex.');
  }
  return target;
}

function boolOption(options, name, fallback) {
  if (!(name in options)) return fallback;
  return parseBoolean(options[name], fallback);
}

async function promptSetup(existing) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Interactive setup requires a TTY. Pass setup flags with --non-interactive.');
  }
  const rl = createInterface({ input, output });
  try {
    output.write('\nAgent Watch DingTalk setup\n\n');
    const oldWebhook = existing?.dingtalk?.webhook;
    const webhookAnswer = await rl.question(
      oldWebhook
        ? `Webhook [keep ${redactWebhook(oldWebhook)}]: `
        : 'Webhook: '
    );
    const webhook = webhookAnswer.trim() || oldWebhook;

    const oldKeyword = existing?.dingtalk?.keyword;
    const keywordAnswer = await rl.question(`Security keyword${oldKeyword ? ` [${oldKeyword}]` : ''}: `);
    const keyword = keywordAnswer.trim() || oldKeyword;

    const hasSecret = Boolean(existing?.dingtalk?.secret);
    const secretAnswer = await rl.question(
      `Signing secret${hasSecret ? ' [configured; Enter keeps, "-" removes]' : ' [optional]'}: `
    );
    const secret = secretAnswer.trim() === '-'
      ? undefined
      : secretAnswer.trim() || existing?.dingtalk?.secret;

    const oldPreset = existing?.notification?.preset ?? DEFAULT_NOTIFICATION.preset;
    const presetAnswer = await rl.question(`Template compact|standard|detailed [${oldPreset}]: `);
    const preset = presetAnswer.trim() || oldPreset;

    const oldTimezone = existing?.notification?.timezone ?? DEFAULT_NOTIFICATION.timezone;
    const timezoneAnswer = await rl.question(`Timezone [${oldTimezone}]: `);
    const timezone = timezoneAnswer.trim() || oldTimezone;

    const oldTitle = existing?.notification?.titleTemplate ?? DEFAULT_NOTIFICATION.titleTemplate;
    const titleAnswer = await rl.question(`Title template [${oldTitle}]: `);
    const titleTemplate = titleAnswer.trim() || oldTitle;

    const oldSummary = existing?.notification?.includeSummary ?? false;
    const summaryAnswer = await rl.question(`Include bounded assistant summary? y/N [${oldSummary ? 'y' : 'n'}]: `);
    const includeSummary = summaryAnswer.trim()
      ? ['y', 'yes', 'true', 'on', '1'].includes(summaryAnswer.trim().toLowerCase())
      : oldSummary;

    const hostsAnswer = await rl.question('Install integrations for all|claude|codex [all]: ');
    const hosts = hostsAnswer.trim() || 'all';
    const testAnswer = await rl.question('Send test notification now? Y/n: ');
    const shouldTest = !['n', 'no', 'false', 'off', '0'].includes(testAnswer.trim().toLowerCase());

    return {
      webhook,
      keyword,
      secret,
      preset,
      timezone,
      titleTemplate,
      includeSummary,
      summaryMaxChars: existing?.notification?.summaryMaxChars ?? DEFAULT_NOTIFICATION.summaryMaxChars,
      hosts,
      shouldTest
    };
  } finally {
    rl.close();
  }
}

async function setupCommand(args) {
  const { options } = parseCliArgs(args);
  const existing = await loadConfig({ allowMissing: true });
  const nonInteractive = Boolean(options['--non-interactive']);

  let inputConfig;
  let hosts;
  let shouldTest;
  if (!nonInteractive && !options['--webhook'] && !options['--keyword']) {
    const answers = await promptSetup(existing);
    inputConfig = answers;
    hosts = answers.hosts;
    shouldTest = answers.shouldTest;
  } else {
    const noSecret = Boolean(options['--no-secret']);
    inputConfig = {
      webhook: options['--webhook'] ?? existing?.dingtalk?.webhook,
      keyword: options['--keyword'] ?? existing?.dingtalk?.keyword,
      secret: noSecret ? undefined : options['--secret'] ?? existing?.dingtalk?.secret,
      preset: options['--preset'] ?? existing?.notification?.preset ?? DEFAULT_NOTIFICATION.preset,
      fields: options['--fields'] ?? (options['--preset'] ? undefined : existing?.notification?.fields),
      titleTemplate: options['--title'] ?? existing?.notification?.titleTemplate ?? DEFAULT_NOTIFICATION.titleTemplate,
      timezone: options['--timezone'] ?? existing?.notification?.timezone ?? DEFAULT_NOTIFICATION.timezone,
      includeSummary: boolOption(options, '--include-summary', existing?.notification?.includeSummary ?? false),
      summaryMaxChars: options['--summary-max'] ?? existing?.notification?.summaryMaxChars ?? DEFAULT_NOTIFICATION.summaryMaxChars
    };
    hosts = options['--hosts'] ?? 'all';
    shouldTest = Boolean(options['--test']);
  }

  hosts = assertTarget(hosts);
  const config = createConfig(inputConfig);
  const saved = await saveConfig(config);
  const installations = await installHosts(hosts);
  console.log(`Saved DingTalk configuration: ${saved.path}`);
  if (saved.backupPath) console.log(`Configuration backup: ${saved.backupPath}`);
  for (const result of installations) console.log(`Installed ${result.host}: ${result.pluginPath}`);
  if (hosts === 'all' || hosts === 'codex') {
    console.log('Codex: open /hooks once and trust the Agent Watch hooks if prompted.');
    console.log('Codex plugin: open /plugins to install/enable Agent Watch from Personal Plugins if desired.');
  }
  if (shouldTest) await testCommand([]);
}

async function testCommand(args) {
  const { options } = parseCliArgs(args);
  const host = options['--host'] ?? 'codex';
  if (!SUPPORTED_HOSTS.includes(host)) throw new Error('--host must be claude or codex.');
  const config = await loadConfig();
  const message = renderNotification(config, {
    host,
    project: 'agent-watch',
    status: '测试通知',
    completedAt: Date.now(),
    durationMs: 42_000,
    model: 'test-model',
    summary: 'Agent Watch DingTalk configuration is working.'
  });
  await sendDingTalk(config.dingtalk, message);
  console.log('DingTalk test notification sent.');
}

async function statusCommand(args) {
  const { options } = parseCliArgs(args);
  const state = await loadState();
  const config = await loadConfig({ allowMissing: true });
  const installed = await inventory();
  const gate = notificationGate(state);
  const result = {
    version: VERSION,
    configured: Boolean(config),
    configPath: getConfigPath(),
    statePath: getStatePath(),
    enabled: state.enabled,
    mutedUntil: state.mutedUntil ? new Date(state.mutedUntil).toISOString() : null,
    notificationAllowed: gate.allowed,
    ...(config ? { config: publicConfig(config) } : {}),
    integrations: installed
  };
  if (options['--json']) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Agent Watch ${VERSION}`);
  console.log(`Configured: ${result.configured ? 'yes' : 'no'}`);
  console.log(`Enabled: ${state.enabled ? 'yes' : 'no'}`);
  console.log(`Muted until: ${result.mutedUntil ?? 'not muted'}`);
  if (config) {
    console.log(`Provider: DingTalk`);
    console.log(`Webhook: ${redactWebhook(config.dingtalk.webhook)}`);
    console.log(`Keyword: ${config.dingtalk.keyword}`);
    console.log(`Signing: ${config.dingtalk.secret ? 'enabled' : 'disabled'}`);
    console.log(`Template: ${config.notification.preset}`);
    console.log(`Fields: ${config.notification.fields.join(', ')}`);
    console.log(`Summary: ${config.notification.includeSummary ? `enabled (${config.notification.summaryMaxChars})` : 'disabled'}`);
  }
  for (const [name, value] of Object.entries(installed)) {
    console.log(`${name}: ${value.exists ? 'installed' : 'not installed'} (${value.path})`);
  }
}

async function updateConfig(mutator) {
  const config = await loadConfig();
  const next = await mutator(structuredClone(config));
  const result = await saveConfig(next);
  return { config: next, result };
}

async function templateCommand(name) {
  const preset = validatePreset(name);
  await updateConfig((config) => {
    config.notification.preset = preset;
    config.notification.fields = presetFields(preset);
    return config;
  });
  console.log(`Template set to ${preset}.`);
}

async function fieldsCommand(value) {
  const fields = validateFields(value);
  await updateConfig((config) => {
    config.notification.fields = fields;
    return config;
  });
  console.log(`Notification fields: ${fields.join(', ')}`);
}

async function titleCommand(value) {
  const titleTemplate = validateTitleTemplate(value);
  await updateConfig((config) => {
    config.notification.titleTemplate = titleTemplate;
    return config;
  });
  console.log(`Title template: ${titleTemplate}`);
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  switch (command) {
    case 'setup':
      await setupCommand(args);
      break;
    case 'install': {
      const target = assertTarget(args[0] ?? 'all');
      const results = await installHosts(target);
      for (const result of results) console.log(`Installed ${result.host}: ${result.pluginPath}`);
      if (target === 'all' || target === 'codex') console.log('Codex: review/trust hooks with /hooks, then restart the session.');
      break;
    }
    case 'uninstall': {
      const target = assertTarget(args[0] ?? 'all');
      const results = await uninstallHosts(target);
      for (const result of results) console.log(`Uninstalled ${result.host} integration.`);
      break;
    }
    case 'test':
      await testCommand(args);
      break;
    case 'on': {
      await setEnabled(true);
      console.log('Agent Watch notifications enabled.');
      break;
    }
    case 'off': {
      await setEnabled(false);
      console.log('Agent Watch notifications disabled.');
      break;
    }
    case 'mute': {
      const value = args.join(' ');
      const state = await muteFor(value);
      console.log(`Agent Watch muted until ${new Date(state.mutedUntil).toISOString()}.`);
      break;
    }
    case 'unmute':
      await unmute();
      console.log('Agent Watch mute cleared.');
      break;
    case 'status':
      await statusCommand(args);
      break;
    case 'template':
      await templateCommand(args[0]);
      break;
    case 'fields':
      await fieldsCommand(args.join(' '));
      break;
    case 'title':
      await titleCommand(args.join(' '));
      break;
    case 'config-path':
      console.log(getConfigPath());
      break;
    case 'state-path':
      console.log(getStatePath());
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;
    case 'hook': {
      try {
        const { options } = parseCliArgs(args);
        const { detectHost, handleLifecycleEvent } = await import('./lifecycle.js');
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
        const raw = Buffer.concat(chunks).toString('utf8');
        const payload = raw.trim() ? JSON.parse(raw) : {};
        await handleLifecycleEvent({
          host: detectHost(options['--host'] ?? 'auto'),
          event: options['--event'] ?? payload.hook_event_name ?? 'Stop',
          payload
        });
      } catch (error) {
        console.error(`[agent-watch] ${error instanceof Error ? error.message : String(error)}`);
      }
      process.stdout.write('{}\n');
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

export { HELP };
