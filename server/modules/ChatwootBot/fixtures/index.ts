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

let fixturesCache: Record<ChatwootBotFixtureName, ChatwootWebhookMessageCreated> | null =
  null;

function getFixturesCache(): Record<ChatwootBotFixtureName, ChatwootWebhookMessageCreated> {
  if (!fixturesCache) {
    fixturesCache = {
      echo: loadFixture('messageCreated.echo.json'),
      handover: loadFixture('messageCreated.handover.json'),
    };
  }
  return fixturesCache;
}

/** Лише для simulate / тестів — не викликати на старті сервера. */
export function getChatwootBotFixture(
  name: ChatwootBotFixtureName,
): ChatwootWebhookMessageCreated {
  return { ...getFixturesCache()[name] };
}
