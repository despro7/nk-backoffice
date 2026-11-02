import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn(async (_args: unknown) => ({}));

vi.mock('../../lib/utils.js', () => ({
  prisma: { chatwootBotTurn: { create: (args: unknown) => create(args) } },
  logServer: vi.fn(),
}));

const { chatwootBotTurnLogService: turnLog, compactLlmMeta } = await import('./ChatwootBotTurnLogService.js');

const base = { conversationId: 7, messageId: 70, inboxId: 1, customerText: 'Де замовлення?', inHours: true, dryRun: false };

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ChatwootBotTurnLogService', () => {
  beforeEach(() => create.mockClear());

  it('collects outcome and replies from nested async calls and persists once', async () => {
    await turnLog.run(async () => {
      turnLog.begin(base);
      await Promise.resolve();
      turnLog.note({ outcome: 'handover', detail: 'operator_requested' });
      // Та сама гілка, що й для ключового слова, не перезаписує причину.
      turnLog.note({ outcome: 'handover_keyword' }, { keepOutcome: true });
      turnLog.noteReply('Передаю оператору');
    });
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      data: { conversationId: 7, outcome: 'handover', detail: 'operator_requested', replies: ['Передаю оператору'] },
    });
  });

  it('skips turns without outcome and calls outside run', async () => {
    turnLog.begin(base);
    turnLog.note({ outcome: 'llm' });
    await turnLog.run(async () => {
      turnLog.begin(base);
    });
    await flush();
    expect(create).not.toHaveBeenCalled();
  });

  it('isolates concurrent conversations', async () => {
    await Promise.all(
      [1, 2].map((id) =>
        turnLog.run(async () => {
          turnLog.begin({ ...base, conversationId: id });
          await new Promise((resolve) => setTimeout(resolve, id === 1 ? 5 : 0));
          turnLog.note({ outcome: 'llm' });
          turnLog.noteReply(`reply ${id}`);
        }),
      ),
    );
    await flush();
    const saved = create.mock.calls.map(([args]) => (args as { data: { conversationId: number; replies: string[] } }).data);
    expect(saved.find((d) => d.conversationId === 1)?.replies).toEqual(['reply 1']);
    expect(saved.find((d) => d.conversationId === 2)?.replies).toEqual(['reply 2']);
  });

  it('truncates large tool results', () => {
    const meta = compactLlmMeta({
      provider: 'openai',
      model: 'm',
      finishReason: 'stop',
      latencyMs: 1,
      toolTrace: [{ step: 1, apiRound: 1, name: 'get_storefront_catalog', arguments: {}, result: { items: 'x'.repeat(70_000) } }],
    });
    expect(String(meta.toolTrace?.[0].result)).toContain('(обрізано)');
  });
});
