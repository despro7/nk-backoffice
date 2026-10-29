import type { ChatwootBotEventRecord } from '@shared/types/chatwootBot';

function compressHandoverTrace(traceBody: string): string {
  const bits: string[] = [];
  if (traceBody.includes('bot_handoff:ok')) bits.push('handoff✓');
  else if (traceBody.includes('bot_handoff:start')) bits.push('handoff…');
  if (/auto_inbox:assignee=#\d+/.test(traceBody)) {
    bits.push(traceBody.match(/auto_inbox:assignee=#\d+/)?.[0] ?? 'assign✓');
  } else if (traceBody.includes('auto_inbox:assignee=none') || traceBody.includes('skip:auto_inbox')) {
    bits.push('assign:none');
  } else if (traceBody.includes('assign:via_')) {
    bits.push(traceBody.match(/assign:via_\w+/)?.[0] ?? 'assign✓');
  }
  if (traceBody.includes('public_message:ok')) bits.push('msg✓');
  if (traceBody.includes('private_note:ok')) bits.push('note✓');
  if (traceBody.includes('custom_attributes:ok')) bits.push('attrs✓');
  return bits.join(' ');
}

export function formatEventLogDetails(details: string): string {
  const trimmed = details.trim();

  if (
    trimmed.includes('<!DOCTYPE') ||
    trimmed.includes('<html') ||
    /HTML\s+\d{3}/i.test(trimmed)
  ) {
    const step = trimmed.match(/handover step=[^\s·]+/)?.[0];
    const proc = trimmed.match(/build=[^;]+;host=[^;]+;pid=\d+/)?.[0];
    const title = trimmed.match(/<title>\s*([^<]+)/i)?.[1]?.replace(/\s+/g, ' ').trim();
    const summary = title ? `HTML ${title}` : 'HTML-відповідь проксі';
    return [step, proc, summary].filter(Boolean).join(' · ');
  }

  const stepErr = trimmed.match(/handover step=[^\s·]+/)?.[0];
  const proc = trimmed.match(/build=[^;]+;host=[^;]+;pid=\d+/)?.[0];
  const mode = trimmed.match(/mode=\w+/)?.[0];
  const hours = trimmed.match(/hours=(?:in|ooh)/)?.[0];
  const assign =
    trimmed.match(/auto_inbox:(?:#\d+|none)/)?.[0] ??
    trimmed.match(/manual:[^\s·]+/)?.[0];
  const traceRaw = trimmed.match(/trace=([^·]+)/)?.[1];

  if (traceRaw || mode || stepErr) {
    const traceShort = traceRaw ? compressHandoverTrace(traceRaw) : '';
    return [mode, hours, assign, traceShort, stepErr, proc].filter(Boolean).join(' · ');
  }

  const max = 220;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function actionColor(
  action: ChatwootBotEventRecord['action'],
): 'success' | 'warning' | 'danger' | 'default' {
  switch (action) {
    case 'echo':
      return 'success';
    case 'handover':
      return 'warning';
    case 'error':
      return 'danger';
    case 'ignored':
      return 'default';
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
