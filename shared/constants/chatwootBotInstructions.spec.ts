import { describe, expect, it } from 'vitest';
import { CHATWOOT_BOT_LLM_TOOLS } from './chatwootBotLlmTools.js';
import {
  CHATWOOT_BOT_INSTRUCTIONS,
  botInstruction,
  normalizeInstructionOverrides,
} from './chatwootBotInstructions.js';

describe('chatwoot bot instructions', () => {
  it('has unique keys and a description entry for every tool', () => {
    const keys = CHATWOOT_BOT_INSTRUCTIONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const tool of CHATWOOT_BOT_LLM_TOOLS) expect(keys).toContain(`tool.${tool.name}`);
  });

  it('uses the override when present, the default otherwise', () => {
    expect(botInstruction({ 'cancel.cancelled': 'Готово.' }, 'cancel.cancelled')).toBe('Готово.');
    expect(botInstruction({ 'cancel.cancelled': '   ' }, 'cancel.cancelled')).toMatch(/^Замовлення скасовано/);
    expect(botInstruction(undefined, 'tool.request_operator')).toBe(
      CHATWOOT_BOT_LLM_TOOLS.find((t) => t.name === 'request_operator')?.description,
    );
  });

  it('keeps only known keys that differ from the default', () => {
    const defaultText = botInstruction(undefined, 'policy.gender');
    expect(
      normalizeInstructionOverrides({
        'policy.gender': defaultText,
        'policy.operator': '  Інакше  ',
        unknown: 'x',
        'cancel.cancelled': 42,
      }),
    ).toEqual({ 'policy.operator': 'Інакше' });
  });
});
