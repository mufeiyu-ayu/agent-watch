import { basename } from 'node:path';
export function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
export function truncate(value, maxChars) {
    if (value.length <= maxChars)
        return value;
    if (maxChars <= 1)
        return '…'.slice(0, maxChars);
    return `${value.slice(0, maxChars - 1)}…`;
}
export function normalizeHook(agent, payload, options) {
    const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd();
    const project = basename(cwd) || cwd;
    const event = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'Stop';
    const rawSummary = typeof payload.last_assistant_message === 'string'
        ? normalizeWhitespace(payload.last_assistant_message)
        : '';
    return {
        agent,
        project,
        event,
        ...(options.includeSummary && rawSummary
            ? { summary: truncate(rawSummary, options.summaryMaxChars) }
            : {})
    };
}
export function shouldNotifyStop(agent, payload) {
    if (agent !== 'claude')
        return true;
    const backgroundTasks = Array.isArray(payload.background_tasks) ? payload.background_tasks : [];
    const sessionCrons = Array.isArray(payload.session_crons) ? payload.session_crons : [];
    return backgroundTasks.length === 0 && sessionCrons.length === 0;
}
export function displayAgent(agent) {
    return agent === 'claude' ? 'Claude Code' : 'Codex';
}
