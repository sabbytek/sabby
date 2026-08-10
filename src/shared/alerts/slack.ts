import { env } from '../../config/env.js';

export interface SlackErrorContext {
  message: string;
  code?: string;
  statusCode: number;
  method: string;
  url: string;
  requestId?: string;
  stack?: string;
}

// Fire-and-forget — alerting must never slow down or fail the request/response cycle.
export function notifySlackError(ctx: SlackErrorContext): void {
  if (!env.SLACK_WEBHOOK_URL) return;

  const header = `:rotating_light: *${String(ctx.statusCode)}${ctx.code ? ` ${ctx.code}` : ''}* — ${ctx.method} ${ctx.url}`;
  const lines = [
    header,
    ctx.message,
    ctx.requestId ? `requestId: \`${ctx.requestId}\`` : null,
    ctx.stack ? `\`\`\`${ctx.stack.slice(0, 1500)}\`\`\`` : null,
  ].filter((line): line is string => line !== null);

  void fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines.join('\n') }),
  }).catch(() => {
    // Slack delivery is best-effort; swallow so alerting failures never surface to the caller.
  });
}
