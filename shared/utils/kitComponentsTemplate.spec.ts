import { describe, expect, it } from 'vitest';
import { STOREFRONT_BUILTIN_DEFAULTS } from '../constants/storefrontDefaults.js';
import {
  buildKitComponentsLegacyHtml,
  groupKitComponents,
  processKitTemplateConditionals,
  renderKitComponentsTemplate,
} from './kitComponentsTemplate.js';

const LOOP_TEMPLATE = STOREFRONT_BUILTIN_DEFAULTS.kitComponents.template;

const SAMPLE_COMPONENTS = [
  { componentName: 'Борщ зі свининою', qty: 3, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
  { componentName: 'Гороховий суп зі свининою', qty: 3, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
  { componentName: 'Плов зі свининою', qty: 4, componentCategoryName: 'Другі страви', componentWeight: 0.3 },
];

describe('groupKitComponents', () => {
  it('groups by componentCategoryName and sums qty', () => {
    const groups = groupKitComponents([
      { componentName: 'Борщ', qty: 3, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
      { componentName: 'Суп сирний', qty: 3, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
      { componentName: 'Плов', qty: 4, componentCategoryName: 'Другі страви', componentWeight: 0.3 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].groupLabel).toBe('Перші страви');
    expect(groups[0].groupLabelGenitive).toBe('перших страв');
    expect(groups[0].groupTotalQty).toBe(6);
    expect(groups[0].groupItemCount).toBe(2);
    expect(groups[0].groupWeight).toBe('400\u00A0г');
    expect(groups[1].groupLabel).toBe('Другі страви');
    expect(groups[1].groupTotalQty).toBe(4);
    expect(groups[1].groupItemCount).toBe(1);
  });

  it('shows weight range when items in group have different weights', () => {
    const groups = groupKitComponents([
      { componentName: 'Борщ', qty: 6, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
      { componentName: 'Суп', qty: 6, componentCategoryName: 'Перші страви', componentWeight: 0.45 },
    ]);

    expect(groups[0].groupWeight).toBe('400-450\u00A0г');
  });

  it('merges unmapped categories into a single fallback group without header weight', () => {
    const groups = groupKitComponents([
      { componentName: 'Свинина тушкована', qty: 1, componentCategoryName: "М'ясні страви", componentWeight: 0.24 },
      { componentName: 'Узвар з сухофруктів', qty: 1, componentCategoryName: 'Напої', componentWeight: 0.4 },
      { componentName: 'Салат Шахтар', qty: 1, componentCategoryName: 'Салати', componentWeight: 0.45 },
    ], {
      categories: [
        {
          id: 'kit-cat-meat',
          label: "М'ясні страви",
          genitive: "м'ясних страв",
          defaultWeightKg: 0.3,
          defaultWeightMaxKg: 0.39,
          order: 1,
        },
      ],
      fallbackGenitive: 'з інших категорій',
      fallbackDefaultWeightKg: 0.3,
      fallbackOrder: 100,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].groupLabel).toBe("М'ясні страви");
    expect(groups[0].hasGroupWeight).toBe(true);
    expect(groups[0].groupWeight).toBe('240\u00A0г');
    expect(groups[1].groupLabel).toBe('Інші категорії');
    expect(groups[1].groupLabelGenitive).toBe('з інших категорій');
    expect(groups[1].groupTotalQty).toBe(2);
    expect(groups[1].groupItemCount).toBe(2);
    expect(groups[1].hasGroupWeight).toBe(false);
    expect(groups[1].groupWeight).toBe('');
  });

  it('shows configured weight range when items have no individual weight', () => {
    const groups = groupKitComponents(
      [
        { componentName: 'Борщ', qty: 6, componentCategoryName: 'Перші страви' },
        { componentName: 'Суп', qty: 6, componentCategoryName: 'Перші страви' },
      ],
      {
        categories: [
          {
            id: 'kit-cat-first',
            label: 'Перші страви',
            genitive: 'перших страв',
            defaultWeightKg: 0.4,
            defaultWeightMaxKg: 0.45,
            order: 1,
          },
        ],
        fallbackGenitive: 'страв',
        fallbackDefaultWeightKg: 0.3,
        fallbackOrder: 100,
      },
    );

    expect(groups[0].groupWeight).toBe('400-450\u00A0г');
  });
});

describe('processKitTemplateConditionals', () => {
  it('evaluates OR comparisons for group context', () => {
    const html = processKitTemplateConditionals(
      '{{#if groupTotalQty > 1 || groupItemCount > 1}}<p>HEADER</p>{{/if}}',
      { groupTotalQty: 1, groupItemCount: 2 },
    );
    expect(html).toBe('<p>HEADER</p>');
  });

  it('hides block when condition is false', () => {
    const html = processKitTemplateConditionals(
      '{{#if groupTotalQty > 1 || groupItemCount > 1}}<p>HEADER</p>{{/if}}',
      { groupTotalQty: 1, groupItemCount: 1 },
    );
    expect(html).toBe('');
  });
});

describe('renderKitComponentsTemplate', () => {
  it('renders fallback group without weight in header', () => {
    const html = renderKitComponentsTemplate(LOOP_TEMPLATE, [
      { componentName: 'Узвар з сухофруктів', qty: 1, componentCategoryName: 'Напої', componentWeight: 0.4 },
      { componentName: 'Салат Шахтар', qty: 1, componentCategoryName: 'Салати', componentWeight: 0.45 },
    ], {
      categories: [],
      fallbackGenitive: 'з інших категорій',
      fallbackDefaultWeightKg: 0.3,
      fallbackOrder: 100,
    });

    expect(html).toContain('2 порції з інших категорій:');
    expect(html).not.toContain('(по ');
    expect(html).toContain('Узвар з сухофруктів – 1 порція 400\u00A0г');
    expect(html).toContain('Салат Шахтар – 1 порція 450\u00A0г');
  });

  it('renders grouped template with declension and pluralization', () => {
    const html = renderKitComponentsTemplate(LOOP_TEMPLATE, SAMPLE_COMPONENTS);

    expect(html).toContain('6 порцій перших страв (по 400\u00A0г):');
    expect(html).toContain('Борщ зі свининою – 3 порції по 400\u00A0г');
    expect(html).toContain('4 порції других страв (по 300\u00A0г)');
    expect(html).toContain('Плов зі свининою – 4 порції по 300\u00A0г');
  });

  it('hides group header for single portion degustation item', () => {
    const template = `{{#kitGroups}}
{{#if groupTotalQty > 1 || groupItemCount > 1}}
<p><strong>{{groupTotalQty}} порцій {{groupLabelGenitive}}</strong></p>
{{/if}}
<ul>
{{#kitItems}}
<li>{{name}}</li>
{{/kitItems}}
</ul>
{{/kitGroups}}`;

    const html = renderKitComponentsTemplate(template, [
      { componentName: 'Борщ', qty: 1, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
    ]);

    expect(html).not.toContain('порцій перших страв');
    expect(html).toContain('<li>Борщ</li>');
  });

  it('renders flat kitItemsAll list without grouping', () => {
    const template = `{{#kitItemsAll}}
<li>{{name}} – {{itemWeight}}</li>
{{/kitItemsAll}}`;

    const html = renderKitComponentsTemplate(template, SAMPLE_COMPONENTS);

    expect(html).toContain('<li>Борщ зі свининою – 400\u00A0г</li>');
    expect(html).toContain('<li>Плов зі свининою – 300\u00A0г</li>');
    expect(html).not.toContain('порцій перших страв');
  });

  it('falls back to legacy ul for {{kitComponents}} only', () => {
    const html = renderKitComponentsTemplate('{{kitComponents}}', [
      { componentName: 'Борщ', qty: 2, componentCategoryName: 'Перші страви' },
    ]);
    expect(html).toBe(buildKitComponentsLegacyHtml([{ componentName: 'Борщ', qty: 2 }]));
  });

  it('returns empty string for empty BOM', () => {
    expect(renderKitComponentsTemplate(LOOP_TEMPLATE, [])).toBe('');
  });

  it('evaluates item-level qty conditionals inside kitItems', () => {
    const template = `{{#kitGroups}}
<ul>
{{#kitItems}}
<li>{{name}} – {{qty}} {{qtyLabel}} {{#if qty > 1 }}по {{/if}}{{itemWeight}}</li>
{{/kitItems}}
</ul>
{{/kitGroups}}`;

    const single = renderKitComponentsTemplate(template, [
      { componentName: 'Борщ', qty: 1, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
    ]);
    expect(single).toContain('Борщ – 1 порція 400\u00A0г');
    expect(single).not.toContain('{{#if');
    expect(single).not.toContain(' по ');

    const multiple = renderKitComponentsTemplate(template, [
      { componentName: 'Борщ', qty: 3, componentCategoryName: 'Перші страви', componentWeight: 0.4 },
    ]);
    expect(multiple).toContain('Борщ – 3 порції по 400\u00A0г');
  });
});
