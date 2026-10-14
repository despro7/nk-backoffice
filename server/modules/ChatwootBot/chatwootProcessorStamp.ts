import os from 'os';
import { CHATWOOT_BOT_HANDOVER_BUILD } from '../../../shared/types/chatwootBot.js';

let cached: string | null = null;

/** Ідентифікатор цього Node-процесу (для журналу webhook / handover). */
export function getChatwootProcessorStamp(): string {
  if (!cached) {
    cached = `build=${CHATWOOT_BOT_HANDOVER_BUILD};host=${os.hostname()};pid=${process.pid}`;
  }
  return cached;
}
