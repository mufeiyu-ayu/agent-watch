import { displayAgent } from './normalize.js';
import { sendPushover } from './providers/pushover.js';
export async function notify(config, notification) {
    const agentName = displayAgent(notification.agent);
    const isStop = notification.event === 'Stop';
    const title = isStop ? `${agentName} finished` : `${agentName}: ${notification.event}`;
    const lines = [notification.project, isStop ? 'Turn finished.' : notification.event];
    if (notification.summary)
        lines.push(notification.summary);
    await sendPushover(config.pushover, {
        title,
        message: lines.join('\n')
    });
}
