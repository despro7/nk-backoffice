import { describe, expect, it } from 'vitest';
import {
  buildIngredientsJsonFromBom,
  buildKitComponentsHtml,
  buildStorefrontBoundValues,
  buildStorefrontDescriptionDocFromPreset,
  storefrontDescriptionNeedsPresetSync,
  syncStorefrontDescriptionDocWithPreset,
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
  it('removes disabled preset blocks from saved doc on sync', () => {
    const presetBlocks = [
      { id: 'netWeight', label: 'Net', enabled: true, resolver: 'netWeight' as const, template: '{{netWeight}}', metaKeyId: null },
      { id: 'grossWeight', label: 'Gross', enabled: false, resolver: 'grossWeight' as const, template: '{{grossWeight}}', metaKeyId: null },
    ];
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'storefrontBlock', attrs: { blockId: 'netWeight', resolver: 'netWeight', template: '{{netWeight}}', overrideContent: null } },
        { type: 'storefrontBlock', attrs: { blockId: 'grossWeight', resolver: 'grossWeight', template: '{{grossWeight}}', overrideContent: null } },
      ],
    };

    expect(storefrontDescriptionNeedsPresetSync(doc, presetBlocks)).toBe(true);
    const synced = syncStorefrontDescriptionDocWithPreset(doc, presetBlocks);
    expect(walkStorefrontDescriptionBlocks(synced).map((block) => block.blockId)).toEqual(['netWeight']);
  });

  it('syncs saved doc block order with preset', () => {
    const presetBlocks = [
      { id: 'natural', label: 'A', enabled: true, resolver: 'template' as const, template: 'a', metaKeyId: null },
      { id: 'kitComponents', label: 'Kit', enabled: true, resolver: 'kitComponents' as const, template: '{{kitComponents}}', metaKeyId: null },
      { id: 'nutrition', label: 'N', enabled: true, resolver: 'nutrition' as const, template: '{{nutrition}}', metaKeyId: null },
    ];
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'storefrontBlock', attrs: { blockId: 'natural', resolver: 'template', template: 'a', overrideContent: null } },
        { type: 'storefrontBlock', attrs: { blockId: 'nutrition', resolver: 'nutrition', template: '{{nutrition}}', overrideContent: null } },
        { type: 'storefrontBlock', attrs: { blockId: 'kitComponents', resolver: 'kitComponents', template: '{{kitComponents}}', overrideContent: null } },
      ],
    };

    expect(storefrontDescriptionNeedsPresetSync(doc, presetBlocks, { isKit: true })).toBe(true);
    const synced = syncStorefrontDescriptionDocWithPreset(doc, presetBlocks, { isKit: true });
    const order = walkStorefrontDescriptionBlocks(synced).map((block) => block.resolver);
    expect(order).toEqual(['template', 'kitComponents', 'nutrition']);
  });

  it('builds kit doc with kitComponents and without ingredients', () => {
    const doc = buildStorefrontDescriptionDocFromPreset(STOREFRONT_DEFAULT_BLOCKS, { isKit: true });
    const blocks = walkStorefrontDescriptionBlocks(doc);
    expect(blocks.some((b) => b.resolver === 'kitComponents')).toBe(true);
    expect(blocks.some((b) => b.resolver === 'ingredients')).toBe(false);
  });

  it('renders inline-only list items in storefront description html', () => {
    const html = resolveStorefrontDescriptionDocHtml(
      {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 5 },
            content: [{ type: 'text', text: 'Способи розігріву:' }],
          },
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'text', text: 'Розігріти у мікрохвильовій печі 2 хвилини.' }],
              },
              {
                type: 'listItem',
                content: [{ type: 'text', text: 'Розігріти на сковорідці 5–7 хвилин.' }],
              },
            ],
          },
        ],
      },
      {
        ingredients: '',
        nutrition: '',
        netWeight: '',
        grossWeight: '',
        storage: '',
        heating: '',
        salt: '',
        kitComponents: '',
      },
      [],
    );
    expect(html).toContain('<h5>Способи розігріву:</h5>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>Розігріти у мікрохвильовій печі 2 хвилини.</li>');
    expect(html).toContain('<li>Розігріти на сковорідці 5–7 хвилин.</li>');
  });

  it('renders heading nodes in storefront description html', () => {
    const html = resolveStorefrontDescriptionDocHtml(
      {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Заголовок набору' }],
          },
        ],
      },
      {
        ingredients: '',
        nutrition: '',
        netWeight: '',
        grossWeight: '',
        storage: '',
        heating: '',
        salt: '',
        kitComponents: '',
      },
      [],
    );
    expect(html).toBe('<h3>Заголовок набору</h3>');
  });

  it('builds doc from preset with storefront blocks', () => {
    const doc = buildStorefrontDescriptionDocFromPreset(STOREFRONT_DEFAULT_BLOCKS);
    const blocks = walkStorefrontDescriptionBlocks(doc);
    expect(blocks.some((b) => b.resolver === 'ingredients')).toBe(true);
    const html = resolveStorefrontDescriptionDocHtml(
      doc,
      {
        ingredients: 'картопля',
        nutrition: '<p>Білки 1г</p>',
        netWeight: '300г',
        grossWeight: '320г',
        storage: '',
        heating: '',
        salt: '',
        kitComponents: '',
      },
      [],
      { isKit: false },
    );
    expect(html).toContain('картопля');
  });

  it('skips ingredients block for kits in saved doc', () => {
    const doc = buildStorefrontDescriptionDocFromPreset(STOREFRONT_DEFAULT_BLOCKS, { isKit: true });
    const html = resolveStorefrontDescriptionDocHtml(
      doc,
      {
        ingredients: 'борщ, плов',
        nutrition: '',
        netWeight: '',
        grossWeight: '',
        storage: '',
        heating: '',
        salt: '',
        kitComponents: '',
      },
      [],
      {
        isKit: true,
        kitComponentRows: [
          { componentName: 'Борщ', qty: 2, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
        ],
      },
    );
    expect(html).not.toContain('борщ, плов');
    expect(html).toContain('Борщ');
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

describe('nutrition split placeholders', () => {
  it('buildStorefrontBoundValues exposes proteins/fats/carbs/energy separately', () => {
    const values = buildStorefrontBoundValues({
      ingredientsJson: [],
      nutrition: { proteins: '4,4', fats: '3,1', carbs: '5,0', energy: '68' },
      netLabel: '',
      grossLabel: '',
      storageTemplate: '',
      heatingTemplate: '',
      saltTemplate: '',
      kitComponentsHtml: '',
    });
    expect(values.proteins).toBe('4,4');
    expect(values.fats).toBe('3,1');
    expect(values.carbs).toBe('5,0');
    expect(values.energy).toBe('68');
  });

  it('substitutes split nutrition placeholders in custom template', () => {
    const template = '<p>Білки {{proteins}} г · Жири {{fats}} г</p>';
    const values = buildStorefrontBoundValues({
      ingredientsJson: [],
      nutrition: { proteins: '2,5', fats: '1,2', carbs: '8,0', energy: '55' },
      netLabel: '',
      grossLabel: '',
      storageTemplate: '',
      heatingTemplate: '',
      saltTemplate: '',
      kitComponentsHtml: '',
    });
    const html = substituteStorefrontPlaceholders(template, values);
    expect(html).toContain('Білки 2,5 г');
    expect(html).toContain('Жири 1,2 г');
  });

  it('renders nutrition block from preset with split placeholders', () => {
    const doc = buildStorefrontDescriptionDocFromPreset(STOREFRONT_DEFAULT_BLOCKS);
    const nutritionBlock = doc.content.find(
      (node) => node.type === 'storefrontBlock' && node.attrs?.blockId === 'nutrition',
    );
    expect(nutritionBlock?.attrs?.template).toContain('{{proteins}}');

    const placeholders = buildStorefrontBoundValues({
      ingredientsJson: [],
      nutrition: { proteins: '2,5', fats: '1,2', carbs: '8,0', energy: '55' },
      netLabel: '',
      grossLabel: '',
      storageTemplate: '',
      heatingTemplate: '',
      saltTemplate: '',
      kitComponentsHtml: '',
    });
    const html = resolveStorefrontDescriptionDocHtml(doc, placeholders, STOREFRONT_DEFAULT_META_KEYS);
    expect(html).toContain('Білки 2,5 г');
    expect(html).toContain('Енергетична цінність 55 ккал');
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

  it('unwraps single paragraph inside list items', () => {
    expect(
      normalizeStorefrontBlockHtml(`<ul><li><p><strong>one</strong></p></li></ul>`),
    ).toBe(`<ul><li><strong>one</strong></li></ul>`);
  });

  it('unwraps multiple paragraphs inside list items', () => {
    expect(
      normalizeStorefrontBlockHtml(`<ol><li><p>one</p><p></p></li><li><p>two</p></li></ol>`),
    ).toBe(`<ol><li>one</li><li>two</li></ol>`);
  });

  it('unwraps paragraphs inside nested list items', () => {
    expect(
      normalizeStorefrontBlockHtml(
        `<ol><li><p>outer</p><ol><li><p>inner</p></li></ol></li></ol>`,
      ),
    ).toBe(`<ol><li>outer<ol><li>inner</li></ol></li></ol>`);
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
