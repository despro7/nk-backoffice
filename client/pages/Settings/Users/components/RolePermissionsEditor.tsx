import { useMemo, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionItem,
  Button,
  Checkbox,
  Input,
  Tab,
  Tabs,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { isPagePermission, isPermissionUiSuperseded } from '@shared/constants/permissions';
import {
  PERMISSION_DOMAIN_DEFAULT_SUBSECTION,
  PERMISSION_HR_SUBSECTION_LABELS,
  PERMISSION_HR_SUBSECTION_ORDER,
  PERMISSION_PRODUCTS_SUBSECTION_LABELS,
  PERMISSION_PRODUCTS_SUBSECTION_ORDER,
  PERMISSION_ROLE_EDITOR_DOMAINS,
  countSelectedInItems,
  groupCatalogByDomain,
  groupHrCatalogBySubsection,
  groupProductsCatalogBySubsection,
  type PermissionDomainId,
  type RoleEditorCatalogItem,
} from '@shared/constants/permissionRoleEditor';

export type PermissionSelectionFilter = 'all' | 'on' | 'off';

type CatalogItem = RoleEditorCatalogItem;

function matchesSearchAndFilter(
  item: CatalogItem,
  selected: ReadonlySet<string>,
  query: string,
  filter: PermissionSelectionFilter
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery && !item.label.toLowerCase().includes(normalizedQuery)) {
    return false;
  }
  const on = selected.has(item.key);
  if (filter === 'on' && !on) return false;
  if (filter === 'off' && on) return false;
  return true;
}

function filterItems(
  items: CatalogItem[],
  selected: ReadonlySet<string>,
  query: string,
  filter: PermissionSelectionFilter
): CatalogItem[] {
  return items.filter((item) => matchesSearchAndFilter(item, selected, query, filter));
}

function splitByLayer(items: CatalogItem[]): { pages: CatalogItem[]; actions: CatalogItem[] } {
  const pages: CatalogItem[] = [];
  const actions: CatalogItem[] = [];
  for (const item of items) {
    if (isPagePermission(item.key)) pages.push(item);
    else actions.push(item);
  }
  return { pages, actions };
}

type PermissionSection = { id: string; title: string; items: CatalogItem[]; visible: CatalogItem[] };

function domainSubsections(domain: PermissionDomainId, items: CatalogItem[]) {
  if (domain === 'hr') {
    return {
      order: PERMISSION_HR_SUBSECTION_ORDER as readonly string[],
      labels: PERMISSION_HR_SUBSECTION_LABELS as Record<string, string>,
      map: groupHrCatalogBySubsection(items) as Map<string, CatalogItem[]>,
    };
  }
  if (domain === 'products') {
    return {
      order: PERMISSION_PRODUCTS_SUBSECTION_ORDER as readonly string[],
      labels: PERMISSION_PRODUCTS_SUBSECTION_LABELS as Record<string, string>,
      map: groupProductsCatalogBySubsection(items) as Map<string, CatalogItem[]>,
    };
  }
  return null;
}

/** Секції домену (підрозділи HR / Товарів або одна «Усі права»), лише ті, де є видимі права. */
function buildDomainSections(
  domain: PermissionDomainId,
  items: CatalogItem[],
  selected: ReadonlySet<string>,
  query: string,
  filter: PermissionSelectionFilter,
  titlePrefix?: string,
): PermissionSection[] {
  const withPrefix = (title: string) => (titlePrefix ? `${titlePrefix} › ${title}` : title);
  const subsections = domainSubsections(domain, items);
  if (!subsections) {
    const visible = filterItems(items, selected, query, filter);
    if (visible.length === 0) return [];
    return [{
      id: titlePrefix ? `${domain}:${PERMISSION_DOMAIN_DEFAULT_SUBSECTION}` : PERMISSION_DOMAIN_DEFAULT_SUBSECTION,
      title: titlePrefix ?? 'Усі права',
      items,
      visible,
    }];
  }
  const sections: PermissionSection[] = [];
  for (const id of subsections.order) {
    const subItems = subsections.map.get(id) ?? [];
    if (subItems.length === 0) continue;
    const visible = filterItems(subItems, selected, query, filter);
    if (visible.length === 0) continue;
    sections.push({
      id: titlePrefix ? `${domain}:${id}` : id,
      title: withPrefix(subsections.labels[id] ?? id),
      items: subItems,
      visible,
    });
  }
  return sections;
}

/** Підсвітка збігів пошуку в назві права (без урахування регістру). */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let start = 0;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    if (index > start) parts.push(text.slice(start, index));
    parts.push(
      <mark key={index} className="rounded-[2px] bg-yellow-200 px-px text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>,
    );
    start = index + needle.length;
    index = lower.indexOf(needle, start);
  }
  if (start < text.length) parts.push(text.slice(start));
  return <>{parts}</>;
}

const colorClassMap = (color: string) => {
  switch (color) {
    case 'sky':
      return 'after:bg-sky-500';
    case 'amber':
      return 'after:bg-amber-500';
    default:
      return '';
  }
};

function PermissionCheckboxRow({
  item,
  color,
  selected,
  disabled,
  onToggle,
  query,
}: {
  query: string;
  item: CatalogItem;
  color: string;
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
}) {
  const superseded = isPermissionUiSuperseded(item.key, selected);
  return (
    <Checkbox
      size="sm"
      isSelected={selected.has(item.key)}
      isDisabled={disabled || superseded}
      onValueChange={(value) => onToggle(item.key, value)}
      classNames={{
        base: `flex w-full max-w-full items-start rounded-sm px-2 py-1.5 m-0 hover:bg-default-100/90 [&>input]:inset-0${superseded ? ' opacity-60' : ''}`,
        wrapper: `me-2.5 mt-0.5 ${colorClassMap(color)}`,
        label: 'text-sm text-default-700 whitespace-normal',
      }}
    >
      <HighlightMatch text={item.label} query={query} />
    </Checkbox>
  );
}

function PermissionColumn({
  title,
  color,
  allItems,
  visibleItems,
  selected,
  disabled,
  onToggle,
  onToggleGroup,
  query,
}: {
  query: string;
  title: string;
  color: string;
  allItems: CatalogItem[];
  visibleItems: CatalogItem[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
  onToggleGroup: (items: CatalogItem[], value: boolean) => void;
}) {
  const checkedCount = countSelectedInItems(allItems, selected);
  const allChecked = checkedCount === allItems.length && allItems.length > 0;
  const someChecked = checkedCount > 0 && !allChecked;
  // Пошук / фільтр не зачепив жодного права колонки: груповий чекбокс приглушений і неактивний,
  // щоб перемикання «усієї колонки» не плутали зі знайденими правами іншого типу.
  const filteredOut = allItems.length > 0 && visibleItems.length === 0;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-default-200 bg-default-100/80 px-3 py-2.5">
        <Tooltip
          content={allChecked ? `Вимкнути всі права` : `Увімкнути всі права`}
          showArrow
          delay={400}
          offset={-4}
          classNames={{
            base: 'before:rounded-[3px] before:bg-default-50 before:z-[10] before:shadow-[2px_2px_2px_-1.5px_#0000001a]',
            content: 'bg-default-50 text-default-600 border-0 rounded-sm',
          }}
        >
          <Checkbox
            isSelected={allChecked}
            isIndeterminate={someChecked}
            isDisabled={disabled || allItems.length === 0 || filteredOut}
            onValueChange={(value) => onToggleGroup(allItems, value)}
            aria-label={title}
            classNames={{
              base: `win-w-0${filteredOut ? ' opacity-50' : ''}`,
              wrapper: filteredOut ? 'after:bg-default-400' : colorClassMap(color),
              label: `text-sm font-semibold leading-snug${filteredOut ? ' text-default-500' : ''}`,
            }}
          >
            {title}
          </Checkbox>
        </Tooltip>
        <span className="text-[11px] text-default-400 tabular-nums ml-auto">
          {checkedCount}/{allItems.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-1.5 py-1.5">
        {visibleItems.length === 0 ? (
          <p className="py-2 text-center text-xs text-default-400">
            {filteredOut ? 'Немає збігів серед цих прав' : 'Немає прав у цій групі'}
          </p>
        ) : (
          visibleItems.map((item) => (
            <PermissionCheckboxRow
              key={item.key}
              item={item}
              color={color}
              selected={selected}
              disabled={disabled}
              onToggle={onToggle}
              query={query}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PermissionTwoColumnPanel({
  items,
  visible,
  selected,
  disabled,
  onToggle,
  onToggleGroup,
  query,
}: {
  query: string;
  items: CatalogItem[];
  visible: CatalogItem[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
  onToggleGroup: (items: CatalogItem[], value: boolean) => void;
}) {
  const allLayers = splitByLayer(items);
  const visibleLayers = splitByLayer(visible);
  const selectionTitleSuffix = (items: CatalogItem[]) => {
    if (items.length === 0) return '';
    const selectedCount = countSelectedInItems(items, selected);
    if (selectedCount === 0) return ' (не надано)';
    if (selectedCount < items.length) return ' (частковий)';
    return ' (повний)';
  };
  const pagesTitleSuffix = selectionTitleSuffix(allLayers.pages);
  const actionsTitleSuffix = selectionTitleSuffix(allLayers.actions);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-default-200">
      <PermissionColumn
        title={`Доступ до перегляду${pagesTitleSuffix}`}
        color="sky"
        allItems={allLayers.pages}
        visibleItems={visibleLayers.pages}
        selected={selected}
        disabled={disabled}
        onToggle={onToggle}
        onToggleGroup={onToggleGroup}
        query={query}
      />
      <PermissionColumn
        title={`Доступ до виконання дій${actionsTitleSuffix}`}
        color="amber"
        allItems={allLayers.actions}
        visibleItems={visibleLayers.actions}
        selected={selected}
        disabled={disabled}
        onToggle={onToggle}
        onToggleGroup={onToggleGroup}
        query={query}
      />
    </div>
  );
}

function renderSubsectionAccordionItem({
  subsectionId,
  title,
  items,
  visible,
  selected,
  disabled,
  onToggle,
  onToggleGroup,
  query,
}: {
  query: string;
  subsectionId: string;
  title: string;
  items: CatalogItem[];
  visible: CatalogItem[];
  selected: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
  onToggleGroup: (items: CatalogItem[], value: boolean) => void;
}) {
  const checkedCount = countSelectedInItems(items, selected);

  return (
    <AccordionItem
      key={subsectionId}
      aria-label={title}
      textValue={title}
      title={title}
      subtitle={`${checkedCount}/${items.length}`}
      // HeroUI default: spring height→auto + overflowY:unset на enter → overshoot ~20px і snap
      motionProps={{
        variants: {
          enter: {
            opacity: 1,
            height: 'auto',
            overflowY: 'hidden',
            transition: {
              height: { duration: 0.22, ease: 'easeOut' },
              opacity: { duration: 0.18 },
            },
          },
          exit: {
            opacity: 0,
            height: 0,
            overflowY: 'hidden',
            transition: { duration: 0.18, ease: 'easeIn' },
          },
        },
      }}
      classNames={{
        base: 'px-0 last:[&_button]:border-b-0',
        trigger:
          'py-2.5 px-3 bg-default-200/60 border-b border-default-200 [&>div]:flex-row [&>div]:items-center [&>div]:gap-1.5 data-[hover=true]:bg-default-200/50',
        title: 'text-sm font-medium text-default-800',
        subtitle: 'text-xs text-default-400 tabular-nums',
        content: '!p-0 overflow-hidden',
        indicator: 'text-default-400',
      }}
    >
      <PermissionTwoColumnPanel
        items={items}
        visible={visible}
        selected={selected}
        disabled={disabled}
        onToggle={onToggle}
        onToggleGroup={onToggleGroup}
        query={query}
      />
    </AccordionItem>
  );
}

export function RolePermissionsEditor({
  catalog,
  selected,
  disabled,
  onToggle,
  onToggleGroup,
}: {
  catalog: CatalogItem[];
  selected: Set<string>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
  onToggleGroup: (items: CatalogItem[], value: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PermissionSelectionFilter>('all');

  // Права, перекриті увімкненим пріоритетним (напр. повне редагування табеля), не показуємо
  // і не рахуємо: інакше група виглядає «частковою», хоча доступ повний.
  const byDomain = useMemo(
    () => groupCatalogByDomain(catalog.filter((item) => !isPermissionUiSuperseded(item.key, selected))),
    [catalog, selected],
  );

  const domainsWithItems = useMemo(
    () => PERMISSION_ROLE_EDITOR_DOMAINS.filter((tab) => (byDomain.get(tab.id)?.length ?? 0) > 0),
    [byDomain]
  );

  const [activeDomain, setActiveDomain] = useState<PermissionDomainId | null>(null);
  const resolvedDomain = activeDomain ?? domainsWithItems[0]?.id ?? 'main';

  const domainItems = useMemo(() => byDomain.get(resolvedDomain) ?? [], [byDomain, resolvedDomain]);

  const domainCounts = useMemo(() => {
    const counts = new Map<PermissionDomainId, { on: number; total: number }>();
    for (const tab of domainsWithItems) {
      const items = byDomain.get(tab.id) ?? [];
      counts.set(tab.id, {
        on: countSelectedInItems(items, selected),
        total: items.length,
      });
    }
    return counts;
  }, [byDomain, domainsWithItems, selected]);

  // Пошук іде по всіх доменах одразу, щоб не перемикати їх вручну.
  const isGlobalSearch = search.trim().length > 0;

  const visibleAccordionSections = useMemo(() => {
    if (isGlobalSearch) {
      return domainsWithItems.flatMap((tab) =>
        buildDomainSections(tab.id, byDomain.get(tab.id) ?? [], selected, search, filter, tab.label),
      );
    }
    return buildDomainSections(resolvedDomain, domainItems, selected, search, filter);
  }, [isGlobalSearch, domainsWithItems, byDomain, resolvedDomain, domainItems, selected, search, filter]);

  /** Скільки прав знайдено в кожному домені (бейдж на вкладці під час пошуку). */
  const searchMatches = useMemo(() => {
    const counts = new Map<PermissionDomainId, number>();
    if (!isGlobalSearch) return counts;
    for (const tab of domainsWithItems) {
      counts.set(tab.id, filterItems(byDomain.get(tab.id) ?? [], selected, search, filter).length);
    }
    return counts;
  }, [isGlobalSearch, domainsWithItems, byDomain, selected, search, filter]);

  const defaultExpandedKeys = useMemo(
    () =>
      visibleAccordionSections
        // Під час пошуку розгортаємо всі знайдені секції.
        .filter((section) => isGlobalSearch || countSelectedInItems(section.items, selected) > 0)
        .map((section) => section.id),
    [visibleAccordionSections, selected, isGlobalSearch]
  );

  const isSubsectionAccordion =
    visibleAccordionSections.length > 0 &&
    (isGlobalSearch || domainSubsections(resolvedDomain, []) != null);

  const filterTabs: { id: PermissionSelectionFilter; label: string }[] = [
    { id: 'all', label: 'Усі' },
    { id: 'on', label: 'Увімкнені' },
    { id: 'off', label: 'Вимкнені' },
  ];

  const flatSection = !isSubsectionAccordion ? visibleAccordionSections[0] : null;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-default-900">
          <DynamicIcon name="shield" size={14} className="text-default-500 shrink-0" />
          Права доступу
        </h3>
        <p className="text-xs text-default-500 leading-relaxed pl-5">
          Домени як у меню. Зліва — доступ до сторінок, справа — дозволи на дії в інтерфейсі та API.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Знайти право за назвою…"
          value={search}
          onValueChange={setSearch}
          startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
          classNames={{ inputWrapper: 'bg-content1 border border-default-200 shadow-none' }}
          isClearable
          onClear={() => setSearch('')}
          className="min-w-0"
        />
        <Tabs
          aria-label="Фільтр прав"
          selectedKey={filter}
          onSelectionChange={(key) => setFilter(key as PermissionSelectionFilter)}
          size="sm"
          variant="solid"
          color="primary"
          classNames={{
            base: 'w-full sm:w-auto shrink-0',
            tabList: 'gap-0.5 p-1 bg-default-100 border border-default-200 rounded-md',
            cursor: 'bg-primary-600 rounded-sm',
            tab: 'h-7.5 min-w-0 px-2.5 text-xs font-normal min-w-0 w-auto',
            tabContent: 'group-data-[selected=true]:text-white text-default-500',
          }}
        >
          {filterTabs.map((tab) => (
            <Tab key={tab.id} title={tab.label} />
          ))}
        </Tabs>
      </div>

      {domainsWithItems.length === 0 ? (
        <p className="text-sm text-default-500">Немає прав у каталозі.</p>
      ) : (
        <div
          role="tablist"
          aria-label="Домен прав доступу"
          className="flex w-full min-w-0 flex-wrap items-center gap-1 overflow-x-auto scrollbar-hide rounded-md border border-default-200 bg-default-100 p-1.5"
        >
          {domainsWithItems.map((tab) => {
            const count = domainCounts.get(tab.id);
            const isSelected = !isGlobalSearch && resolvedDomain === tab.id;
            const matches = searchMatches.get(tab.id) ?? 0;
            return (
              <Button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                size="sm"
                variant="solid"
                color="primary"
                className={`h-8 min-w-0 shrink-0 px-2.5 text-xs font-normal ${
                  isSelected
                    ? 'bg-primary-600 text-white shadow-sm data-[hover=true]:opacity-100!'
                    : isGlobalSearch && matches > 0
                      ? 'bg-content1 font-medium text-slate-900 shadow-sm ring-1 ring-slate-300'
                      : `bg-transparent text-default-500${isGlobalSearch ? ' opacity-50' : ''}`
                }`}
                onPress={() => {
                  // Під час пошуку клік по домену скидає пошук і відкриває домен.
                  if (isGlobalSearch) setSearch('');
                  setActiveDomain(tab.id);
                }}
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {tab.label}
                  {isGlobalSearch ? (
                    matches > 0 ? (
                      <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold tabular-nums text-slate-700">
                        {matches}
                      </span>
                    ) : (
                      <span className="text-[11px] tabular-nums font-normal text-default-400">0</span>
                    )
                  ) : (
                    <span className="text-[11px] tabular-nums text-default-400 font-normal">
                      {count?.on ?? 0}/{count?.total ?? 0}
                    </span>
                  )}
                </span>
              </Button>
            );
          })}
        </div>
      )}

      {visibleAccordionSections.length === 0 ? (
        <p className="text-sm text-default-500 py-8 text-center rounded-lg border border-default-200 bg-default-50/50">
          Нічого не знайдено. Спробуйте інший пошук або фільтр.
        </p>
      ) : isSubsectionAccordion ? (
        <div className="rounded-lg border border-default-200 overflow-hidden bg-content1">
          <Accordion
            key={`${resolvedDomain}-${search}-${filter}`}
            selectionMode="multiple"
            defaultExpandedKeys={defaultExpandedKeys}
            variant="light"
            showDivider={false}
            className="px-0"
            itemClasses={{
              base: 'border-b border-default-200 last:border-b-0',
            }}
          >
            {visibleAccordionSections.map((section) =>
              renderSubsectionAccordionItem({
                subsectionId: section.id,
                title: section.title,
                items: section.items,
                visible: section.visible,
                selected,
                disabled,
                onToggle,
                onToggleGroup,
                query: search,
              })
            )}
          </Accordion>
        </div>
      ) : (
        flatSection && (
          <div className="rounded-md border border-default-200 overflow-hidden bg-content1">
            <PermissionTwoColumnPanel
              items={flatSection.items}
              visible={flatSection.visible}
              selected={selected}
              disabled={disabled}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
              query={search}
            />
          </div>
        )
      )}
    </section>
  );
}
