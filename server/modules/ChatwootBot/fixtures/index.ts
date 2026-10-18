import type {
  ChatwootBotFixtureName,
  ChatwootWebhookMessageCreated,
} from '../../../../shared/types/chatwootBot.js';

const FIXTURE_ECHO: ChatwootWebhookMessageCreated = {
  event: 'message_created',
  id: 900001,
  content: 'Привіт! Це тестове повідомлення для echo.',
  message_type: 'incoming',
  content_type: 'text',
  private: false,
  conversation: {
    id: 1001,
    inbox_id: 1,
    status: 'pending',
    meta: {
      assignee: null,
    },
  },
  sender: {
    id: 501,
    type: 'contact',
    name: 'Test Contact',
  },
  account: {
    id: 1,
  },
  inbox: {
    id: 1,
  },
};

const FIXTURE_HANDOVER: ChatwootWebhookMessageCreated = {
  event: 'message_created',
  id: 900002,
  content: 'Добрий день, переведіть мене на оператора будь ласка',
  message_type: 'incoming',
  content_type: 'text',
  private: false,
  conversation: {
    id: 1002,
    inbox_id: 1,
    status: 'pending',
    meta: {
      assignee: null,
    },
  },
  sender: {
    id: 502,
    type: 'contact',
    name: 'Handover Contact',
  },
  account: {
    id: 1,
  },
  inbox: {
    id: 1,
  },
};

const FIXTURES: Record<ChatwootBotFixtureName, ChatwootWebhookMessageCreated> = {
  echo: FIXTURE_ECHO,
  handover: FIXTURE_HANDOVER,
};

/** Лише для unit-тестів оркестратора. Без readFile — однаково працює в dev і в dist/. */
export function getChatwootBotFixture(name: ChatwootBotFixtureName): ChatwootWebhookMessageCreated {
  return { ...FIXTURES[name] };
}

export type { ChatwootBotFixtureName };
