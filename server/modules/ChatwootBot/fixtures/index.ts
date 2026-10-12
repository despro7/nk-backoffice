import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ChatwootWebhookMessageCreated } from '../../../../shared/types/chatwootBot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ChatwootBotFixtureName = 'echo' | 'handover';

function loadFixture(fileName: string): ChatwootWebhookMessageCreated {
  const raw = readFileSync(join(__dirname, fileName), 'utf8');
  return JSON.parse(raw) as ChatwootWebhookMessageCreated;
}

export const CHATWOOT_BOT_FIXTURES: Record<ChatwootBotFixtureName, ChatwootWebhookMessageCreated> = {
  echo: loadFixture('messageCreated.echo.json'),
  handover: loadFixture('messageCreated.handover.json'),
};

export function getChatwootBotFixture(
  name: ChatwootBotFixtureName,
): ChatwootWebhookMessageCreated {
  return { ...CHATWOOT_BOT_FIXTURES[name] };
}
