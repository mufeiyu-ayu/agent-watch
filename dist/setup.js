import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
function shellQuote(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
export function buildHookCommand(agent, executablePath) {
    return `${shellQuote(process.execPath)} ${shellQuote(executablePath)} hook --agent ${agent}`;
}
function isAgentWatchHandler(handler, agent) {
    return typeof handler.command === 'string'
        && handler.command.includes('agent-watch')
        && handler.command.includes(`hook --agent ${agent}`);
}
function appendStopHook(document, agent, command) {
    document.hooks ??= {};
    const groups = document.hooks.Stop ?? (document.hooks.Stop = []);
    const alreadyExists = groups.some((group) => Array.isArray(group.hooks) && group.hooks.some((handler) => isAgentWatchHandler(handler, agent)));
    if (alreadyExists)
        return false;
    groups.push({
        hooks: [
            {
                type: 'command',
                command,
                timeout: 10,
                async: true
            }
        ]
    });
    return true;
}
async function readJson(path) {
    try {
        const raw = await readFile(path, 'utf8');
        return { document: JSON.parse(raw), exists: true };
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { document: {}, exists: false };
        throw error;
    }
}
async function writeJsonWithBackup(path, document, exists) {
    await mkdir(dirname(path), { recursive: true });
    let backupPath;
    if (exists) {
        backupPath = `${path}.agent-watch.bak`;
        await copyFile(path, backupPath);
    }
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    return backupPath;
}
export async function setupAgent(agent, executablePath) {
    const warnings = [];
    const path = agent === 'codex'
        ? join(homedir(), '.codex', 'hooks.json')
        : join(homedir(), '.claude', 'settings.json');
    if (agent === 'codex') {
        const tomlPath = join(homedir(), '.codex', 'config.toml');
        try {
            const toml = await readFile(tomlPath, 'utf8');
            if (/^\s*\[\[?hooks(?:\.|\])?/m.test(toml)) {
                warnings.push('~/.codex/config.toml appears to contain inline hooks. Codex will merge them with hooks.json and may warn about using both representations in one config layer.');
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    const { document, exists } = await readJson(path);
    const command = buildHookCommand(agent, executablePath);
    const changed = appendStopHook(document, agent, command);
    if (!changed)
        return { agent, path, changed: false, warnings };
    const backupPath = await writeJsonWithBackup(path, document, exists);
    return {
        agent,
        path,
        changed: true,
        warnings,
        ...(backupPath ? { backupPath } : {})
    };
}
export function addStopHookForTest(document, agent, command) {
    return appendStopHook(document, agent, command);
}
