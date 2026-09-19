import { useMemo, useState, type ReactNode } from 'react';
import type { SortDescriptor } from '@heroui/react';
import {
  Button,
  Card,
  CardBody,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SpecChip } from '@/components/SpecChip';
import { StockBadge } from '@/components/StockBadge';
import { ACTION_BUBBLE_COLOR_PRESETS } from '@/components/action-bubble/presets';
import {
  BTN_GLOW_PRIMARY,
  BTN_PRIMARY_BLUE,
  BTN_VIVID_SUCCESS,
  BTN_VIVID_WARNING,
} from '@/lib/buttonStyles';
import {
  HR_TABLE_CLASS_NAMES,
  hrEmployerTokensFromName,
  hrPayGroupTokens,
  hrStatusTokens,
  hrTaxPayerTokens,
} from '@/pages/Hr/hrUi';
import { HR_PAY_GROUP_LABELS, type HrPayGroup } from '@shared/types/hr';

type MockRow = {
  id: number;
  name: string;
  employer: string;
  payGroup: HrPayGroup;
  status: 'active' | 'inactive';
  notes: string | null;
};

const MOCK_TABLE_ROWS: MockRow[] = [
  { id: 1, name: 'Іваненко Олена Петрівна', employer: 'ТОВ «NK Food»', payGroup: 'official_salary', status: 'active', notes: 'Основний склад' },
  { id: 2, name: 'Коваленко Максим Ігорович', employer: 'ФОП Петренко', payGroup: 'hourly', status: 'active', notes: null },
  { id: 3, name: 'Сидоренко Андрій', employer: 'Неофіційна готівка', payGroup: 'unofficial_cash', status: 'inactive', notes: 'Архів з 01.2026' },
  { id: 4, name: 'Мельник Світлана Василівна', employer: 'ТОВ «NK Food»', payGroup: 'hourly', status: 'active', notes: 'Нічна зміна' },
  { id: 5, name: 'Бондаренко Дмитро Олегович', employer: 'ФОП Коваль', payGroup: 'official_salary', status: 'active', notes: null },
  { id: 6, name: 'Шевченко Ірина Миколаївна', employer: 'ТОВ «NK Trade»', payGroup: 'official_salary', status: 'inactive', notes: 'Декрет' },
  { id: 7, name: 'Ткаченко Петро Степанович', employer: 'ФОП Петренко', payGroup: 'unofficial_cash', status: 'active', notes: 'Підряд' },
  { id: 8, name: 'Лисенко Марія Іванівна', employer: 'ТОВ «NK Food»', payGroup: 'hourly', status: 'active', notes: 'Комплектація' },
];

const DEFAULT_SORT: SortDescriptor = { column: 'name', direction: 'ascending' };

function sortMockRows(rows: MockRow[], sortDescriptor: SortDescriptor): MockRow[] {
  const column = String(sortDescriptor.column ?? 'name');
  const dir = sortDescriptor.direction === 'descending' ? -1 : 1;

  const value = (row: MockRow): string => {
    switch (column) {
      case 'employer': return row.employer;
      case 'payGroup': return HR_PAY_GROUP_LABELS[row.payGroup];
      case 'status': return row.status;
      default: return row.name;
    }
  };

  return [...rows].sort((a, b) => {
    const left = value(a).toLocaleLowerCase('uk');
    const right = value(b).toLocaleLowerCase('uk');
    if (left < right) return -1 * dir;
    if (left > right) return 1 * dir;
    return a.id - b.id;
  });
}

function Section({
  title,
  description,
  reference,
  children,
}: {
  title: string;
  description?: string;
  reference?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-default-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-default-500">{description}</p> : null}
        {reference ? <p className="mt-1 font-mono text-xs text-default-400">{reference}</p> : null}
      </div>
      {children}
    </section>
  );
}

function PatternLabel({ kind }: { kind: 'etalon' | 'domain' | 'anti' }) {
  const map = {
    etalon: 'bg-success-100 text-success-700',
    domain: 'bg-warning-100 text-warning-800',
    anti: 'bg-danger-100 text-danger-700',
  } as const;
  const text = { etalon: 'Еталон', domain: 'Доменний', anti: 'Anti-pattern' } as const;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[kind]}`}>
      {text[kind]}
    </span>
  );
}

const ROW_ACTION_ICON_CLASS = {
  edit: 'text-blue-600 hover:bg-blue-600/10!',
  view: 'text-default-600 hover:bg-default-600/10!',
  copy: 'text-violet-600 hover:bg-violet-600/10!',
  external: 'text-sky-600 hover:bg-sky-600/10!',
  archive: 'text-amber-600 hover:bg-amber-600/10!',
  delete: 'text-rose-600 hover:bg-rose-600/10!',
} as const;

function RowActionIcons({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const iconSize = size === 'sm' ? 16 : 18;
  const btnSize = size === 'sm' ? 'sm' : 'md';
  const actions = [
    { key: 'edit', icon: 'pencil' as const, label: 'Редагувати' },
    { key: 'view', icon: 'eye' as const, label: 'Переглянути' },
    { key: 'copy', icon: 'copy' as const, label: 'Копіювати' },
    { key: 'external', icon: 'external-link' as const, label: 'Відкрити' },
    { key: 'archive', icon: 'archive' as const, label: 'Архів' },
    { key: 'delete', icon: 'trash-2' as const, label: 'Видалити' },
  ] as const;

  return (
    <div className="flex flex-wrap gap-1">
      {actions.map(({ key, icon, label }) => (
        <Button
          key={key}
          size={btnSize}
          variant="light"
          isIconOnly
          aria-label={label}
          className={ROW_ACTION_ICON_CLASS[key]}
        >
          <DynamicIcon name={icon} size={iconSize} />
        </Button>
      ))}
    </div>
  );
}

function ButtonShowcase({
  id,
  label,
  kind,
  hint,
  snippet,
  children,
}: {
  id: string;
  label: string;
  kind: 'etalon' | 'domain' | 'anti';
  hint?: string;
  /** Текст для clipboard; за замовчуванням design:{id} */
  snippet?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copyKey = `design:${id}`;

  const handleCopy = async () => {
    const text = copyKey;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div id={id} className="flex flex-col gap-1.5 rounded-lg border border-default-200 bg-background-paper p-3 min-w-[200px]">
      <div className="flex items-center gap-2 flex-wrap">
        <PatternLabel kind={kind} />
        <span className="text-xs font-medium text-default-700">{label}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          title={snippet ?? copyKey}
          aria-label={copied ? 'Copied' : `Copy ${copyKey}`}
          className="ml-auto inline-flex items-center gap-1 text-[10px] text-default-500 hover:text-default-700 cursor-pointer"
        >
          {copied ? (
            <>
              <DynamicIcon name="check" size={12} className="text-success-600" />
              <span>copied</span>
            </>
          ) : (
            <>
              <DynamicIcon name="copy" size={12} />
              <span>copy</span>
            </>
          )}
        </button>
      </div>
      {hint ? <p className="text-[11px] text-default-400 leading-snug">{hint}</p> : null}
      <div className="pt-1">{children}</div>
    </div>
  );
}

function ProductDrawerDemo() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('main');
  const [saving, setSaving] = useState(false);

  return (
    <>
      <Button className={BTN_PRIMARY_BLUE} onPress={() => setOpen(true)}>
        Відкрити demo ProductDrawer
      </Button>

      <Drawer
        isOpen={open}
        onOpenChange={setOpen}
        placement="right"
        size="3xl"
        classNames={{
          base: 'flex flex-col max-h-[100dvh] md:max-h-full',
          header: 'shrink-0 sticky top-0 z-10 bg-content1 flex flex-col gap-3 border-b border-default-200/60 py-3 md:py-4 px-3 md:px-6 md:pb-4',
          body: 'px-3 md:px-6 flex-1 min-h-0 overflow-y-auto',
          footer: 'px-0',
          closeButton: 'top-2 md:top-3 z-20',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader>
                <div className="flex flex-col gap-1">
                  <span className="truncate pr-6">
                    Редагування
                    <span className="font-normal text-default-500"> – Набір перших та других страв (24 порції)</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-normal text-default-400">
                    <span className="font-semibold">
                      Група: <span className="font-normal">Готові набори</span>
                    </span>
                    <Divider orientation="vertical" className="hidden md:block h-3" />
                    <span className="font-semibold hidden md:inline">
                      SKU: <span className="font-normal">07124</span>
                    </span>
                    <Divider orientation="vertical" className="h-3" />
                    <span className="font-semibold inline-flex items-center gap-1.5">
                      Залишки:
                      <span className="inline-flex items-center gap-1 font-normal">
                        <StockBadge variant="gp" size="9px" />
                        0
                        <span className="text-default-300">/</span>
                        <StockBadge variant="ms" size="9px" />
                        39
                      </span>
                    </span>
                  </div>
                </div>
                <Tabs
                  size="md"
                  fullWidth
                  color="primary"
                  aria-label="Вкладки картки"
                  selectedKey={tab}
                  onSelectionChange={(key) => setTab(String(key))}
                >
                  <Tab
                    key="main"
                    title={
                      <div className="flex items-center gap-2">
                        <DynamicIcon name="receipt-text" size={14} />
                        <span className="hidden md:block">Основні дані</span>
                        <span className="md:hidden">Дані</span>
                      </div>
                    }
                  />
                  <Tab
                    key="content"
                    title={
                      <div className="flex items-center gap-2">
                        <DynamicIcon name="file-text" size={14} />
                        <span className="hidden md:block">Опис і зображення</span>
                        <span className="md:hidden">Опис</span>
                      </div>
                    }
                  />
                  <Tab
                    key="stickers"
                    title={
                      <div className="flex items-center gap-2">
                        <DynamicIcon name="tags" size={14} />
                        <span>Наліпки</span>
                      </div>
                    }
                  />
                </Tabs>
              </DrawerHeader>

              <DrawerBody className="gap-6 pt-5 pb-0 shadow-inner">
                {tab === 'main' ? (
                  <>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1">
                        <DynamicIcon name="receipt-text" size={14} />
                        <span>Реквізити</span>
                      </h3>
                      <Input
                        label="Назва"
                        defaultValue="Набір перших та других страв (24 порції)"
                        isRequired
                        endContent={
                          <Button isIconOnly size="sm" variant="light" color="default" aria-label="Назва для друку" className="text-default-500">
                            <DynamicIcon name="printer" size={16} />
                          </Button>
                        }
                      />
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Select
                          label="Тип обʼєкта"
                          isRequired
                          defaultSelectedKeys={['kit']}
                          classNames={{ popoverContent: 'bg-default-100 w-auto min-w-max' }}
                          renderValue={() => (
                            <div className="flex items-center gap-2">
                              <DynamicIcon name="package" size={16} className="shrink-0" />
                              Комплект
                            </div>
                          )}
                        >
                          <SelectItem key="kit">Комплект</SelectItem>
                          <SelectItem key="good">Товар</SelectItem>
                        </Select>
                        <Input
                          label="SKU (артикул)"
                          defaultValue="07124"
                          isRequired
                          endContent={
                            <Button isIconOnly size="sm" variant="light" color="default" className="text-default-500" aria-label="Генерація SKU">
                              <DynamicIcon name="dices" size={16} />
                            </Button>
                          }
                        />
                      </div>
                    </section>

                    <Divider className="bg-default-200/60" />

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1">
                        <DynamicIcon name="scaling" size={14} />
                        <span>Упаковка</span>
                      </h3>
                      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                        <Select label="Од. виміру" defaultSelectedKeys={['pcs']} classNames={{ popoverContent: 'bg-default-100' }}>
                          <SelectItem key="pcs">шт.</SelectItem>
                        </Select>
                        <Input label="Порцій в коробці" defaultValue="24" />
                        <Input label="Вага, кг" defaultValue="8,400" />
                      </div>
                    </section>

                    <Divider className="bg-default-200/60" />

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1">
                        <DynamicIcon name="list-tree" size={14} />
                        <span>Склад комплекту</span>
                      </h3>
                      <Input
                        placeholder="Пошук компонента…"
                        startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
                      />
                      <div className="rounded-lg border border-default-200 divide-y divide-default-200 text-sm">
                        {['Борщ зі свинини', 'Котлета по-київськи', 'Гречка'].map((name, idx) => (
                          <div key={name} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-default-400 w-4">{idx + 1}.</span>
                            <span className="flex-1 font-medium text-default-800">{name}</span>
                            <span className="text-xs text-default-400 font-mono">× {idx === 0 ? 3 : 4}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <Divider className="bg-default-200/60" />

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1">
                        <DynamicIcon name="scan-barcode" size={14} />
                        <span>Штрихкоди</span>
                      </h3>
                      <div className="grid grid-cols-[5fr_4fr_auto] gap-2">
                        <Input
                          size="md"
                          aria-label="Штрихкод"
                          placeholder="Введіть або згенеруйте штрихкод"
                          defaultValue="2200000000682"
                          endContent={
                            <Button isIconOnly size="sm" variant="light" color="default" className="text-default-500 -mr-2" aria-label="Генерувати ШК">
                              <DynamicIcon name="dices" size={16} />
                            </Button>
                          }
                        />
                        <Input
                          size="md"
                          aria-label="Номер партії"
                          placeholder="Оберіть партію…"
                          isReadOnly
                          endContent={<DynamicIcon name="chevrons-up-down" size={14} className="text-default-400" />}
                        />
                        <Button isIconOnly variant="light" color="danger" aria-label="Видалити">
                          <DynamicIcon name="trash-2" size={16} />
                        </Button>
                      </div>
                      <Button size="sm" variant="flat" startContent={<DynamicIcon name="plus" size={14} />}>
                        Додати ШК
                      </Button>
                    </section>
                  </>
                ) : (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1">
                      <DynamicIcon name="file-text" size={14} />
                      <span>Короткий опис</span>
                    </h3>
                    <div className="rounded-lg border border-default-200 bg-default-50 p-3 text-sm text-default-600 min-h-[120px]">
                      Мок-редактор (ProductDrawer → DescriptionEditor).
                    </div>
                  </section>
                )}

                <DrawerFooter className="-mx-3 md:-mx-6 px-3 md:px-6 md:py-5 mt-auto border-t border-default-200/60 bg-content2/75">
                  <div className="mr-auto">
                    <Dropdown placement="top-start">
                      <DropdownTrigger>
                        <Button variant="flat" aria-label="Дії" endContent={<DynamicIcon name="chevron-down" size={16} />}>
                          Дії
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Дії з карткою">
                        <DropdownItem key="payload" startContent={<DynamicIcon name="code-2" size={16} />}>
                          Payload
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                  <Button variant="light" onPress={() => setOpen(false)}>
                    Скасувати
                  </Button>
                  <Button
                    color="primary"
                    onPress={() => {
                      setSaving(true);
                      window.setTimeout(() => setSaving(false), 1200);
                    }}
                    isDisabled={saving}
                    startContent={
                      saving
                        ? <DynamicIcon name="loader-2" size={14} className="animate-spin" />
                        : <DynamicIcon name="save" size={14} />
                    }
                  >
                    Зберегти
                  </Button>
                </DrawerFooter>
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function DemoSortableTable() {
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>(DEFAULT_SORT);
  const sortedRows = useMemo(
    () => sortMockRows(MOCK_TABLE_ROWS, sortDescriptor),
    [sortDescriptor],
  );

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardBody className="p-3">
        <Table
          aria-label="Demo sortable таблиця"
          removeWrapper
          classNames={HR_TABLE_CLASS_NAMES}
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
        >
          <TableHeader>
            <TableColumn key="name" allowsSorting>ПІБ</TableColumn>
            <TableColumn key="employer" allowsSorting>Роботодавець</TableColumn>
            <TableColumn key="payGroup" allowsSorting>Група</TableColumn>
            <TableColumn key="status" allowsSorting>Статус</TableColumn>
            <TableColumn key="actions">Керування</TableColumn>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.id} className={row.status === 'active' ? undefined : 'opacity-40'}>
                <TableCell>
                  <div className="font-medium text-default-900">{row.name}</div>
                  {row.notes ? <div className="text-xs truncate text-default-400">{row.notes}</div> : null}
                </TableCell>
                <TableCell>
                  <SpecChip tokens={hrEmployerTokensFromName(row.employer)} rounded="sm">
                    {row.employer}
                  </SpecChip>
                </TableCell>
                <TableCell>
                  <SpecChip tokens={hrPayGroupTokens(row.payGroup)} rounded="sm">
                    {HR_PAY_GROUP_LABELS[row.payGroup]}
                  </SpecChip>
                </TableCell>
                <TableCell>
                  {row.status === 'active' ? (
                    <SpecChip tokens={hrStatusTokens('active')} icon="success">активний</SpecChip>
                  ) : (
                    <SpecChip tokens={hrStatusTokens('inactive')} icon="error">неактивний</SpecChip>
                  )}
                </TableCell>
                <TableCell>
                  <RowActionIcons />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}

export function DesignSystemPatterns() {
  const [loadingBad, setLoadingBad] = useState(false);
  const [loadingGood, setLoadingGood] = useState(false);

  return (
    <div className="space-y-10">
      <Section
        title="Еталонні файли"
        description="Перед новим UI — звіритись з цими реалізаціями або з вітриною нижче."
      >
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          {[
            ['Таблиця (HR)', 'client/pages/Hr/Employees/index.tsx'],
            ['Таблиця (Products)', 'client/pages/Products/components/CatalogTable.tsx'],
            ['SpecChip', 'client/components/SpecChip.tsx'],
            ['Drawer (HR)', 'client/pages/Hr/Employees/EmployeeDrawer.tsx'],
            ['Drawer (Products)', 'client/pages/Products/components/productDrawer/ProductDrawer.tsx'],
          ].map(([label, path]) => (
            <div key={path} className="rounded-lg border border-default-200 bg-background-paper px-3 py-2">
              <div className="font-medium text-default-900">{label}</div>
              <div className="font-mono text-xs text-default-400 mt-0.5">{path}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Таблиці (sortable)"
        description="HR-етalon: Card + Table, removeWrapper, HR_TABLE_CLASS_NAMES, allowsSorting."
        reference="client/pages/Hr/Employees/index.tsx"
      >
        <DemoSortableTable />
      </Section>

      <Section
        title="SpecChip"
        description="Семантичні chips через specColorPalette. Імпорт: @/components/SpecChip."
        reference="client/components/SpecChip.tsx"
      >
        <div className="flex flex-wrap gap-2">
          <SpecChip tokens={hrPayGroupTokens('official_salary')} rounded="sm">{HR_PAY_GROUP_LABELS.official_salary}</SpecChip>
          <SpecChip tokens={hrPayGroupTokens('hourly')} rounded="sm">{HR_PAY_GROUP_LABELS.hourly}</SpecChip>
          <SpecChip tokens={hrPayGroupTokens('unofficial_cash')} rounded="sm">{HR_PAY_GROUP_LABELS.unofficial_cash}</SpecChip>
          <SpecChip tokens={hrStatusTokens('active')} icon="success">активний</SpecChip>
          <SpecChip tokens={hrStatusTokens('inactive')} icon="error">неактивний</SpecChip>
          <SpecChip tokens={hrEmployerTokensFromName('ТОВ NK Food')} rounded="sm">ТОВ NK Food</SpecChip>
          <SpecChip tokens={hrTaxPayerTokens('employer')} icon="info">Роботодавець</SpecChip>
        </div>
      </Section>

      <Section
        title="Drawer sheet"
        description="ProductDrawer — tabs, meta в header, секції форм, footer sticky в body. EmployeeDrawer — класичний Header/Body/Footer."
        reference="client/pages/Products/components/productDrawer/ProductDrawer.tsx"
      >
        <ProductDrawerDemo />
      </Section>

      <Section
        title="Кнопки — еталон і доменні патерни"
        description="Стилі для нового UI. Клік copy → design:btn-* для агента."
        reference="buttonStyles.ts · global.css · ProductDrawer · hrUi.tsx"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ButtonShowcase
            id="btn-primary-solid"
            kind="etalon"
            label="Primary (solid)"
            hint="color=primary — theme #374151. ProductDrawer «Зберегти», головний CTA"
            snippet='design:btn-primary-solid → <Button color="primary">'
          >
            <Button color="primary" startContent={<DynamicIcon name="save" size={14} />}>Зберегти</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-primary-flat"
            kind="etalon"
            label="Primary (flat)"
            hint="color=primary variant=flat — theme HeroUI (bg-primary/20). Без global override"
            snippet='design:btn-primary-flat → <Button color="primary" variant="flat">'
          >
            <Button color="primary" variant="flat">Primary flat</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-primary-blue-solid"
            kind="etalon"
            label="Primary-blue (solid)"
            hint="BTN_PRIMARY_BLUE — toolbar, коли синій акцент доречніший"
            snippet='design:btn-primary-blue-solid → className={BTN_PRIMARY_BLUE}'
          >
            <Button className={BTN_PRIMARY_BLUE} startContent={<DynamicIcon name="plus" size={16} />}>Новий запис</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-primary-blue-flat"
            kind="etalon"
            label="Primary-blue (flat)"
            hint="BTN_PRIMARY_BLUE_FLAT — явний className або data-btn-tone=primary-blue-flat"
            snippet='design:btn-primary-blue-flat → className={BTN_PRIMARY_BLUE_FLAT}'
          >
            <Button color="primary" variant="flat" data-btn-tone="primary-blue-flat">Primary-blue flat</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-vivid-success"
            kind="etalon"
            label="Vivid success"
            hint="BTN_VIVID_SUCCESS — яскрава альтернатива HeroUI color=success"
            snippet="design:btn-vivid-success → className={BTN_VIVID_SUCCESS}"
          >
            <Button size="sm" className={BTN_VIVID_SUCCESS}>Success</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-vivid-warning"
            kind="etalon"
            label="Vivid warning"
            hint="BTN_VIVID_WARNING — яскрава альтернатива HeroUI color=warning"
            snippet="design:btn-vivid-warning → className={BTN_VIVID_WARNING}"
          >
            <Button size="sm" className={BTN_VIVID_WARNING}>Warning</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-glow-primary"
            kind="etalon"
            label="Shadow-button glow"
            hint="shadow-button-* з global.css @theme — акcent-кнопки з glow-тінню"
            snippet='design:btn-glow-primary → className={BTN_GLOW_PRIMARY}'
          >
            <Button color="primary" className={BTN_GLOW_PRIMARY}>Glow primary</Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-loading-icon"
            kind="etalon"
            label="Loading через іконку"
            hint="animate-spin на іконці, не isLoading на Button"
            snippet='design:btn-loading-icon → startContent + className="animate-spin"'
          >
            <Button
              color="primary"
              variant="flat"
              startContent={
                <DynamicIcon
                  name={loadingGood ? 'loader-circle' : 'table-properties'}
                  size={16}
                  className={loadingGood ? 'animate-spin' : ''}
                />
              }
              isDisabled={loadingGood}
              onPress={() => {
                setLoadingGood(true);
                window.setTimeout(() => setLoadingGood(false), 1500);
              }}
            >
              {loadingGood ? 'Генерація…' : 'Згенерувати'}
            </Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-row-actions"
            kind="etalon"
            label="Row action icons"
            hint="variant=light isIconOnly — edit=blue, delete=rose"
            snippet="design:btn-row-actions → RowActionIcons / ROW_ACTION_ICON_CLASS"
          >
            <RowActionIcons />
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-products-gradient"
            kind="domain"
            label="Products gradient sync"
            hint="Еталон лише для CatalogToolbar (Products)"
            snippet="design:btn-products-gradient → CatalogToolbar only"
          >
            <Button
              size="sm"
              color="primary"
              className="bg-gradient-to-b from-lime-500 to-green-600 text-white font-medium"
              startContent={<DynamicIcon name="folder-sync" size={14} />}
            >
              Синхронізувати гілку
            </Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-action-bubble"
            kind="domain"
            label="Action bubble presets"
            hint="FAB / mobile action bubble — ACTION_BUBBLE_COLOR_PRESETS"
            snippet="design:btn-action-bubble → ACTION_BUBBLE_COLOR_PRESETS"
          >
            <div className="flex flex-wrap gap-2">
              {(['sky', 'purple', 'orange', 'red', 'lime'] as const).map((key) => (
                <button key={key} type="button" className={`rounded-full px-3 py-1.5 text-xs font-medium ${ACTION_BUBBLE_COLOR_PRESETS[key]}`}>
                  {key}
                </button>
              ))}
            </div>
          </ButtonShowcase>
        </div>
      </Section>

      <Section
        title="Кнопки — anti-patterns"
        description="Підходи, яких уникати в новому UI."
        reference="design:btn-anti-*"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ButtonShowcase
            id="btn-anti-loading"
            kind="anti"
            label="isLoading + іконка"
            hint="Кнопка смикається; краще крутити іконку"
            snippet="design:btn-anti-loading → avoid isLoading + startContent"
          >
            <Button
              color="primary"
              isLoading={loadingBad}
              startContent={!loadingBad ? <DynamicIcon name="refresh-cw" size={16} /> : undefined}
              onPress={() => {
                setLoadingBad(true);
                window.setTimeout(() => setLoadingBad(false), 1500);
              }}
            >
              Оновити
            </Button>
          </ButtonShowcase>

          <ButtonShowcase
            id="btn-anti-inline-hardcode"
            kind="anti"
            label="Inline hardcode"
            hint="Не bg-* / text-* напряму — використовуй токени з buttonStyles.ts"
            snippet="design:btn-anti-inline-hardcode → use BTN_* tokens, not ad-hoc className"
          >
            <Button className="bg-purple-600 text-white font-bold hover:bg-purple-700 shadow-lg">
              Кастомний колір
            </Button>
          </ButtonShowcase>
        </div>
      </Section>
    </div>
  );
}
