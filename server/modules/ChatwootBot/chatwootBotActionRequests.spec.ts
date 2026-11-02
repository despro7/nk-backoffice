import { describe, expect, it } from 'vitest';
import { DEFAULT_CHATWOOT_BOT_SETTINGS } from '../../../shared/types/chatwootBot.js';
import { buildActionRequests, matchScenario } from './chatwootBotActionRequests.js';

const priceScenario = {
  id: 'price',
  title: 'Надіслати прайс',
  enabled: true,
  triggers: ['Надішліть прайс', 'Скиньте ціни'],
  instructions: 'Виклич get_storefront_catalog і дай посилання на каталог.',
};

describe('action requests', () => {
  it('groups similar requests and finds a scenario or built-in tool', () => {
    const result = buildActionRequests(
      [
        { text: 'Надіслати прайс', count: 3 },
        { text: 'Надіслати прайс-лист', count: 1 },
        { text: 'Скасувати замовлення', count: 2 },
        { text: 'Змінити адресу доставки', count: 1 },
      ],
      { ...DEFAULT_CHATWOOT_BOT_SETTINGS, orderCancelEnabled: false, actionScenarios: [priceScenario] },
    );
    const byLabel = new Map(result.map((r) => [r.label, r]));
    expect(byLabel.get('Надіслати прайс')).toMatchObject({ count: 4, solution: { kind: 'scenario', scenarioId: 'price' } });
    expect(byLabel.get('Скасувати замовлення')?.solution).toMatchObject({ kind: 'tool', enabled: false });
    expect(byLabel.get('Змінити адресу доставки')?.solution.kind).toBe('none');
  });

  it('matches scenarios by triggers, not by unrelated words', () => {
    expect(matchScenario('скиньте будь ласка ціни', [priceScenario])?.id).toBe('price');
    expect(matchScenario('змінити адресу', [priceScenario])).toBeNull();
  });
});
