import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
const DEFAULT_SUMMARY_MAX_CHARS = 180;
export function getConfigPath() {
    if (process.env.AGENT_WATCH_CONFIG)
        return process.env.AGENT_WATCH_CONFIG;
    const configRoot = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
    return join(configRoot, 'agent-watch', 'config.json');
}
export async function loadConfig() {
    const path = getConfigPath();
    let raw;
    try {
        raw = await readFile(path, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Agent Watch is not configured. Run: agent-watch configure pushover --user <USER_KEY> --token <APP_TOKEN>`);
        }
        throw error;
    }
    const parsed = JSON.parse(raw);
    if (parsed.provider !== 'pushover')
        throw new Error('Unsupported or missing provider in config.');
    if (!parsed.pushover?.appToken || !parsed.pushover.userKey) {
        throw new Error('Pushover appToken/userKey are missing in config.');
    }
    return {
        provider: 'pushover',
        includeSummary: parsed.includeSummary ?? false,
        summaryMaxChars: parsed.summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS,
        pushover: {
            appToken: parsed.pushover.appToken,
            userKey: parsed.pushover.userKey,
            ...(parsed.pushover.device ? { device: parsed.pushover.device } : {}),
            ...(parsed.pushover.sound ? { sound: parsed.pushover.sound } : {})
        }
    };
}
export async function saveConfig(config) {
    const path = getConfigPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
    return path;
}
export function createPushoverConfig(input) {
    return {
        provider: 'pushover',
        includeSummary: input.includeSummary ?? false,
        summaryMaxChars: input.summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS,
        pushover: {
            appToken: input.appToken,
            userKey: input.userKey,
            ...(input.device ? { device: input.device } : {}),
            ...(input.sound ? { sound: input.sound } : {})
        }
    };
}
