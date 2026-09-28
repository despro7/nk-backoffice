import {
  STOREFRONT_BUILTIN_DEFAULTS,
  STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS,
  normalizeStorefrontKitComponentSettings,
} from '../constants/storefrontDefaults.js';
import type { StorefrontKitComponentSettings } from '../types/storefront.js';
import { formatNetWeightLabel, formatNetWeightRangeLabel } from './productLabel.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type KitComponentRow = {
  componentName: string;
  qty: number;
  componentWeight?: number | null;
  componentCategoryName?: string | null;
};

export type KitComponentItemView = {
  name: string;
  qty: number;
  qtyLabel: string;
  itemWeight: string;
};

export type KitComponentGroupView = {
  groupKey: string;
  groupLabel: string;
  groupLabelGenitive: string;
  groupTotalQty: number;
  /** Відмінювання «порція / порції / порцій» для groupTotalQty */
  groupTotalQtyLabel: string;
  groupItemCount: number;
  groupWeight: string;
  /** Чи показувати діапазон/вагу в заголовку групи (false для fallback «інших категорій») */
  hasGroupWeight: boolean;
  items: KitComponentItemView[];
};

const UNMAPPED_KIT_GROUP_KEY = '__unmapped__';

const KIT_GROUPS_OPEN = '{{#kitGroups}}';
const KIT_GROUPS_CLOSE = '{{/kitGroups}}';
const KIT_ITEMS_OPEN = '{{#kitItems}}';
const KIT_ITEMS_CLOSE = '{{/kitItems}}';
const KIT_ITEMS_ALL_OPEN = '{{#kitItemsAll}}';
const KIT_ITEMS_ALL_CLOSE = '{{/kitItemsAll}}';
const IF_CLOSE = '{{/if}}';

type ConditionalContext = Record<string, string | number>;

export function pluralizeUkPortions(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'порція';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'порції';
  return 'порцій';
}

function resolveSettings(settings?: StorefrontKitComponentSettings): StorefrontKitComponentSettings {
  return settings ? normalizeStorefrontKitComponentSettings(settings) : STOREFRONT_DEFAULT_KIT_COMPONENT_SETTINGS;
}

type ResolvedCategoryMeta = {
  groupKey: string;
  groupLabel: string;
  genitive: string;
  defaultWeightKg: number;
  defaultWeightMaxKg: number | null;
  order: number;
  isMapped: boolean;
};

function resolveCategoryMeta(
  categoryName: string | null | undefined,
  settings: StorefrontKitComponentSettings,
): ResolvedCategoryMeta {
  const label = categoryName?.trim() || 'Інше';
  const mapped = settings.categories.find((row) => row.label === label);
  if (mapped) {
    return {
      groupKey: label,
      groupLabel: label,
      genitive: mapped.genitive,
      defaultWeightKg: mapped.defaultWeightKg,
      defaultWeightMaxKg: mapped.defaultWeightMaxKg ?? null,
      order: mapped.order,
      isMapped: true,
    };
  }
  return {
    groupKey: UNMAPPED_KIT_GROUP_KEY,
    groupLabel: 'Інші категорії',
    genitive: settings.fallbackGenitive,
    defaultWeightKg: settings.fallbackDefaultWeightKg,
    defaultWeightMaxKg: settings.fallbackDefaultWeightMaxKg ?? null,
    order: settings.fallbackOrder,
    isMapped: false,
  };
}

function resolveItemWeightKg(
  componentWeight: number | null | undefined,
  defaultWeightKg: number,
): number {
  if (componentWeight != null && Number.isFinite(componentWeight) && componentWeight > 0) {
    return componentWeight;
  }
  return defaultWeightKg;
}

function resolveGroupWeightLabel(
  itemWeightKgList: number[],
  explicitWeightCount: number,
  defaultMinKg: number,
  defaultMaxKg: number | null | undefined,
): string {
  const uniqueWeights = [...new Set(itemWeightKgList.filter((weight) => weight > 0))];
  const configuredMax =
    defaultMaxKg != null && defaultMaxKg > defaultMinKg ? defaultMaxKg : null;

  if (uniqueWeights.length > 1) {
    return formatNetWeightRangeLabel(
      Math.min(...uniqueWeights),
      Math.max(...uniqueWeights),
    );
  }

  if (explicitWeightCount === 0 && configuredMax) {
    return formatNetWeightRangeLabel(defaultMinKg, configuredMax);
  }

  if (uniqueWeights.length === 1) {
    return formatNetWeightLabel(uniqueWeights[0]);
  }

  return formatNetWeightLabel(defaultMinKg);
}

function buildKitItemView(
  row: KitComponentRow,
  settings: StorefrontKitComponentSettings,
): KitComponentItemView | null {
  const name = row.componentName.trim();
  if (!name) return null;

  const meta = resolveCategoryMeta(row.componentCategoryName, settings);
  const qty = Number.isFinite(row.qty) && row.qty > 0 ? row.qty : 1;
  const itemWeightKg = resolveItemWeightKg(row.componentWeight, meta.defaultWeightKg);
  return {
    name,
    qty,
    qtyLabel: pluralizeUkPortions(qty),
    itemWeight: formatNetWeightLabel(itemWeightKg),
  };
}

export function buildKitItemViews(
  components: KitComponentRow[],
  settings?: StorefrontKitComponentSettings,
): KitComponentItemView[] {
  const resolvedSettings = resolveSettings(settings);
  return components
    .map((row) => buildKitItemView(row, resolvedSettings))
    .filter((item): item is KitComponentItemView => item != null);
}

export function groupKitComponents(
  components: KitComponentRow[],
  settings?: StorefrontKitComponentSettings,
): KitComponentGroupView[] {
  const resolvedSettings = resolveSettings(settings);
  const grouped = new Map<
    string,
    KitComponentGroupView & {
      order: number;
      isMapped: boolean;
      defaultWeightKg: number;
      defaultWeightMaxKg: number | null;
      itemWeightKgList: number[];
      explicitWeightCount: number;
    }
  >();

  for (const row of components) {
    const item = buildKitItemView(row, resolvedSettings);
    if (!item) continue;

    const meta = resolveCategoryMeta(row.componentCategoryName, resolvedSettings);
    const itemWeightKg = resolveItemWeightKg(row.componentWeight, meta.defaultWeightKg);
    const hasExplicitWeight =
      row.componentWeight != null &&
      Number.isFinite(row.componentWeight) &&
      row.componentWeight > 0;
    const existing = grouped.get(meta.groupKey);
    if (!existing) {
      grouped.set(meta.groupKey, {
        groupKey: meta.groupKey,
        groupLabel: meta.groupLabel,
        groupLabelGenitive: meta.genitive,
        groupTotalQty: item.qty,
        groupTotalQtyLabel: pluralizeUkPortions(item.qty),
        groupItemCount: 1,
        groupWeight: '',
        hasGroupWeight: meta.isMapped,
        items: [item],
        order: meta.order,
        isMapped: meta.isMapped,
        defaultWeightKg: meta.defaultWeightKg,
        defaultWeightMaxKg: meta.defaultWeightMaxKg,
        itemWeightKgList: [itemWeightKg],
        explicitWeightCount: hasExplicitWeight ? 1 : 0,
      });
      continue;
    }

    existing.groupTotalQty += item.qty;
    existing.groupTotalQtyLabel = pluralizeUkPortions(existing.groupTotalQty);
    existing.groupItemCount += 1;
    existing.items.push(item);
    existing.itemWeightKgList.push(itemWeightKg);
    if (hasExplicitWeight) existing.explicitWeightCount += 1;
  }

  const groups = [...grouped.values()].map((group) => ({
    ...group,
    groupTotalQtyLabel: pluralizeUkPortions(group.groupTotalQty),
    groupWeight: group.isMapped
      ? resolveGroupWeightLabel(
          group.itemWeightKgList,
          group.explicitWeightCount,
          group.defaultWeightKg,
          group.defaultWeightMaxKg,
        )
      : '',
    hasGroupWeight: group.isMapped,
  }));

  groups.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.groupLabel.localeCompare(b.groupLabel, 'uk');
  });

  return groups;
}

function substituteItemPlaceholders(template: string, item: KitComponentItemView): string {
  return template
    .replace(/\{\{name\}\}/g, escapeHtml(item.name))
    .replace(/\{\{qty\}\}/g, String(item.qty))
    .replace(/\{\{qtyLabel\}\}/g, item.qtyLabel)
    .replace(/\{\{itemWeight\}\}/g, item.itemWeight);
}

function groupConditionalContext(group: KitComponentGroupView): ConditionalContext {
  return {
    groupTotalQty: group.groupTotalQty,
    groupItemCount: group.groupItemCount,
  };
}

function itemConditionalContext(item: KitComponentItemView): ConditionalContext {
  return {
    qty: item.qty,
  };
}

function renderKitItemTemplate(itemTemplate: string, item: KitComponentItemView): string {
  const withConditionals = processKitTemplateConditionals(itemTemplate, itemConditionalContext(item));
  return substituteItemPlaceholders(withConditionals, item);
}

function resolveGroupWeightSuffix(group: KitComponentGroupView): string {
  if (!group.hasGroupWeight || !group.groupWeight) return '';
  return ` (по ${group.groupWeight})`;
}

function substituteGroupPlaceholders(template: string, group: KitComponentGroupView): string {
  return template
    .replace(/\{\{groupKey\}\}/g, escapeHtml(group.groupKey))
    .replace(/\{\{groupLabel\}\}/g, escapeHtml(group.groupLabel))
    .replace(/\{\{groupLabelGenitive\}\}/g, group.groupLabelGenitive)
    .replace(/\{\{groupTotalQty\}\}/g, String(group.groupTotalQty))
    .replace(/\{\{groupTotalQtyLabel\}\}/g, group.groupTotalQtyLabel)
    .replace(/\{\{groupItemCount\}\}/g, String(group.groupItemCount))
    .replace(/\{\{groupWeight\}\}/g, group.groupWeight)
    .replace(/\{\{groupWeightSuffix\}\}/g, resolveGroupWeightSuffix(group));
}

function compareValues(left: number, op: string, right: number): boolean {
  switch (op) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      return false;
  }
}

function evaluateConditionClause(clause: string, ctx: ConditionalContext): boolean {
  const match = clause.trim().match(/^(\w+)\s*(>|<|>=|<=|==|!=)\s*(\d+(?:\.\d+)?)$/);
  if (!match) return false;
  const [, key, op, rawValue] = match;
  const left = Number(ctx[key] ?? 0);
  const right = Number(rawValue);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return compareValues(left, op, right);
}

function evaluateCondition(expression: string, ctx: ConditionalContext): boolean {
  const orParts = expression.split(/\s*\|\|\s*/);
  for (const orPart of orParts) {
    const andParts = orPart.split(/\s*&&\s*/);
    const andResult = andParts.every((clause) => evaluateConditionClause(clause, ctx));
    if (andResult) return true;
  }
  return false;
}

export function processKitTemplateConditionals(
  template: string,
  ctx: ConditionalContext,
): string {
  let result = template;
  let guard = 0;
  while (guard++ < 50) {
    const openMatch = result.match(/\{\{#if\s+([^}]+)\}\}/);
    if (!openMatch || openMatch.index === undefined) break;

    const start = openMatch.index;
    const condition = openMatch[1];
    const bodyStart = start + openMatch[0].length;
    const closeIdx = result.indexOf(IF_CLOSE, bodyStart);
    if (closeIdx < 0) break;

    const body = result.slice(bodyStart, closeIdx);
    const replacement = evaluateCondition(condition, ctx) ? body : '';
    result = result.slice(0, start) + replacement + result.slice(closeIdx + IF_CLOSE.length);
  }
  return result;
}

export function hasKitComponentLoops(template: string): boolean {
  return (
    template.includes(KIT_GROUPS_OPEN) ||
    template.includes(KIT_ITEMS_ALL_OPEN)
  );
}

/** Legacy `{{kitComponents}}` or empty templates render a flat list — upgrade to grouped default. */
export function resolveKitComponentsBlockTemplate(template: string | null | undefined): string {
  const trimmed = template?.trim() || '';
  if (!trimmed || trimmed === '{{kitComponents}}' || !hasKitComponentLoops(trimmed)) {
    return STOREFRONT_BUILTIN_DEFAULTS.kitComponents.template || '{{kitComponents}}';
  }
  return trimmed;
}

export function buildKitComponentsLegacyHtml(
  components: Array<{ componentName: string; qty: number }>,
): string {
  if (!components.length) return '';
  const items = components
    .map((c) => {
      const name = escapeHtml(c.componentName.trim());
      const qty = Number(c.qty);
      const qtyText = Number.isFinite(qty) ? String(qty) : '1';
      return `<li>${name} × ${qtyText}</li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

function renderKitItemsAllBlocks(template: string, items: KitComponentItemView[]): string {
  let result = template;
  let guard = 0;
  while (guard++ < 50) {
    const openIdx = result.indexOf(KIT_ITEMS_ALL_OPEN);
    if (openIdx < 0) break;
    const closeIdx = result.indexOf(KIT_ITEMS_ALL_CLOSE, openIdx);
    if (closeIdx < 0) break;

    const itemTemplate = result.slice(openIdx + KIT_ITEMS_ALL_OPEN.length, closeIdx);
    const itemsHtml = items.map((item) => renderKitItemTemplate(itemTemplate, item)).join('');
    result =
      result.slice(0, openIdx) +
      itemsHtml +
      result.slice(closeIdx + KIT_ITEMS_ALL_CLOSE.length);
  }
  return result;
}

function renderKitGroupsBlocks(
  template: string,
  groups: KitComponentGroupView[],
  legacy: string,
): string {
  const openIdx = template.indexOf(KIT_GROUPS_OPEN);
  const closeIdx = template.indexOf(KIT_GROUPS_CLOSE);
  if (openIdx < 0 || closeIdx < 0 || closeIdx <= openIdx) {
    return template.replace(/\{\{kitComponents\}\}/g, legacy);
  }

  const prefix = template.slice(0, openIdx);
  const groupTemplate = template.slice(openIdx + KIT_GROUPS_OPEN.length, closeIdx);
  const suffix = template.slice(closeIdx + KIT_GROUPS_CLOSE.length);

  const itemsOpenIdx = groupTemplate.indexOf(KIT_ITEMS_OPEN);
  const itemsCloseIdx = groupTemplate.indexOf(KIT_ITEMS_CLOSE);
  const itemTemplate =
    itemsOpenIdx >= 0 && itemsCloseIdx > itemsOpenIdx
      ? groupTemplate.slice(itemsOpenIdx + KIT_ITEMS_OPEN.length, itemsCloseIdx)
      : '';

  const groupBodyTemplate = groupTemplate.replace(
    new RegExp(`${KIT_ITEMS_OPEN}[\\s\\S]*?${KIT_ITEMS_CLOSE}`, 'g'),
    '{{ITEMS}}',
  );

  const groupsHtml = groups
    .map((group) => {
      const conditionalBody = processKitTemplateConditionals(
        groupBodyTemplate,
        groupConditionalContext(group),
      );
      const itemsHtml = itemTemplate
        ? group.items.map((item) => renderKitItemTemplate(itemTemplate, item)).join('')
        : '';
      const groupBody = substituteGroupPlaceholders(conditionalBody, group).replace(
        /\{\{ITEMS\}\}/g,
        itemsHtml,
      );
      return groupBody;
    })
    .join('');

  return (
    prefix.replace(/\{\{kitComponents\}\}/g, legacy) +
    groupsHtml +
    suffix.replace(/\{\{kitComponents\}\}/g, legacy)
  );
}

export function renderKitComponentsTemplate(
  template: string,
  components: KitComponentRow[],
  settings?: StorefrontKitComponentSettings,
): string {
  const normalizedTemplate = resolveKitComponentsBlockTemplate(template);
  if (!components.length) return '';

  if (!normalizedTemplate || normalizedTemplate === '{{kitComponents}}') {
    return buildKitComponentsLegacyHtml(components);
  }

  const resolvedSettings = resolveSettings(settings);
  const items = buildKitItemViews(components, resolvedSettings);
  const legacy = buildKitComponentsLegacyHtml(components);

  if (!hasKitComponentLoops(normalizedTemplate)) {
    return normalizedTemplate.replace(/\{\{kitComponents\}\}/g, legacy);
  }

  let result = normalizedTemplate;
  if (result.includes(KIT_ITEMS_ALL_OPEN)) {
    result = renderKitItemsAllBlocks(result, items);
  }
  if (result.includes(KIT_GROUPS_OPEN)) {
    const groups = groupKitComponents(components, resolvedSettings);
    if (!groups.length) return '';
    result = renderKitGroupsBlocks(result, groups, legacy);
  }

  return result.replace(/\{\{kitComponents\}\}/g, legacy);
}
