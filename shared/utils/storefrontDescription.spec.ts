import { describe, expect, it } from 'vitest';
import {
  buildIngredientsJsonFromBom,
  buildKitComponentsHtml,
  buildStorefrontBoundValues,
  buildStorefrontDescriptionDocFromPreset,
  formatIngredientsList,
  formatProductNutritionHtml,
  ingredientsListsEqual,
  isArchiveFolderName,
  isStorefrontProtectedBoundResolver,
  isStorefrontTemplateBoundBlock,
  getStorefrontBoundBlockEmptyMessage,
  normalizeIngredientTag,
  parseProductIngredientsJson,
  resolveGrossWeightKg,
  resolveStorefrontDescriptionDocHtml,
  resolveStorefrontPublishStatus,
  resolveStorefrontTemplate,
  substitutePlaceholders,
  substituteStorefrontPlaceholders,
  templateFromStorefrontEditorHtml,
  templateHtmlForStorefrontEditor,
  templateHtmlForStorefrontEditorLive,
  normalizeStorefrontBlockHtml,
  normalizeStorefrontDescriptionDoc,
  walkStorefrontDescriptionBlocks,
} from './storefrontDescription.js';
import { STOREFRONT_DEFAULT_BLOCKS, STOREFRONT_DEFAULT_META_KEYS } from '../constants/storefrontDefaults.js';

describe('resolveStorefrontPublishStatus', () => {
  it('returns draft when doNotPublish', () => {
    expect(resolveStorefrontPublishStatus({ doNotPublish: true })).toBe('draft');
  });

  it('returns draft for archive folder', () => {
    expect(
      resolveStorefrontPublishStatus({ parentFolderName: 'Архів – Супи' }),
    ).toBe('draft');
  });

  it('returns publish otherwise', () => {
    expect(resolveStorefrontPublishStatus({ doNotPublish: false })).toBe('publish');
  });
});

describe('isArchiveFolderName', () => {
  it('matches archive folder names', () => {
    expect(isArchiveFolderName('Архів – Набори')).toBe(true);
    expect(isArchiveFolderName('Архів- Супи')).toBe(true);
    expect(isArchiveFolderName('Готова продукція')).toBe(false);
  });
});

describe('substitutePlaceholders', () => {
  it('replaces net and gross placeholders', () => {
    const text = 'Нетто {{netWeight}}, брутто {{grossWeight}}';
    expect(
      substitutePlaceholders(text, { netWeight: '300г', grossWeight: '320г' }),
    ).toBe('Нетто 300г, брутто 320г');
  });
});

describe('substituteStorefrontPlaceholders', () => {
  it('wraps ingredients with semantic and WC meta placeholders', () => {
    const text = 'Склад: {{ingredients}} / {{_nk_ingredients}}';
    expect(
      substituteStorefrontPlaceholders(
        text,
        { ingredients: 'картопля, морква' },
        STOREFRONT_DEFAULT_META_KEYS,
      ),
    ).toBe('Склад: картопля, морква / картопля, морква');
  });
});

describe('resolveStorefrontTemplate', () => {
  it('defaults to primary placeholder when template is empty', () => {
    expect(
      resolveStorefrontTemplate('', 'ingredients', 'картопля', {
        ingredients: 'картопля',
      }),
    ).toBe('картопля');
  });

  it('wraps primary value with custom template', () => {
    expect(
      resolveStorefrontTemplate('Склад: {{ingredients}}', 'ingredients', 'картопля', {
        ingredients: 'картопля',
      }),
    ).toBe('Склад: картопля');
  });
});

describe('ingredients json helpers', () => {
  it('normalizes tags to lowercase', () => {
    expect(normalizeIngredientTag(' Картопля ')).toBe('картопля');
    expect(buildIngredientsJsonFromBom([{ componentName: 'Морква' }])).toEqual(['морква']);
    expect(formatIngredientsList(['Картопля', 'морква'])).toBe('картопля, морква');
  });

  it('compares ingredient lists', () => {
    expect(ingredientsListsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(ingredientsListsEqual(['a'], ['b'])).toBe(false);
  });

  it('parses product ingredients json', () => {
    expect(parseProductIngredientsJson('["картопля","морква"]')).toEqual(['картопля', 'морква']);
  });
});

describe('protected bound resolvers', () => {
  it('includes ingredients nutrition netWeight grossWeight', () => {
    expect(isStorefrontProtectedBoundResolver('ingredients')).toBe(true);
    expect(isStorefrontProtectedBoundResolver('nutrition')).toBe(true);
    expect(isStorefrontProtectedBoundResolver('netWeight')).toBe(true);
    expect(isStorefrontProtectedBoundResolver('grossWeight')).toBe(true);
    expect(isStorefrontProtectedBoundResolver('storage')).toBe(false);
  });

  it('detects template-bound blocks', () => {
    expect(isStorefrontTemplateBoundBlock('ingredients')).toBe(true);
    expect(isStorefrontTemplateBoundBlock('kitComponents')).toBe(true);
    expect(isStorefrontTemplateBoundBlock('heating')).toBe(false);
  });

  it('returns specific empty-state messages', () => {
    expect(getStorefrontBoundBlockEmptyMessage('nutrition')).toBe(
      'Дані КБЖВ ще не заповнені у полях товару',
    );
    expect(getStorefrontBoundBlockEmptyMessage('ingredients')).toBe(
      'Дані складу ще не заповнені у полях товару',
    );
  });
});

describe('storefront description doc', () => {
  it('builds doc from preset with storefront blocks', () => {
    const doc = buildStorefrontDescriptionDocFromPreset(STOREFRONT_DEFAULT_BLOCKS);
    const blocks = walkStorefrontDescriptionBlocks(doc);
    expect(blocks.some((b) => b.resolver === 'ingredients')).toBe(true);
    const html = resolveStorefrontDescriptionDocHtml(doc, {
      ingredients: 'картопля',
      nutrition: '<p>Білки 1г</p>',
      netWeight: '300г',
      grossWeight: '320г',
      storage: '',
      heating: '',
      salt: '',
      kitComponents: '',
    });
    expect(html).toContain('картопля');
  });
});

describe('buildKitComponentsHtml', () => {
  it('renders BOM as ul/li', () => {
    const html = buildKitComponentsHtml([
      { componentName: 'Борщ', qty: 2 },
      { componentName: 'Каша', qty: 1 },
    ]);
    expect(html).toContain('<ul>');
    expect(html).toContain('Борщ × 2');
    expect(html).toContain('Каша × 1');
  });
});

describe('resolveGrossWeightKg', () => {
  it('prefers manual override', () => {
    const result = resolveGrossWeightKg({
      grossWeight: 0.35,
      weight: 0.3,
      specQty: 1,
      isKit: false,
      components: [],
      units: [],
    });
    expect(result).toEqual({ kg: 0.35, source: 'override' });
  });

  it('computes from BOM with mass units', () => {
    const result = resolveGrossWeightKg({
      grossWeight: null,
      weight: 0.3,
      specQty: 1,
      isKit: false,
      components: [
        {
          componentName: 'Вода',
          qty: 200,
          unitId: 'g',
          componentWeight: null,
          cookingLossPercent: 0,
        },
      ],
      units: [{ id: 'g', name: 'г', code: 'g' }],
    });
    expect(result.source).toBe('computed');
    expect(result.kg).toBe(0.2);
  });
});

describe('formatProductNutritionHtml with salt', () => {
  it('includes salt line when present', () => {
    const html = formatProductNutritionHtml({
      proteins: '4',
      fats: '3',
      carbs: '5',
      energy: '68',
      salt: '1,2',
    });
    expect(html).toContain('Сіль 1,2г');
  });
});

describe('storefront template editor html', () => {
  it('wraps placeholders for TipTap atoms', () => {
    const html = templateHtmlForStorefrontEditor('<p><strong>Склад: </strong>{{ingredients}}</p>');
    expect(html).toContain('data-storefront-placeholder="ingredients"');
    expect(html).toContain('{{ingredients}}');
  });

  it('embeds live placeholder values for bound-block template editing', () => {
    const html = templateHtmlForStorefrontEditorLive('<p><strong>Склад: </strong>{{ingredients}}</p>', {
      ...buildStorefrontBoundValues({
        ingredientsJson: ['борошно', 'вода'],
        nutrition: null,
        netLabel: '',
        grossLabel: '',
        storageTemplate: '',
        heatingTemplate: '',
        saltTemplate: '',
        kitComponentsHtml: '',
      }),
    });
    expect(html).toContain('data-storefront-placeholder="ingredients"');
    expect(html).toContain('борошно, вода');
    expect(html).not.toContain('{{ingredients}}');
  });

  it('shows empty-state label for missing live placeholder values', () => {
    const html = templateHtmlForStorefrontEditorLive('<p>Маса нетто: {{netWeight}}</p>', {
      ...buildStorefrontBoundValues({
        ingredientsJson: [],
        nutrition: null,
        netLabel: '',
        grossLabel: '',
        storageTemplate: '',
        heatingTemplate: '',
        saltTemplate: '',
        kitComponentsHtml: '',
      }),
    });
    expect(html).toContain('немає даних');
  });

  it('serializes TipTap html back to template placeholders', () => {
    const editable = templateHtmlForStorefrontEditorLive(
      '<p>Маса нетто: {{netWeight}}</p>',
      buildStorefrontBoundValues({
        ingredientsJson: [],
        nutrition: null,
        netLabel: '250 г',
        grossLabel: '',
        storageTemplate: '',
        heatingTemplate: '',
        saltTemplate: '',
        kitComponentsHtml: '',
      }),
    );
    expect(templateFromStorefrontEditorHtml(editable)).toBe('<p>Маса нетто: {{netWeight}}</p>');
  });

  it('strips trailing empty paragraphs from block html', () => {
    const html = `<p>Способи розігріву:</p><ol><li>one</li></ol><p></p>`;
    expect(normalizeStorefrontBlockHtml(html)).toBe(
      `<p>Способи розігріву:</p><ol><li>one</li></ol>`,
    );
    expect(
      normalizeStorefrontBlockHtml(
        `<p>Способи розігріву:</p><ol><li>one</li></ol><p><br class="ProseMirror-trailingBreak"></p>`,
      ),
    ).toBe(`<p>Способи розігріву:</p><ol><li>one</li></ol>`);
  });

  it('normalizes doc trailing empty paragraphs and block overrides', () => {
    const doc = normalizeStorefrontDescriptionDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { class: 'storefront-marketing' }, content: [] },
        {
          type: 'storefrontBlock',
          attrs: {
            blockId: 'heating',
            resolver: 'heating',
            template: '<p>title</p><ol><li>x</li></ol>',
            overrideContent: '<p>title</p><ol><li>x</li></ol><p></p>',
          },
        },
        { type: 'paragraph', content: [] },
      ],
    });
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[1]?.attrs?.overrideContent).toBe('<p>title</p><ol><li>x</li></ol>');
  });
});
