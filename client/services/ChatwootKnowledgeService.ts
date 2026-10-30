import type {
  ChatwootBotKnowledgeEntry,
  ChatwootBotKnowledgeEntryInput,
  ChatwootBotKnowledgeSearchHit,
} from '@shared/types/chatwootBotKnowledge';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data.data as T;
}

const BASE = '/api/chatwoot-knowledge';

export const chatwootKnowledgeApi = {
  async list(): Promise<ChatwootBotKnowledgeEntry[]> {
    return parseJson(await fetch(BASE, { credentials: 'include' }));
  },

  async create(input: ChatwootBotKnowledgeEntryInput): Promise<ChatwootBotKnowledgeEntry> {
    return parseJson(
      await fetch(BASE, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async update(id: number, input: ChatwootBotKnowledgeEntryInput): Promise<ChatwootBotKnowledgeEntry> {
    return parseJson(
      await fetch(`${BASE}/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  },

  async remove(id: number): Promise<void> {
    await parseJson(await fetch(`${BASE}/${id}`, { method: 'DELETE', credentials: 'include' }));
  },

  async search(query: string): Promise<ChatwootBotKnowledgeSearchHit[]> {
    return parseJson(
      await fetch(`${BASE}/search`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }),
    );
  },
};
