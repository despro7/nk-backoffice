import { describe, expect, it } from 'vitest';
import { stageHtmlToBlocks } from './stageHtmlBlocks';

describe('stageHtmlToBlocks', () => {
  it('порожній опис', () => {
    expect(stageHtmlToBlocks(null)).toEqual([]);
    expect(stageHtmlToBlocks('<p></p>')).toEqual([]);
  });

  it('абзаци з форматуванням і сутностями', () => {
    expect(stageHtmlToBlocks('<p>Довести до <strong>95 &deg;C</strong> &amp; <em>варити</em></p><p>Далі</p>')).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: 'Довести до ' }, { text: '95 &deg;C', bold: true }, { text: ' & ' }, { text: 'варити', italic: true }],
      },
      { kind: 'paragraph', runs: [{ text: 'Далі' }] },
    ]);
  });

  it('списки TipTap з <p> у пунктах, нумерація і вкладеність', () => {
    const blocks = stageHtmlToBlocks(
      '<ol><li><p>Помити</p></li><li><p>Нарізати</p><ul><li><p>кубиком</p></li></ul></li></ol>',
    );
    expect(blocks.map((b) => [b.kind, b.marker, b.level, b.runs.map((r) => r.text).join('')])).toEqual([
      ['item', '1.', 1, 'Помити'],
      ['item', '2.', 1, 'Нарізати'],
      ['item', '•', 2, 'кубиком'],
    ]);
  });

  it('заголовок і текст поза тегами', () => {
    expect(stageHtmlToBlocks('<h3>Увага</h3>просто текст')).toEqual([
      { kind: 'heading', runs: [{ text: 'Увага' }] },
      { kind: 'paragraph', runs: [{ text: 'просто текст' }] },
    ]);
  });
});
