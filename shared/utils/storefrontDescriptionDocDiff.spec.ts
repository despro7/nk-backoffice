import { describe, expect, it } from 'vitest';
import { diffStorefrontDescriptionDocs, summarizeStorefrontDescriptionDocDiff } from './storefrontDescriptionDocDiff.js';

describe('storefrontDescriptionDocDiff', () => {
  it('reports changed block when same count but different content', () => {
    const local = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'natural',
            resolver: 'template',
            template: 'Текст A',
            overrideContent: null,
          },
        },
      ],
    });
    const remote = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'natural',
            resolver: 'template',
            template: 'Текст B',
            overrideContent: null,
          },
        },
      ],
    });

    const summary = summarizeStorefrontDescriptionDocDiff(local, remote);
    expect(summary.diffCount).toBe(1);
    expect(summary.lines[0]).toContain('natural');
  });

  it('ignores redundant overrideContent when HTML matches template', () => {
    const template =
      '<p><strong>Термін придатності – 11 місяців.</strong><br>Зберігати за температури від 0°С до 25°С.</p>';
    const plainOverride =
      'Термін придатності – 11 місяців. Зберігати за температури від 0°С до 25°С.';
    const local = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'storage',
            resolver: 'storage',
            template,
            overrideContent: null,
          },
        },
      ],
    });
    const remote = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'storage',
            resolver: 'storage',
            template,
            overrideContent: plainOverride,
          },
        },
      ],
    });

    expect(summarizeStorefrontDescriptionDocDiff(local, remote).diffCount).toBe(0);
  });

  it('reports only_remote when WC has extra block', () => {
    const local = JSON.stringify({ type: 'doc', content: [] });
    const remote = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'natural',
            resolver: 'template',
            template: 'Текст',
            overrideContent: null,
          },
        },
      ],
    });

    expect(diffStorefrontDescriptionDocs(local, remote)).toHaveLength(1);
  });

  it('matches storefront blocks by blockId despite different order', () => {
    const block = (blockId: string, template: string) => ({
      type: 'storefrontBlock',
      attrs: { blockId, resolver: 'template', template, overrideContent: null },
    });
    const local = JSON.stringify({
      type: 'doc',
      content: [block('kitComponents', 'A'), block('natural', 'B')],
    });
    const remote = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { class: 'storefront-marketing' },
          content: [{ type: 'text', text: 'Маркетинг' }],
        },
        block('natural', 'B'),
        block('kitComponents', 'A'),
      ],
    });

    expect(summarizeStorefrontDescriptionDocDiff(local, remote).diffCount).toBe(1);
  });

  it('detects manualExclude mismatch on same blockId', () => {
    const local = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'natural',
            resolver: 'template',
            template: 'Натуральні.',
            overrideContent: null,
            manualExclude: true,
          },
        },
      ],
    });
    const remote = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'natural',
            resolver: 'template',
            template: 'Натуральні.',
            overrideContent: null,
            manualExclude: null,
          },
        },
      ],
    });

    expect(summarizeStorefrontDescriptionDocDiff(local, remote).diffCount).toBe(1);
  });
});
