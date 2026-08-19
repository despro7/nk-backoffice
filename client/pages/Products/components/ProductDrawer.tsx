import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Chip,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Tab,
  Tabs,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useDebug } from '@/contexts/DebugContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { ToastService } from '@/services/ToastService';
import { BatchNumbersAutocomplete } from '@/pages/Warehouse/WarehouseMovement/components/BatchNumbersAutocomplete';
import {
  useBatchNumbers,
  type BatchNumber,
} from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import type {
  CatalogCreateGoodInput,
  CatalogDictionariesDto,
  CatalogGoodDetailDto,
  CatalogUpdateGoodInput,
  DrawerMode,
} from '../ProductsTypes';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_CURRENCY_ID,
  CATALOG_MAIN_PRICE_TYPE_IDS,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
  CATALOG_ROOT_ID,
  CATALOG_TRASH_ID,
} from '../ProductsTypes';
import { pluralize } from '@/lib/formatUtils';
import { DescriptionEditor } from './DescriptionEditor';
import { ProductImageUpload } from './ProductImageUpload';
import { StepperInput } from '@/pages/Warehouse/shared/StepperInput';
import { StockBadge } from '@/components/StockBadge';
import type { CatalogGoodImageDto } from '../ProductsTypes';
import {
  areRequiredCatalogPricesFilled,
  catalogKitPortionCount,
  catalogMainPrice,
  catalogNameContainsWeight,
  expectedBomWeightKg,
  expectedMilitaryPrice,
  formatCatalogName,
  pricesAlmostEqual,
  weightsAlmostEqual,
  withSyncedDerivedPrices,
} from '../ProductsUtils';

interface ProductDrawerProps {
  mode: DrawerMode;
  parentFolderId: string;
  /** Назва батьківської папки для режиму create (коли detail ще немає) */
  parentFolderName?: string | null;
  detail: CatalogGoodDetailDto | null;
  detailLoading?: boolean;
  dictionaries: CatalogDictionariesDto;
  saving?: boolean;
  onClose: () => void;
  onCreate: (input: CatalogCreateGoodInput) => void | Promise<unknown>;
  onUpdate: (
    id: string,
    input: CatalogUpdateGoodInput,
    opts?: { keepOpen?: boolean }
  ) => void | Promise<unknown>;
  /** Відновити зі смітника (вибір папки ззовні) */
  onRestore?: (id: string) => void;
  catalogSearch: (
    q: string,
    opts?: { underFolderName?: string }
  ) => Promise<
    Array<{
      id: string;
      name: string;
      sku: string | null;
      weight?: number | null;
      accPolicyId?: string | null;
    }>
  >;
  onLegacyUpdate?: (id: string) => void;
  legacyUpdating?: boolean;
  /** Глибина вкладеного drawer (GTM-стек) */
  stackLevel?: number;
  /** Id карток у відкритому стеку — щоб не відкривати ту саму двічі */
  stackGoodIds?: string[];
}

interface BomRow {
  componentGoodId: string;
  componentName: string;
  componentSku: string | null;
  qty: number;
  /** Од. виміру рядка (для специфікації продукції; у комплекті зазвичай = mainUnit) */
  unitId: string;
  /** Примітка рядка специфікації ↔ Dilovod tpGoods.remark */
  note: string;
  /** Вага компонента з картки, кг */
  componentWeight: number | null;
  componentAccPolicyId: string | null;
}

interface PriceRow {
  priceType: string;
  price: number;
  currency: string;
}

interface BarcodeRow {
  code: string;
  activity: boolean;
  goodPart: string;
  goodPartName: string;
}

interface DrawerForm {
  name: string;
  sku: string;
  mainUnitId: string;
  packageRatio: string;
  specQty: string;
  weight: string;
  unitRatio: string;
  printName: string;
  description: string;
  fullDescription: string;
  accPolicyId: string;
}

/** 4 основні типи обʼєкта в drawer */
type DrawerObjectKind = 'good' | 'kit' | 'group' | 'other';

type CardTabKey = 'main' | 'content' | 'stickers';

const OBJECT_KIND_TABS: Array<{ key: DrawerObjectKind; title: string; icon: IconName }> = [
  { key: 'good', title: 'Продукція', icon: 'shopping-bag' },
  { key: 'kit', title: 'Товарні набори', icon: 'package' },
  { key: 'group', title: 'Група', icon: 'folder' },
  { key: 'other', title: 'Інший обʼєкт', icon: 'file-spreadsheet' },
];

const CARD_TABS: Array<{ key: CardTabKey; title: string; titleMobile: string; icon: IconName }> = [
  { key: 'main', title: 'Основні дані', titleMobile: 'Основні', icon: 'clipboard-list' },
  { key: 'content', title: 'Опис і зображення', titleMobile: 'Опис', icon: 'images' },
  { key: 'stickers', title: 'Наліпки', titleMobile: 'Наліпки', icon: 'tag' },
];

function resolveObjectKind(
  mode: DrawerMode,
  detail: CatalogGoodDetailDto | null
): DrawerObjectKind | null {
  if (mode === 'create-folder') return 'group';
  // Створення: тип має обрати користувач (select обовʼязковий)
  if (mode === 'create') return null;
  if (detail?.isGroup) return 'group';
  if (detail?.accPolicyId === CATALOG_ACC_POLICY_KIT) return 'kit';
  if (!detail?.accPolicyId || detail.accPolicyId === CATALOG_ACC_POLICY_GOOD) return 'good';
  return 'other';
}

function drawerTitle(kind: DrawerObjectKind | null, isEdit: boolean): string {
  if (!kind) return 'Новий обʼєкт';
  const titles: Record<DrawerObjectKind, { create: string; edit: string }> = {
    good: { create: 'Нова продукція', edit: 'Редагування' },
    kit: { create: 'Новий товарний набір', edit: 'Редагування' },
    group: { create: 'Нова група', edit: 'Редагування' },
    other: { create: 'Новий обʼєкт', edit: 'Редагування' },
  };
  return isEdit ? titles[kind].edit : titles[kind].create;
}

const emptyForm = (): DrawerForm => ({
  name: '',
  sku: '',
  mainUnitId: CATALOG_DEFAULT_MAIN_UNIT_ID,
  packageRatio: '',
  specQty: '1',
  weight: '',
  unitRatio: '1',
  printName: '',
  description: '',
  fullDescription: '',
  accPolicyId: CATALOG_ACC_POLICY_GOOD,
});

function truncateText(text: string, max: number): string {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function snapshotState(
  form: DrawerForm,
  components: BomRow[],
  prices: PriceRow[],
  barcodes: BarcodeRow[],
  objectKind: DrawerObjectKind | null
): string {
  return JSON.stringify({ form, components, prices, barcodes, objectKind });
}

function newStagingSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  return `stg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Вага, кг: завжди округлення до 0,01; `decimals` лише для відображення. */
function formatWeightKg(value: number, decimals: 2 | 3): string {
  const rounded = Math.round(Math.max(0, value) * 100) / 100;
  if (decimals === 3) {
    return rounded.toFixed(3).replace('.', ',');
  }
  const trimmed = rounded.toFixed(2).replace(/\.?0+$/, '');
  return (trimmed || '0').replace('.', ',');
}

function hasComponentWeight(weight: number | null): boolean {
  return weight != null && Number.isFinite(weight) && weight > 0;
}

function showMissingWeightBadge(
  isKitBom: boolean,
  accPolicyId: string | null | undefined,
  hasWeight: boolean
): boolean {
  if (hasWeight) return false;
  if (isKitBom) return true;
  return accPolicyId === CATALOG_ACC_POLICY_GOOD || accPolicyId === CATALOG_ACC_POLICY_KIT;
}

function parseSpecQtyInput(raw: string): number {
  const n = parseFloat(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

async function fetchCatalogGoodDetail(id: string): Promise<CatalogGoodDetailDto> {
  const res = await fetch(`/api/catalog/goods/${id}`, { credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as CatalogGoodDetailDto;
}

const NESTED_DRAWER_Z = ['', '!z-[60]', '!z-[70]', '!z-[80]', '!z-[90]'] as const;
const NESTED_DRAWER_MAX_W = [
  '',
  'max-h-[calc(100dvh-1rem)] top-4 md:max-w-[calc(var(--container-4xl)-2rem)]',
  'max-h-[calc(100dvh-1.5rem)] top-6 md:max-w-[calc(var(--container-4xl)-4rem)]',
  'max-h-[calc(100dvh-2rem)] top-8 md:max-w-[calc(var(--container-4xl)-6rem)]',
  'max-h-[calc(100dvh-2.5rem)] top-10 md:max-w-[calc(var(--container-4xl)-8rem)]',
] as const;

function parseWeightInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Поле заповнене додатним числом (не порожнє і не 0). */
function isRequiredPositiveField(raw: string): boolean {
  const n = parseWeightInput(raw);
  return n != null && n > 0;
}

function sanitizeDecimalInput(raw: string): string {
  let next = raw.replace(/[^\d.,]/g, '');
  const sep = next.includes(',') ? ',' : next.includes('.') ? '.' : null;
  if (sep) {
    const [intPart, ...rest] = next.split(sep);
    next = `${intPart}${sep}${rest.join('').replace(/[.,]/g, '').slice(0, 3)}`;
  }
  return next;
}

function formatQtyDisplay(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return Number(value.toFixed(3)).toString().replace('.', ',');
}

type RowDeleteKind = 'component' | 'price' | 'barcode';

/** Мікро-конфірм видалення рядка: перший клік розгортає «Видалити?», другий — виконує. */
function RowDeleteButton({
  ariaLabel,
  className,
  confirming,
  onRequest,
  onConfirm,
}: {
  ariaLabel: string;
  className?: string;
  confirming: boolean;
  onRequest: () => void;
  onConfirm: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="light"
      color="danger"
      aria-label={confirming ? `Підтвердити: ${ariaLabel}` : ariaLabel}
      className={[
        'h-8 min-w-8 gap-0 overflow-hidden px-2.5 transition-[min-width,padding] duration-200 ease-out',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onPress={() => {
        if (!confirming) {
          onRequest();
          return;
        }
        onConfirm();
      }}
    >
      <DynamicIcon name="trash-2" size={14} className="shrink-0" />
      <span
        className={[
          'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out',
          confirming ? 'max-w-[4.5rem] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0',
        ].join(' ')}
      >
        Видалити?
      </span>
    </Button>
  );
}

/** Decimal qty для специфікації (не комплект): text input з комою/крапкою. */
function BomQtyInput({
  className,
  value,
  onChange,
}: {
  className?: string;
  value: number;
  onChange: (qty: number) => void;
}) {
  const [text, setText] = useState(() => formatQtyDisplay(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatQtyDisplay(value));
    }
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      size="sm"
      className={className}
      aria-label="Кількість"
      value={text}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onValueChange={(v) => {
        const next = sanitizeDecimalInput(v);
        setText(next);
        const n = parseWeightInput(next);
        if (n != null) onChange(Math.max(0, n));
      }}
      onBlur={() => {
        focusedRef.current = false;
        const n = parseWeightInput(text);
        const final = n != null ? Math.max(0, n) : 0;
        onChange(final);
        setText(formatQtyDisplay(final));
      }}
    />
  );
}

export function ProductDrawer({
  mode,
  parentFolderId,
  parentFolderName,
  detail,
  detailLoading,
  dictionaries,
  saving,
  onClose,
  onCreate,
  onUpdate,
  onRestore,
  catalogSearch,
  onLegacyUpdate,
  legacyUpdating,
  stackLevel = 0,
  stackGoodIds = [],
}: ProductDrawerProps) {
  const open = mode != null;
  const isEdit = mode === 'edit';
  const isTrashed = isEdit && detail?.parentId === CATALOG_TRASH_ID;
  const { isDebugMode } = useDebug();
  const { isAdminView: isAdmin } = useRolePreview();
  const { batches, loading: batchesLoading, fetchBatches } = useBatchNumbers();
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  /** Мікро-конфірм видалення примітки: idx, для якого показано «Видалити?» */
  const [noteDeleteConfirmIdx, setNoteDeleteConfirmIdx] = useState<number | null>(null);
  /** Мікро-конфірм видалення компонента / ціни / штрихкоду */
  const [rowDeleteConfirm, setRowDeleteConfirm] = useState<{
    kind: RowDeleteKind;
    idx: number;
  } | null>(null);

  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<Record<string, unknown> | null>(null);

  const [objectKind, setObjectKind] = useState<DrawerObjectKind | null>(null);
  const [cardTab, setCardTab] = useState<CardTabKey>('main');
  const [stagingSessionId, setStagingSessionId] = useState<string | null>(null);
  const [images, setImages] = useState<CatalogGoodImageDto[]>([]);
  const [showPrintName, setShowPrintName] = useState(false);
  /** Запамʼятовує політику вкладки «Інший обʼєкт» між перемиканнями табів */
  const [otherAccPolicyId, setOtherAccPolicyId] = useState<string>('');
  const [skuGenerating, setSkuGenerating] = useState(false);
  const [barcodeGeneratingIdx, setBarcodeGeneratingIdx] = useState<number | null>(null);
  /** Підтвердження заміни при генерації SKU або ШК */
  const [generateReplace, setGenerateReplace] = useState<
    null | { type: 'sku' } | { type: 'barcode'; idx: number }
  >(null);
  /** Індекс рядка ШК, для якого відкрито picker партій */
  const [batchPickerIdx, setBatchPickerIdx] = useState<number | null>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<DrawerForm>(emptyForm);
  const [components, setComponents] = useState<BomRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [barcodes, setBarcodes] = useState<BarcodeRow[]>([]);
  const [bomQuery, setBomQuery] = useState('');
  const [bomSuggestions, setBomSuggestions] = useState<
    Array<{
      id: string;
      name: string;
      sku: string | null;
      weight?: number | null;
      accPolicyId?: string | null;
    }>
  >([]);
  const [nestedGoodId, setNestedGoodId] = useState<string | null>(null);

  const baselineRef = useRef<string>('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  /** Порції після зміни складу набору — щоб не перезаписувати військову ціну при гідрації drawer */
  const pendingMilitarySyncRef = useRef<number | null>(null);

  /** Тип обрано (або вже заданий у edit / create-folder) */
  const hasObjectKind = objectKind != null;
  const isFolder = objectKind === 'group';
  const isKit = objectKind === 'kit';
  const isGood = objectKind === 'good';
  const isOther = objectKind === 'other';
  /** BOM видимий для комплекту («Склад») і продукції («Специфікація») */
  const showBom = isKit || isGood;
  const kitPortionCount = useMemo(() => catalogKitPortionCount(components), [components]);
  const currentStackGoodIds = useMemo(() => {
    const ids = [...stackGoodIds];
    if (detail?.id && !ids.includes(detail.id)) ids.push(detail.id);
    return ids;
  }, [stackGoodIds, detail?.id]);

  const nestedQuery = useQuery({
    queryKey: ['catalog', 'good', nestedGoodId],
    queryFn: () => fetchCatalogGoodDetail(nestedGoodId!),
    enabled: Boolean(nestedGoodId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!nestedQuery.isError || !nestedGoodId) return;
    ToastService.show({
      title: 'Не вдалося відкрити картку',
      description: nestedQuery.error instanceof Error ? nestedQuery.error.message : 'Помилка завантаження',
      color: 'danger',
    });
    setNestedGoodId(null);
  }, [nestedQuery.isError, nestedQuery.error, nestedGoodId]);

  const openNestedComponent = useCallback(
    (componentGoodId: string) => {
      if (!componentGoodId) return;
      if (currentStackGoodIds.includes(componentGoodId) || nestedGoodId === componentGoodId) {
        ToastService.show({
          title: 'Картка вже відкрита',
          description: 'Цей товар уже є у стеку карток.',
          color: 'warning',
        });
        return;
      }
      setNestedGoodId(componentGoodId);
    },
    [currentStackGoodIds, nestedGoodId]
  );

  const applyNestedSaveToBom = useCallback((id: string, input: CatalogUpdateGoodInput) => {
    setComponents((prev) =>
      prev.map((row) =>
        row.componentGoodId === id
          ? {
              ...row,
              componentName: input.name?.trim() || row.componentName,
              componentSku: input.sku === undefined ? row.componentSku : input.sku,
              componentWeight:
                input.weight != null && Number.isFinite(Number(input.weight))
                  ? Number(input.weight)
                  : row.componentWeight,
            }
          : row
      )
    );
  }, []);

  useEffect(() => {
    const portions = pendingMilitarySyncRef.current;
    if (portions == null) return;
    pendingMilitarySyncRef.current = null;
    setPrices((prev) => withSyncedDerivedPrices(prev, true, portions, false));
  }, [components]);

  /** Інші політики обліку (не Продукція / не Товарні набори) */
  const otherAccPolicies = useMemo(
    () =>
      (dictionaries.accPolicies || []).filter(
        (p) => p.id !== CATALOG_ACC_POLICY_GOOD && p.id !== CATALOG_ACC_POLICY_KIT
      ),
    [dictionaries.accPolicies]
  );

  const commitBaseline = useCallback(
    (
      nextForm: DrawerForm,
      nextComponents: BomRow[],
      nextPrices: PriceRow[],
      nextBarcodes: BarcodeRow[],
      nextKind: DrawerObjectKind | null
    ) => {
      baselineRef.current = snapshotState(
        nextForm,
        nextComponents,
        nextPrices,
        nextBarcodes,
        nextKind
      );
      setBaselineVersion((v) => v + 1);
    },
    []
  );

  useEffect(() => {
    if (!open) {
      setNestedGoodId(null);
      return;
    }
    const kind = resolveObjectKind(mode, detail);
    setObjectKind(kind);
    setCardTab('main');
    setRowDeleteConfirm(null);
    setNoteDeleteConfirmIdx(null);

    if (isEdit && detail) {
      // kind у edit завжди визначений через detail
      const resolvedKind = kind ?? 'good';
      setObjectKind(resolvedKind);
      setStagingSessionId(null);
      setImages(detail.images || []);
      const nextForm: DrawerForm = {
        name: detail.name || '',
        sku: detail.sku || '',
        mainUnitId: detail.mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID,
        packageRatio: detail.packageRatio != null ? String(detail.packageRatio) : '',
        specQty: detail.specQty != null && Number(detail.specQty) > 0 ? String(detail.specQty) : '1',
        weight: detail.weight != null ? formatWeightKg(Number(detail.weight), 3) : '',
        unitRatio: detail.unitRatio != null ? String(detail.unitRatio) : '1',
        printName: detail.printName || '',
        description: detail.description === '[object Object]' ? '' : detail.description || '',
        fullDescription: detail.fullDescription || '',
        accPolicyId:
          resolvedKind === 'kit'
            ? CATALOG_ACC_POLICY_KIT
            : resolvedKind === 'good'
              ? CATALOG_ACC_POLICY_GOOD
              : resolvedKind === 'other'
                ? detail.accPolicyId || CATALOG_ACC_POLICY_GOOD
                : detail.accPolicyId || CATALOG_ACC_POLICY_GOOD,
      };
      if (resolvedKind === 'other' && detail.accPolicyId) {
        setOtherAccPolicyId(detail.accPolicyId);
      } else if (!otherAccPolicyId) {
        const firstOther = (dictionaries.accPolicies || []).find(
          (p) => p.id !== CATALOG_ACC_POLICY_GOOD && p.id !== CATALOG_ACC_POLICY_KIT
        );
        if (firstOther) setOtherAccPolicyId(firstOther.id);
      }
      setShowPrintName(Boolean(detail.printName?.trim()));
      const nextComponents = detail.components.map((c) => ({
        componentGoodId: c.componentGoodId,
        componentName: c.componentName || c.componentGoodId,
        componentSku: c.componentSku ?? null,
        qty: c.qty,
        unitId: c.unitId || detail.mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID,
        note: c.note || '',
        componentWeight: c.componentWeight ?? null,
        componentAccPolicyId: c.componentAccPolicyId ?? null,
      }));
      const nextPrices = detail.prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency || CATALOG_DEFAULT_CURRENCY_ID,
      }));
      const nextBarcodes = detail.barcodes.map((b) => ({
        code: b.code,
        activity: b.activity,
        goodPart: b.goodPart || '',
        goodPartName: b.goodPartName || '',
      }));
      setForm(nextForm);
      setComponents(nextComponents);
      setPrices(nextPrices);
      setBarcodes(nextBarcodes);
      commitBaseline(nextForm, nextComponents, nextPrices, nextBarcodes, resolvedKind);
    } else {
      setImages([]);
      // Staging лише після вибору типу (не група); для create-folder kind уже 'group'
      setStagingSessionId(kind === 'group' ? null : kind ? newStagingSessionId() : null);
      const nextForm = emptyForm();
      if (kind === 'kit') nextForm.accPolicyId = CATALOG_ACC_POLICY_KIT;
      if (kind === 'group') nextForm.accPolicyId = CATALOG_ACC_POLICY_GOOD;
      if (kind === 'other') {
        const firstOther = (dictionaries.accPolicies || []).find(
          (p) => p.id !== CATALOG_ACC_POLICY_GOOD && p.id !== CATALOG_ACC_POLICY_KIT
        );
        const otherId = otherAccPolicyId || firstOther?.id || CATALOG_ACC_POLICY_GOOD;
        nextForm.accPolicyId = otherId;
        if (firstOther && !otherAccPolicyId) setOtherAccPolicyId(firstOther.id);
      }
      setShowPrintName(false);
      setForm(nextForm);
      setComponents([]);
      setPrices([]);
      setBarcodes([]);
      commitBaseline(nextForm, [], [], [], kind);
    }
  }, [open, isEdit, detail, mode, commitBaseline, dictionaries.accPolicies]);

  useEffect(() => {
    if (bomQuery.trim().length < 2) {
      setBomSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const opts = isKit
        ? { underFolderName: CATALOG_FINISHED_PRODUCTS_FOLDER_NAME }
        : undefined;
      void catalogSearch(bomQuery.trim(), opts).then((rows) => {
        if (!cancelled) setBomSuggestions(rows.filter((r) => !r.id.startsWith('folder')));
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bomQuery, catalogSearch, isKit]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    void baselineVersion;
    return snapshotState(form, components, prices, barcodes, objectKind) !== baselineRef.current;
  }, [open, form, components, prices, barcodes, objectKind, baselineVersion]);

  const buildPayload = useCallback((): CatalogCreateGoodInput | CatalogUpdateGoodInput | null => {
    if (!objectKind) return null;
    const name = formatCatalogName(form.name).trim();
    if (!name) return null;

    const packageRatio = form.packageRatio ? parseFloat(form.packageRatio) : null;
    const specQty = isGood ? parseSpecQtyInput(form.specQty) : undefined;
    const weight = parseWeightInput(form.weight);
    const unitRatioRaw = form.unitRatio.trim().replace(',', '.');
    const unitRatioParsed = unitRatioRaw ? parseFloat(unitRatioRaw) : null;
    const unitRatio =
      unitRatioParsed != null && Number.isFinite(unitRatioParsed) ? unitRatioParsed : 1;
    const accPolicyId = isFolder
      ? undefined
      : objectKind === 'kit'
        ? CATALOG_ACC_POLICY_KIT
        : objectKind === 'good'
          ? CATALOG_ACC_POLICY_GOOD
          : form.accPolicyId || undefined;

    const base = {
      name,
      isGroup: isFolder,
      sku: isFolder ? null : form.sku.trim() || null,
      mainUnitId: form.mainUnitId,
      packageRatio,
      specQty,
      weight,
      unitRatio: isFolder ? undefined : unitRatio,
      printName: form.printName.trim() || null,
      description: form.description.trim() || null,
      fullDescription: isFolder ? null : form.fullDescription.trim() || null,
      accPolicyId,
    };

    if (!isFolder) {
      return {
        ...base,
        ...(isEdit ? {} : stagingSessionId ? { stagingSessionId } : {}),
        components: showBom
          ? components.map((c, idx) => ({
              componentGoodId: c.componentGoodId,
              qty: c.qty,
              rowNum: idx + 1,
              unitId: c.unitId || form.mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID,
              // Примітка лише для специфікації продукції (не для товарних наборів)
              note: isKit ? null : c.note.trim() || null,
            }))
          : [],
        prices: prices.map((p) => ({
          priceType: p.priceType,
          price: p.price,
          currency: p.currency || CATALOG_DEFAULT_CURRENCY_ID,
        })),
        barcodes: barcodes
          .filter((b) => b.code.trim())
          .map((b) => ({
            code: b.code.trim(),
            activity: b.activity,
            goodPart: b.goodPart.trim() || null,
            goodPartName: b.goodPartName.trim() || null,
          })),
      };
    }

    return {
      ...base,
      components: [],
      prices: [],
      barcodes: [],
    };
  }, [form, isFolder, showBom, objectKind, components, prices, barcodes, isEdit, stagingSessionId, isGood, isKit]);

  const discardStaging = useCallback((sessionId: string | null) => {
    if (!sessionId) return;
    void fetch(`/api/catalog/images/staging/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => undefined);
  }, []);

  const handleSave = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) return;

    if (isGood || isKit) {
      const missing: string[] = [];
      if (!isRequiredPositiveField(form.packageRatio)) missing.push('порцій у коробці');
      if (!isRequiredPositiveField(form.weight)) missing.push('вага');
      if (!areRequiredCatalogPricesFilled(prices)) missing.push('основні ціни');
      if (missing.length > 0) {
        ToastService.show({
          title: 'Не заповнені обовʼязкові поля',
          description: `Вкажіть: ${missing.join(', ')}. Значення не можуть бути порожніми або 0.`,
          color: 'warning',
        });
        setCardTab('main');
        return;
      }
    }

    if (isEdit && detail) {
      const input: CatalogUpdateGoodInput = {
        ...payload,
        parentId: detail.parentId,
        parentName: detail.parentName,
        isGroup: isFolder,
      };
      await onUpdate(detail.id, input);
      return;
    }

    const input: CatalogCreateGoodInput = {
      ...(payload as CatalogCreateGoodInput),
      parentId: parentFolderId === CATALOG_ROOT_ID ? null : parentFolderId,
      isGroup: isFolder,
    };
    // Staging commit на сервері через stagingSessionId у payload
    await onCreate(input);
    setStagingSessionId(null);
  }, [buildPayload, isEdit, detail, onUpdate, onCreate, parentFolderId, isFolder, isGood, isKit, prices, form.packageRatio, form.weight]);

  /** Debug: показати payload, який піде на create/update */
  const handleShowPayload = useCallback(() => {
    const payload = buildPayload();
    if (!payload) {
      ToastService.show({
        title: 'Немає payload',
        description: 'Оберіть тип обʼєкта та вкажіть назву',
        color: 'warning',
      });
      return;
    }

    if (isEdit && detail) {
      setPayloadPreview({
        id: detail.id,
        ...payload,
        parentId: detail.parentId,
        parentName: detail.parentName,
        isGroup: isFolder,
      });
    } else {
      setPayloadPreview({
        ...(payload as CatalogCreateGoodInput),
        parentId: parentFolderId === CATALOG_ROOT_ID ? null : parentFolderId,
        isGroup: isFolder,
      });
    }
    setShowPayloadPreview(true);
  }, [buildPayload, isEdit, detail, parentFolderId, isFolder]);

  const closeAndDiscardStaging = useCallback(() => {
    if (!isEdit && stagingSessionId) {
      discardStaging(stagingSessionId);
      setStagingSessionId(null);
    }
    onClose();
  }, [isEdit, stagingSessionId, discardStaging, onClose]);

  const guard = useUnsavedGuard({
    isDirty,
    onSaveDraft: handleSave,
  });

  const requestClose = guard.guardAction(closeAndDiscardStaging, {
    title: 'Незбережені зміни',
    message: 'У картці є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  const title = drawerTitle(objectKind, isEdit);

  const handleObjectKindChange = (key: DrawerObjectKind) => {
    setObjectKind(key);
    setCardTab('main');
    if (key === 'group') {
      if (stagingSessionId) {
        discardStaging(stagingSessionId);
        setStagingSessionId(null);
      }
      return;
    }
    // Для non-group створюємо staging, якщо ще немає (режим create)
    if (!isEdit && !stagingSessionId) {
      setStagingSessionId(newStagingSessionId());
    }
    if (key === 'kit') {
      setForm((f) => ({ ...f, accPolicyId: CATALOG_ACC_POLICY_KIT }));
      setPrices((prev) =>
        withSyncedDerivedPrices(prev, true, catalogKitPortionCount(components), false)
      );
      return;
    }
    if (key === 'good') {
      setForm((f) => ({ ...f, accPolicyId: CATALOG_ACC_POLICY_GOOD }));
      setPrices((prev) => withSyncedDerivedPrices(prev, false, 1, false));
      return;
    }
    // other — відновлюємо збережену політику; склад BOM лишаємо в state
    const restored =
      otherAccPolicyId ||
      otherAccPolicies[0]?.id ||
      form.accPolicyId;
    setForm((f) => ({ ...f, accPolicyId: restored }));
    if (!otherAccPolicyId && otherAccPolicies[0]?.id) {
      setOtherAccPolicyId(otherAccPolicies[0].id);
    }
  };

  const visibleCardTabs = !hasObjectKind || isFolder
    ? CARD_TABS.filter((t) => t.key === 'main')
    : CARD_TABS;

  const applyGeneratedSku = async () => {
    setSkuGenerating(true);
    try {
      const parentId =
        isEdit && detail
          ? detail.parentId || 'root'
          : parentFolderId === CATALOG_ROOT_ID
            ? 'root'
            : parentFolderId;
      const qs = new URLSearchParams({ parentId });
      if (isEdit && detail?.id) qs.set('excludeId', detail.id);
      const res = await fetch(`/api/catalog/sku/next?${qs.toString()}`, {
        credentials: 'include',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          res.status === 404 || contentType.includes('text/html')
            ? 'Ендпоінт генерації SKU недоступний — перезапустіть dev-сервер'
            : `Неочікувана відповідь сервера (${res.status})`
        );
      }
      const json = (await res.json()) as { success?: boolean; data?: { sku?: string }; error?: string };
      if (!res.ok || !json.success || !json.data?.sku) {
        throw new Error(json.error || 'Не вдалося згенерувати SKU');
      }
      setForm((f) => ({ ...f, sku: json.data!.sku! }));
    } catch (err) {
      ToastService.show({
        title: 'Помилка генерації SKU',
        description: err instanceof Error ? err.message : 'Unknown error',
        color: 'danger',
      });
    } finally {
      setSkuGenerating(false);
    }
  };

  const handleGenerateSku = () => {
    if (form.sku.trim()) {
      setGenerateReplace({ type: 'sku' });
      return;
    }
    void applyGeneratedSku();
  };

  const applyGeneratedBarcode = async (idx: number) => {
    setBarcodeGeneratingIdx(idx);
    try {
      const res = await fetch('/api/catalog/barcode/next', { credentials: 'include' });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          res.status === 404 || contentType.includes('text/html')
            ? 'Ендпоінт генерації ШК недоступний — перезапустіть dev-сервер'
            : `Неочікувана відповідь сервера (${res.status})`
        );
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: { code?: string };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data?.code) {
        throw new Error(json.error || 'Не вдалося згенерувати ШК');
      }
      const code = json.data.code;
      setBarcodes((prev) => prev.map((row, i) => (i === idx ? { ...row, code } : row)));
    } catch (err) {
      ToastService.show({
        title: 'Помилка генерації ШК',
        description: err instanceof Error ? err.message : 'Unknown error',
        color: 'danger',
      });
    } finally {
      setBarcodeGeneratingIdx(null);
    }
  };

  const handleGenerateBarcode = (idx: number) => {
    const current = barcodes[idx]?.code?.trim() || '';
    if (current) {
      setGenerateReplace({ type: 'barcode', idx });
      return;
    }
    void applyGeneratedBarcode(idx);
  };

  const openBatchPicker = (idx: number) => {
    const sku = form.sku.trim();
    if (!sku) {
      ToastService.show({
        title: 'Немає SKU',
        description: 'Спочатку вкажіть SKU товару, щоб знайти партії',
        color: 'warning',
      });
      return;
    }
    setBatchPickerIdx(idx);
    void fetchBatches(sku, undefined, undefined, false, undefined, { includeSmallStorage: true });
  };

  const handleBatchSelect = (batch: BatchNumber) => {
    if (batchPickerIdx == null) return;
    const idx = batchPickerIdx;
    setBarcodes((prev) =>
      prev.map((row, i) =>
        i === idx
          ? { ...row, goodPart: batch.batchId, goodPartName: batch.batchNumber }
          : row
      )
    );
    setBatchPickerIdx(null);
  };

  const units = dictionaries.units.length
    ? dictionaries.units
    : [{ id: CATALOG_DEFAULT_MAIN_UNIT_ID, name: 'шт.' }];
  const priceTypes = dictionaries.priceTypes;
  const mainPriceValue = catalogMainPrice(prices);
  const militaryExpected =
    mainPriceValue != null && Number.isFinite(mainPriceValue)
      ? expectedMilitaryPrice(mainPriceValue, isKit, kitPortionCount)
      : null;
  const requiredPricesOk =
    !isGood && !isKit ? true : areRequiredCatalogPricesFilled(prices);
  const packageRatioInvalid = isGood && !isRequiredPositiveField(form.packageRatio);
  const weightInvalid = (isGood || isKit) && !isRequiredPositiveField(form.weight);
  const bomWeightExpected = useMemo(
    () =>
      showBom
        ? expectedBomWeightKg(components, units, isGood ? { divideBy: parseSpecQtyInput(form.specQty) } : undefined)
        : null,
    [showBom, components, units, isGood, form.specQty]
  );
  const currentWeightKg = parseWeightInput(form.weight);
  const canFillWeightFromBom =
    bomWeightExpected != null && bomWeightExpected.missingCount === 0;
  const weightMismatch =
    bomWeightExpected != null &&
    (currentWeightKg == null || !weightsAlmostEqual(currentWeightKg, bomWeightExpected.kg));
  const showExpectedWeightHint = canFillWeightFromBom && weightMismatch;
  const weightFieldInvalid = weightInvalid && !canFillWeightFromBom;
  const requiredFieldsOk = requiredPricesOk && !packageRatioInvalid && !weightInvalid;
  const nameHasWeight = catalogNameContainsWeight(form.name);

  const patchKitComponents = (updater: (prev: BomRow[]) => BomRow[]) => {
    setComponents((prev) => {
      const next = updater(prev);
      pendingMilitarySyncRef.current = catalogKitPortionCount(next);
      return next;
    });
  };

  const applyPriceRowChange = (idx: number, patch: Partial<PriceRow>) => {
    setPrices((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, ...patch } : row));
      const changedType = next[idx]?.priceType;
      if (changedType === CATALOG_PRICE_TYPE_MILITARY_ID) return next;
      return withSyncedDerivedPrices(
        next,
        isKit,
        kitPortionCount,
        changedType === CATALOG_PRICE_TYPE_RETAIL_ID
      );
    });
  };

  return (
    <>
      <Drawer
        isOpen={open}
        onClose={requestClose}
        size="4xl"
        placement={window.innerWidth < 768 ? 'bottom' : 'right'}
        classNames={{
          wrapper: NESTED_DRAWER_Z[Math.min(stackLevel, NESTED_DRAWER_Z.length - 1)] || undefined,
          backdrop: [
            NESTED_DRAWER_Z[Math.min(stackLevel, NESTED_DRAWER_Z.length - 1)],
            stackLevel > 0 ? 'bg-overlay/20' : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
          base: [
            'rounded-t-lg md:rounded-l-xl overflow-hidden flex flex-col max-h-[calc(100dvh-0.5rem)] md:max-h-none',
            stackLevel > 0
              ? `${NESTED_DRAWER_MAX_W[Math.min(stackLevel, NESTED_DRAWER_MAX_W.length - 1)]} rounded-t-lg md:top-0 md:rounded-t-none md:max-h-full shadow-2xl`
              : '',
          ].join(' '),
          header: `shrink-0 sticky top-0 z-10 bg-content1 flex flex-col gap-3 border-b border-default-200/60 py-3 md:py-4 px-3 md:px-6 md:pb-4 ${detailLoading ? 'hidden' : ''}`,
          body: 'px-3 md:px-6 flex-1 min-h-0 overflow-y-auto',
          footer: 'px-0',
          closeButton: 'absolute top-2 md:top-3 z-20',
        }}
        isDismissable={!isDirty && !nestedGoodId}
        shouldBlockScroll={stackLevel === 0}
        hideCloseButton={false}
      >
        <DrawerContent>
          <DrawerHeader>
            {!detailLoading && (
              <>
              <div className="flex flex-col gap-1">
                <span className="truncate pr-6">
                  {title}
                  {form.name.trim() ? (<span className="font-normal text-default-500"> – {form.name.trim()}</span>) : null}
                </span>
                <div className="flex items-center gap-2 text-xs font-normal text-default-400">
                  <span className="font-semibold">Група: <span className="font-normal">{detail?.parentName || parentFolderName || 'Немає'}</span></span>
                  <Divider orientation="vertical" className="hidden md:block" />
                  <span className="font-semibold hidden md:block">SKU: <span className="font-normal">{detail?.sku || 'відсутній'}</span></span>
                  {detail?.stock ? (
                    <>
                      <Divider orientation="vertical" />
                      <span className="font-semibold flex gap-2">
                        Залишки:{' '}
                        <span className="inline-flex items-center gap-1 font-normal">
                          <StockBadge variant="gp" size="9px" />
                          {detail.stock.mainStock}
                          <span className="text-default-300">/</span>
                          <StockBadge variant="ms" size="9px" />
                          {detail.stock.smallStock}
                        </span>
                      </span>
                    </>
                  ) : null}
                  {isDebugMode && (
                    <>
                    <Divider orientation="vertical" />
                    <span className="font-semibold">
                      id: <span className="font-normal">{detail?.id}</span>
                    </span>
                    </>
                  )}
                </div>
              </div>
              <Tabs
                size="md"
                fullWidth={true}
                color="primary"
                aria-label="Вкладки картки"
                selectedKey={cardTab}
                onSelectionChange={(key) => setCardTab(String(key) as CardTabKey)}
              >
                {visibleCardTabs.map((tab) => (
                  <Tab
                    key={tab.key}
                    title={
                      <div className="flex items-center gap-2">
                        <DynamicIcon name={tab.icon} size={14} />
                        <span className="hidden md:block">{tab.title}</span>
                        <span className="block md:hidden">{tab.titleMobile}</span>
                      </div>
                    }
                  />
                ))}
              </Tabs>
              </>
            )}
          </DrawerHeader>
          <DrawerBody className={`gap-6 pt-5 pb-8 ${!detailLoading && 'shadow-inner'}`}>
            {isEdit && detailLoading ? (
              <div className="flex justify-center h-full py-10">
                <Spinner label="Завантаження картки…" />
              </div>
            ) : (
              <>
                {cardTab === 'main' && (
                  <>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1">
                    <DynamicIcon name="receipt-text" size={14} />
                    <span>Реквізити</span>
                  </h3>
                  <Input
                    label="Назва"
                    value={form.name}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, name: formatCatalogName(v) }))
                    }
                    onBlur={() =>
                      setForm((f) => ({ ...f, name: formatCatalogName(f.name).trim() }))
                    }
                    endContent={
                      <Tooltip content="Додати назву для друку" color="secondary" placement="top-end" showArrow={true} delay={200} classNames={{ base: 'before:rounded-[3px] before:z-[10]', content: 'rounded-sm' }}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="default"
                          aria-label="Назва для друку"
                          className={showPrintName ? 'shadow-inner-sm ' + (form.printName.length > 3 ? 'text-blue-600/75 bg-blue-600/10' : 'text-default-500 bg-default-200/75') : 'text-default-500 hover:text-default-600'}
                          onPress={() => {
                            setShowPrintName(!showPrintName);
                          }}>
                          {showPrintName ? <DynamicIcon name="printer-check" size={16} /> : <DynamicIcon name="printer" size={16} />}
                        </Button>
                      </Tooltip>
                    }
                    isRequired
                    classNames={{
                      description: nameHasWeight ? 'text-warning-700' : undefined,
                    }}
                    description={
                      nameHasWeight
                        ? 'У назві вказана вага – для неї є окреме поле «Вага, кг»'
                        : undefined
                    }
                  />
                  {showPrintName && (
                    <Input
                      label="Назва для друку"
                      value={form.printName}
                      onValueChange={(v) => setForm((f) => ({ ...f, printName: v }))}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* Тип обʼєкта */}
                    <Select
                      label="Тип обʼєкта"
                      placeholder="Оберіть тип"
                      isRequired
                      selectedKeys={objectKind ? [objectKind] : []}
                      classNames={{ 
                        // trigger: 'bg-default-200/75', 
                        popoverContent: 'bg-default-100 w-auto min-w-max'
                      }}
                      onSelectionChange={(keys) => {
                        const v = Array.from(keys)[0];
                        if (!v) return;
                        handleObjectKindChange(String(v) as DrawerObjectKind);
                      }}
                      renderValue={(items) => {
                        const key = items[0]?.key;
                        const tab = OBJECT_KIND_TABS.find((t) => t.key === String(key));
                        if (!tab) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <DynamicIcon name={tab.icon} size={16} className="shrink-0" />
                            {tab.title}
                          </div>
                        );
                      }}
                    >
                      {OBJECT_KIND_TABS.map((tab) => (
                        <SelectItem key={tab.key} textValue={tab.title}>
                          <div className="flex items-center gap-2">
                            <DynamicIcon name={tab.icon} size={16} className="shrink-0" />
                            {tab.title}
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                    {/* Політика обліку */}
                    {isOther && (
                      <Select
                        label="Політика обліку"
                        selectedKeys={form.accPolicyId ? [form.accPolicyId] : []}
                        classNames={{ popoverContent: 'bg-default-100' }}
                        onSelectionChange={(keys) => {
                          const v = Array.from(keys)[0];
                          if (!v) return;
                          const id = String(v);
                          setOtherAccPolicyId(id);
                          setForm((f) => ({ ...f, accPolicyId: id }));
                        }}
                        description={
                          otherAccPolicies.length === 0
                            ? 'Немає інших типів у довіднику accPolicies'
                            : undefined
                        }
                      >
                        {otherAccPolicies.map((p) => (
                          <SelectItem key={p.id}>{p.name}</SelectItem>
                        ))}
                      </Select>
                    )}
                    {/* SKU (артикул) — завжди доступний */}
                    <Input
                      label="SKU (артикул)"
                      value={form.sku}
                      isRequired={isGood || isKit}
                      onValueChange={(v) => setForm((f) => ({ ...f, sku: v }))}
                      endContent={
                        <Tooltip
                          content="Згенерувати SKU автоматично" 
                          color="default" 
                          placement="top-end" 
                          showArrow={true} 
                          delay={200} 
                          classNames={{
                            base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10]',
                            content: 'bg-blue-500 text-white rounded-sm'
                          }}>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="default"
                            className={`text-default-500 hover:text-blue-600/75 hover:bg-blue-600/10!`}
                            aria-label="Генерація SKU"
                            onPress={() => handleGenerateSku()}
                            isLoading={skuGenerating}
                            isDisabled={saving}
                          >
                            <DynamicIcon name="dices" size={16} />
                          </Button>
                        </Tooltip>
                      }
                    />
                  </div>
                </section>

                {hasObjectKind && !isFolder && (
                  <>
                    {showBom && (
                      <>
                        <Divider className="bg-default-200/60" />
                        <section className="space-y-3">
                          <h3 className="text-sm font-semibold flex items-center gap-1">
                            <DynamicIcon name="scaling" size={14} />
                            <span>Упаковка</span>
                          </h3>
                          <div className={`grid gap-3 grid-cols-2 md:grid-cols-${isAdmin ? (isKit ? '3' : '4') : (isKit ? '2' : '3')}`}>
                            <Select
                              label="Од. виміру"
                              selectedKeys={form.mainUnitId ? [form.mainUnitId] : []}
                              classNames={{ popoverContent: 'bg-default-100' }}
                              onSelectionChange={(keys) => {
                                const v = Array.from(keys)[0];
                                if (v) setForm((f) => ({ ...f, mainUnitId: String(v) }));
                              }}
                            >
                              {units.map((u) => (
                                <SelectItem key={u.id}>{u.name}</SelectItem>
                              ))}
                            </Select>
                            {isGood && (
                              <Input
                                label="Порцій в коробці"
                                type="number"
                                value={form.packageRatio}
                                min={1}
                                isRequired={isGood}
                                isInvalid={packageRatioInvalid}
                                color={packageRatioInvalid ? 'danger' : 'default'}
                                errorMessage={
                                  packageRatioInvalid
                                    ? 'Має бути більше 0'
                                    : undefined
                                }
                                onValueChange={(v) => setForm((f) => ({ ...f, packageRatio: v }))}
                                classNames={{
                                  input:
                                    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                }}
                                onWheel={(e) => {
                                  (e.target as HTMLElement).blur();
                                }}
                              />
                            )}
                            <div className="min-w-0">
                              <Input
                                label="Вага, кг"
                                type="text"
                                inputMode="decimal"
                                value={form.weight}
                                step={0.01}
                                isRequired={isGood || isKit}
                                isInvalid={weightFieldInvalid}
                                color="default"
                                errorMessage={
                                  weightFieldInvalid ? 'Має бути більше 0' : undefined
                                }
                                onValueChange={(v) => {
                                  // Allow digits and one comma/dot
                                  let next = v.replace(/[^\d.,]/g, '');
                                  const sep = next.includes(',')
                                    ? ','
                                    : next.includes('.')
                                      ? '.'
                                      : null;
                                  if (sep) {
                                    const [intPart, ...rest] = next.split(sep);
                                    next = `${intPart}${sep}${rest.join('').replace(/[.,]/g, '').slice(0, 3)}`;
                                  }
                                  setForm((f) => ({ ...f, weight: next }));
                                }}
                                onBlur={() => {
                                  setForm((f) => {
                                    if (!f.weight.trim()) return f;
                                    const n = parseWeightInput(f.weight);
                                    if (n == null) return f;
                                    return { ...f, weight: formatWeightKg(n, 3) };
                                  });
                                }}
                              />
                              {showExpectedWeightHint && bomWeightExpected && (
                                <div className="mt-1 flex items-center gap-2">
                                  <span className="text-xs text-warning-700">
                                    Очікується {formatWeightKg(bomWeightExpected.kg, 2)}&nbsp;кг
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="warning"
                                    className="h-5 min-w-0 px-1.5 text-[11px] rounded"
                                    onPress={() =>
                                      setForm((f) => ({
                                        ...f,
                                        weight: formatWeightKg(bomWeightExpected.kg, 3),
                                      }))
                                    }
                                  >
                                    Заповнити
                                  </Button>
                                </div>
                              )}
                            </div>
                            {isAdmin && (
                              <Input
                                className="md:max-w-xs"
                                label="Коефіцієнт (unitRatio)"
                                type="number"
                                inputMode="decimal"
                                value={form.unitRatio}
                                step={0.05}
                                min={0}
                                onValueChange={(v) =>
                                  setForm((f) => ({ ...f, unitRatio: sanitizeDecimalInput(v) }))
                                }
                                onWheel={(e) => {
                                  (e.target as HTMLElement).blur();
                                }}
                              />
                            )}
                          </div>
                        </section>

                        <Divider className="bg-default-200/60" />
                        <section className="flex flex-col gap-1 md:gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2 mb-3 md:mb-0">
                          <h3 className="text-sm font-semibold flex items-center gap-1">
                            {isGood ? 
                              <div className="flex items-center gap-1">
                                <DynamicIcon name="file-text" size={14} />
                                <span>Специфікація товару</span>
                              </div> 
                              :
                              <div className="flex items-center gap-1">
                                <DynamicIcon name="package-2" size={14} />
                                <span>Склад комплекту</span>
                              </div>
                            }
                            {components.length > 0 && (
                              <span className="font-normal text-default-400">
                                {isKit
                                  ? `(${components.length} поз. / ${kitPortionCount} ${pluralize(kitPortionCount, 'порція', 'порції', 'порцій')})`
                                  : `(${components.length} поз.)`}
                              </span>
                            )}
                          </h3>
                          {isGood && (
                            <div className="flex items-center gap-2 ml-4.5 md:ml-auto">
                              <span className="text-sm font-semibold whitespace-nowrap">Розрахунок на</span>
                              <Input
                                aria-label="Розрахунок на, шт."
                                type="number"
                                size="sm"
                                min={1}
                                value={form.specQty}
                                classNames={{
                                  base: 'w-20',
                                  input:
                                    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                }}
                                onValueChange={(v) => setForm((f) => ({ ...f, specQty: v }))}
                                onBlur={() => {
                                  setForm((f) => ({ ...f, specQty: String(parseSpecQtyInput(f.specQty)) }));
                                }}
                                onWheel={(e) => {
                                  (e.target as HTMLElement).blur();
                                }}
                              />
                              <span className="text-sm text-default-500">шт.</span>
                            </div>
                          )}
                          </div>
                          <div className="flex flex-col gap-1 mb-4 md:mb-0">
                            <Input
                              aria-label="Додати компонент"
                              placeholder={
                                isKit
                                  ? `Пошук товарів в категорії «${CATALOG_FINISHED_PRODUCTS_FOLDER_NAME}» (за назвою або sku)`
                                  : 'Почніть пошук щоб додати компонент (за назвою або sku)'
                              }
                              classNames={{ inputWrapper: 'border-1 border-default-200/75', input: 'placeholder:text-default-400/75' }}
                              value={bomQuery}
                              onValueChange={setBomQuery}
                              isClearable
                              startContent={<DynamicIcon name="search" size={14} />}
                            />
                            {bomSuggestions.length > 0 && (
                              <div className="max-h-46 overflow-y-auto rounded-sm border border-default-200">
                                {bomSuggestions.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className="grid grid-cols-[auto_40px] gap-2 w-full items-center justify-between px-3 py-2 text-left text-sm leading-tight hover:bg-default-200/50 [&:not(:last-child)]:border-b border-default-200/50"
                                    onClick={() => {
                                      // Dilovod дозволяє кілька рядків одного інгредієнта
                                      const addRow = (prev: BomRow[]): BomRow[] => [
                                        ...prev,
                                        {
                                          componentGoodId: s.id,
                                          componentName: s.name,
                                          componentSku: s.sku,
                                          qty: 1,
                                          unitId: form.mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID,
                                          note: '',
                                          componentWeight: s.weight ?? null,
                                          componentAccPolicyId: s.accPolicyId ?? null,
                                        },
                                      ];
                                      if (isKit) patchKitComponents(addRow);
                                      else setComponents(addRow);
                                      setBomQuery('');
                                      setBomSuggestions([]);
                                    }}
                                  >
                                    <span>{s.name}</span>
                                    <span className="font-mono text-xs text-default-400">{s.sku}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {components.map((c, idx) => (
                            <div key={`${c.componentGoodId}-${idx}`} className="flex flex-col gap-1.5 [&:not(:last-child)]:border-b border-default-200/60 pb-3">
                              <div className="flex flex-wrap md:flex-nowrap items-center gap-2 gap-y-0.5">
                                <span className="text-sm font-semibold text-right min-w-5 tabular-nums">{idx + 1}.</span>
                                <div className={`min-w-0 ${isKit ? 'w-[calc(100%-2rem)]' : 'w-[calc(100%-9rem)]'} sm:w-auto sm:flex-1 flex items-center gap-2 md:flex-wrap`}>
                                  {c.componentGoodId ? (
                                    <button
                                      type="button"
                                      className={`min-w-0 ${isKit ? 'w-full' : 'w-auto'} md:w-auto flex items-center gap-2 text-left hover:text-primary`}
                                      onClick={() => openNestedComponent(c.componentGoodId)}
                                    >
                                      <span className="truncate text-sm hover:underline mr-auto md:mr-0">
                                        {c.componentName}
                                      </span>
                                      {c.componentSku && (
                                        <span className="font-mono text-xs text-default-400 px-1 py-0.5 bg-default-100 rounded">
                                          {c.componentSku}
                                        </span>
                                      )}
                                      {hasComponentWeight(c.componentWeight) ? (
                                        <span className="text-xs text-default-400 tabular-nums whitespace-nowrap">
                                          {formatWeightKg(c.componentWeight as number, 2)} кг
                                        </span>
                                      ) : showMissingWeightBadge(
                                          isKit,
                                          c.componentAccPolicyId,
                                          false
                                        ) ? (
                                        <Chip
                                          size="sm"
                                          color="danger"
                                          variant="flat"
                                          className="h-5 min-h-5 px-1.5 text-[10px]"
                                        >
                                          немає ваги
                                        </Chip>
                                      ) : null}
                                    </button>
                                  ) : (
                                    <>
                                      <span className="truncate text-sm">{c.componentName}</span>
                                      {c.componentSku && (
                                        <span className="font-mono text-xs text-default-400 px-1 py-0.5 bg-default-100 rounded">
                                          {c.componentSku}
                                        </span>
                                      )}
                                      {hasComponentWeight(c.componentWeight) ? (
                                        <span className="text-xs text-default-400 tabular-nums whitespace-nowrap">
                                          {formatWeightKg(c.componentWeight as number, 2)} кг
                                        </span>
                                      ) : showMissingWeightBadge(
                                          isKit,
                                          c.componentAccPolicyId,
                                          false
                                        ) ? (
                                        <Chip
                                          size="sm"
                                          color="danger"
                                          variant="flat"
                                          className="h-5 min-h-5 px-1.5 text-[10px]"
                                        >
                                          немає ваги
                                        </Chip>
                                      ) : null}
                                    </>
                                  )}
                                  {!isKit && (
                                  <Popover
                                    placement="top-start"
                                    // classNames={{ trigger: 'hidden md:block' }}
                                    isOpen={editingNoteIdx === idx}
                                    onOpenChange={(open) => {
                                      setEditingNoteIdx(open ? idx : null);
                                      if (!open) setNoteDeleteConfirmIdx(null);
                                    }}
                                  >
                                    <PopoverTrigger>
                                      <Button
                                        size="sm"
                                        variant="light"
                                        color={c.note.trim() ? 'warning' : 'default'}
                                        className={`min-w-0 h-6 px-1.5 -my-1.5 ${c.note.trim() ? 'text-warning-700' : 'text-default-400'}`}
                                        aria-label={c.note.trim() ? 'Редагувати примітку' : 'Додати примітку'}
                                        title={c.note.trim() ? 'Редагувати примітку' : 'Додати примітку'}
                                        startContent={
                                          <DynamicIcon
                                            name={
                                              c.note.trim()
                                                ? 'message-circle-more'
                                                : 'message-circle-plus'
                                            }
                                            size={14}
                                            className="shrink-0"
                                          />
                                        }
                                      />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3">
                                      <div className="flex flex-col gap-2 w-full">
                                        <p className="text-xs font-medium text-default-600">
                                          Примітка (Dilovod remark)
                                        </p>
                                        <Input
                                          size="sm"
                                          aria-label="Примітка"
                                          placeholder="Текст примітки…"
                                          value={c.note}
                                          autoFocus
                                          onValueChange={(v) =>
                                            setComponents((prev) =>
                                              prev.map((row, i) =>
                                                i === idx
                                                  ? { ...row, note: v.slice(0, 150) }
                                                  : row
                                              )
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Escape') {
                                              setEditingNoteIdx(null);
                                            }
                                          }}
                                          classNames={{
                                            inputWrapper: 'border-1 border-default-200/50 bg-default-100/75! ring-0!',
                                          }}
                                        />
                                        <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="flat"
                                            color="primary"
                                            className="bg-neutral-600/75 text-neutral-50"
                                            onPress={() => {
                                              setNoteDeleteConfirmIdx(null);
                                              setEditingNoteIdx(null);
                                            }}
                                          >
                                            {c.note.trim() ? 'Редагувати' : 'Додати'}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="light"
                                            color="danger"
                                            aria-label={
                                              noteDeleteConfirmIdx === idx
                                                ? 'Підтвердити видалення примітки'
                                                : 'Видалити примітку'
                                            }
                                            isDisabled={!c.note.trim()}
                                            className={[
                                              'h-8 min-w-8 gap-0 overflow-hidden px-2.5 transition-[min-width,padding] duration-200 ease-out',
                                            ].join(' ')}
                                            onPress={() => {
                                              if (noteDeleteConfirmIdx !== idx) {
                                                setNoteDeleteConfirmIdx(idx);
                                                return;
                                              }
                                              setComponents((prev) =>
                                                prev.map((row, i) =>
                                                  i === idx ? { ...row, note: '' } : row
                                                )
                                              );
                                              setNoteDeleteConfirmIdx(null);
                                              setEditingNoteIdx(null);
                                            }}
                                          >
                                            <DynamicIcon name="trash-2" size={14} className="shrink-0" />
                                            <span
                                              className={[
                                                'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out',
                                                noteDeleteConfirmIdx === idx
                                                  ? 'max-w-[4.5rem] opacity-100 ml-2'
                                                  : 'max-w-0 opacity-0 ml-0',
                                              ].join(' ')}
                                            >
                                              Видалити?
                                            </span>
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  )}
                                </div>

                                {!isKit ? (
                                  <BomQtyInput
                                    className="w-28 ml-7 sm:ml-0 order-last sm:order-none"
                                    value={c.qty || 0}
                                    onChange={(qty) =>
                                      setComponents((prev) =>
                                        prev.map((row, i) => (i === idx ? { ...row, qty } : row))
                                      )
                                    }
                                  />
                                ) : (
                                  <StepperInput
                                    size="xs"
                                    className="w-28 ml-7 sm:ml-4"
                                    inputClassName="text-sm"
                                    aria-label="Кількість"
                                    value={c.qty || 0}
                                    onChange={(v) =>
                                      patchKitComponents((prev) =>
                                        prev.map((row, i) => (i === idx ? { ...row, qty: v } : row))
                                      )
                                    }
                                    onIncrement={() =>
                                      patchKitComponents((prev) =>
                                        prev.map((row, i) =>
                                          i === idx ? { ...row, qty: row.qty + 1 } : row
                                        )
                                      )
                                    }
                                    onDecrement={() =>
                                      patchKitComponents((prev) =>
                                        prev.map((row, i) =>
                                          i === idx
                                            ? { ...row, qty: Math.max(0, row.qty - 1) }
                                            : row
                                        )
                                      )
                                    }
                                  />
                                )}
                                {!isKit && (
                                <Select
                                  aria-label="Од. виміру"
                                  size="sm"
                                  classNames={{ base: 'w-20 order-last sm:order-none', popoverContent: 'bg-default-100 min-w-28' }}
                                  selectedKeys={c.unitId ? [c.unitId] : []}
                                  onSelectionChange={(keys) => {
                                    const v = Array.from(keys)[0];
                                    if (!v) return;
                                    setComponents((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, unitId: String(v) } : row
                                      )
                                    );
                                  }}
                                >
                                  {units.map((u) => (
                                    <SelectItem key={u.id}>{u.name}</SelectItem>
                                  ))}
                                </Select>
                                )}
                                <RowDeleteButton
                                  ariaLabel="Видалити компонент"
                                  className="ml-auto md:ml-0"
                                  confirming={
                                    rowDeleteConfirm?.kind === 'component' &&
                                    rowDeleteConfirm.idx === idx
                                  }
                                  onRequest={() =>
                                    setRowDeleteConfirm({ kind: 'component', idx })
                                  }
                                  onConfirm={() => {
                                    const removeRow = (prev: BomRow[]) =>
                                      prev.filter((_, i) => i !== idx);
                                    if (isKit) patchKitComponents(removeRow);
                                    else setComponents(removeRow);
                                    setRowDeleteConfirm(null);
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </section>
                      </>
                    )}
                    
                    <Divider className="bg-default-200/60" />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1">
                        <DynamicIcon name="wallet" size={14} />
                        <span>Ціни</span>
                        {(isGood || isKit) && (
                          <span className="font-normal text-danger-500">*</span>
                        )}
                      </h3>
                      {!requiredPricesOk && (
                        <p className="text-xs text-warning-700">
                          Обовʼязково вкажіть основні ціни (Роздріб, Звичайна і Військові мають бути більші за 0 грн)
                        </p>
                      )}
                      {prices.map((p, idx) => {
                        const isMilitary = p.priceType === CATALOG_PRICE_TYPE_MILITARY_ID;
                        const militaryMismatch =
                          isMilitary &&
                          militaryExpected != null &&
                          !pricesAlmostEqual(p.price, militaryExpected);
                        const militaryPortions = isKit ? kitPortionCount : 1;
                        return (
                        <div key={idx} className="flex flex-col gap-1">
                        <div className="grid gap-2 grid-cols-[1fr_100px_auto] md:grid-cols-[1fr_100px_auto]">
                          {priceTypes.length > 0 ? (
                            <Select
                              size="md"
                              aria-label="Тип ціни"
                              selectedKeys={p.priceType ? [p.priceType] : []}
                              classNames={{ base: 'min-w-0', popoverContent: 'bg-default-100' }}
                              onSelectionChange={(keys) => {
                                const v = Array.from(keys)[0];
                                if (!v) return;
                                applyPriceRowChange(idx, { priceType: String(v) });
                              }}
                            >
                              {priceTypes.map((t) => (
                                <SelectItem key={t.id}>{t.name}</SelectItem>
                              ))}
                            </Select>
                          ) : (
                            <Input
                              size="md"
                              aria-label="Тип ціни (id)"
                              value={p.priceType}
                              onValueChange={(v) => applyPriceRowChange(idx, { priceType: v })}
                            />
                          )}
                          <Input
                            size="md"
                            aria-label="Ціна, грн"
                            type="number"
                            value={String(p.price)}
                            color={militaryMismatch ? 'danger' : 'default'}
                            endContent={<span className="text-xs text-default-400/75">грн</span>}
                            classNames={{
                              input: '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                            }}
                            onValueChange={(v) =>
                              applyPriceRowChange(idx, { price: parseFloat(v) || 0 })
                            }
                            onWheel={(e) => {
                              (e.target as HTMLElement).blur();
                            }}
                          />
                          <RowDeleteButton
                            ariaLabel="Видалити ціну"
                            className="h-full"
                            confirming={
                              rowDeleteConfirm?.kind === 'price' &&
                              rowDeleteConfirm.idx === idx
                            }
                            onRequest={() =>
                              setRowDeleteConfirm({ kind: 'price', idx })
                            }
                            onConfirm={() => {
                              setPrices((prev) =>
                                withSyncedDerivedPrices(
                                  prev.filter((_, i) => i !== idx),
                                  isKit,
                                  kitPortionCount,
                                  false
                                )
                              );
                              setRowDeleteConfirm(null);
                            }}
                          />
                        </div>
                        {militaryMismatch && militaryExpected != null && mainPriceValue != null && (
                          <p className="text-xs text-danger">
                            Очікується {militaryExpected} грн (звичайна ціна {mainPriceValue} −{' '}
                            {isKit ? `${militaryPortions}×5` : '5'})
                          </p>
                        )}
                        </div>
                        );
                      })}
                      <Button
                        size="sm"
                        variant="solid"
                        color="primary"
                        className="bg-neutral-600/75 text-neutral-50 hover:bg-neutral-500/75"
                        startContent={<DynamicIcon name="plus-circle" size={14} />}
                        onPress={() => {
                          if (prices.length === 0) {
                            setPrices(
                              CATALOG_MAIN_PRICE_TYPE_IDS.map((priceType) => ({
                                priceType,
                                price: 0,
                                currency: CATALOG_DEFAULT_CURRENCY_ID,
                              }))
                            );
                            return;
                          }
                          setPrices((prev) => [
                            ...prev,
                            {
                              priceType: priceTypes[0]?.id || '',
                              price: 0,
                              currency: CATALOG_DEFAULT_CURRENCY_ID,
                            },
                          ]);
                        }}
                      >
                        {prices.length === 0 ? 'Додати основні ціни' : 'Додати ціну'}
                      </Button>
                    </section>

                    <Divider className="bg-default-200/60" />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-1">
                        <DynamicIcon name="scan-barcode" size={14} />
                        <span>Штрихкоди</span>
                      </h3>
                      {barcodes.map((b, idx) => (
                        <div key={idx} className="grid grid-cols-[5fr_4fr_auto] gap-2">
                          <Input
                            size="md"
                            aria-label="Штрихкод"
                            labelPlacement="outside"
                            placeholder="Введіть або згенеруйте штрихкод"
                            classNames={{
                              base: 'flex-1',
                              // inputWrapper: 'rounded-md',
                            }}
                            value={b.code}
                            onValueChange={(v) =>
                              setBarcodes((prev) =>
                                prev.map((row, i) => (i === idx ? { ...row, code: v } : row))
                              )
                            }
                            endContent={
                              <Tooltip
                                content="Згенерувати ШК автоматично"
                                placement="top-end"
                                showArrow={true}
                                color="default"
                                delay={200}
                                classNames={{
                                  base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10]',
                                  content: 'bg-blue-500 text-white rounded-sm'
                                }}>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  color="default"
                                  className={`text-default-500 hover:text-blue-600/75 hover:bg-blue-600/10! -mr-2`}
                                  aria-label="Генерувати ШК автоматично"
                                  onPress={() => handleGenerateBarcode(idx)}
                                  isLoading={barcodeGeneratingIdx === idx}
                                  isDisabled={saving || barcodeGeneratingIdx != null}
                                >
                                  <DynamicIcon name="dices" size={16} />
                                </Button>
                              </Tooltip>
                            }
                          />
                          <Input
                            size="md"
                            aria-label="Номер партії"
                            labelPlacement="outside"
                            placeholder="Оберіть партію…"
                            value={b.goodPartName}
                            isReadOnly
                            classNames={{
                              base: 'flex-1',
                              inputWrapper: 'cursor-pointer',
                              input: 'cursor-pointer',
                            }}
                            onClick={() => openBatchPicker(idx)}
                            endContent={
                              <DynamicIcon
                                name="chevrons-up-down"
                                size={14}
                                className="shrink-0 text-default-400"
                              />
                            }
                          />
                          <RowDeleteButton
                            ariaLabel="Видалити ШК"
                            className="shrink-0 h-10"
                            confirming={
                              rowDeleteConfirm?.kind === 'barcode' &&
                              rowDeleteConfirm.idx === idx
                            }
                            onRequest={() =>
                              setRowDeleteConfirm({ kind: 'barcode', idx })
                            }
                            onConfirm={() => {
                              setBarcodes((prev) => prev.filter((_, i) => i !== idx));
                              setRowDeleteConfirm(null);
                            }}
                          />
                        </div>
                      ))}
                      <Button
                        size="sm"
                        color="secondary"
                        aria-label="Додати ШК"
                        className="bg-neutral-600/75 text-neutral-50 hover:bg-neutral-500/75"
                        startContent={<DynamicIcon name="plus-circle" size={14} />}
                        onPress={() =>
                          setBarcodes((prev) => [
                            ...prev,
                            { code: '', activity: true, goodPart: '', goodPartName: '' },
                          ])
                        }
                      >
                        Додати ШК
                      </Button>
                    </section>
                  </>
                )}
                  </>
                )}

                {cardTab === 'content' && hasObjectKind && !isFolder && (
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-1">
                      <DynamicIcon name="file-text" size={14} />
                      <span>Короткий опис</span>
                    </h3>
                    <DescriptionEditor
                      aria-label="Короткий опис"
                      value={form.description}
                      onChange={(html) => setForm((f) => ({ ...f, description: html }))}
                      isDisabled={saving}
                    />
                    
                    <h3 className="text-sm font-semibold flex items-center gap-1 pt-4">
                      <DynamicIcon name="file-text" size={14} />
                      <span>Повний опис</span>
                    </h3>
                    <DescriptionEditor
                      aria-label="Повний опис"
                      value={form.fullDescription}
                      onChange={(html) => setForm((f) => ({ ...f, fullDescription: html }))}
                      minHeightClass="min-h-[160px]"
                      isDisabled={saving}
                    />
                    
                    <h3 className="text-sm font-semibold flex items-center gap-1 pt-4">
                      <DynamicIcon name="image" size={14} />
                      <span>Зображення</span>
                    </h3>
                    <ProductImageUpload
                      goodId={isEdit ? detail?.id : null}
                      stagingSessionId={!isEdit ? stagingSessionId : null}
                      images={images}
                      isDisabled={saving}
                      onImagesChange={setImages}
                    />
                  </section>
                )}

                {cardTab === 'stickers' && hasObjectKind && !isFolder && (
                  <section className="flex flex-col items-center justify-center gap-4 py-14 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-default-100">
                      <DynamicIcon name="printer" size={28} className="text-default-400" />
                    </div>
                    <div className="max-w-sm space-y-1.5">
                      <p className="text-sm font-semibold text-default-700">Наліпки для друку</p>
                      <p className="text-sm leading-relaxed text-default-400">
                        У цьому розділі буде генерація наліпок товару: назва, вага, штрихкод
                        та інші дані для друку на етикетках.
                      </p>
                    </div>
                  </section>
                )}
              </>
            )}
          {!detailLoading && (
            <DrawerFooter className="-mx-3 md:-mx-6 px-3 md:px-6 mt-2 border-t border-default-200/60">
              {(isDebugMode ||
                (isTrashed && detail && onRestore) ||
                (isEdit && !isFolder && detail?.sku && onLegacyUpdate)) && (
                <div className="mr-auto">
                  <Dropdown placement="top-start">
                    <DropdownTrigger>
                      <Button
                        variant="flat"
                        aria-label="Дії"
                        endContent={<DynamicIcon name="chevron-down" size={16} />}
                      >
                        Дії
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Дії з карткою"
                      onAction={(key) => {
                        switch (String(key)) {
                          case 'payload':
                            handleShowPayload();
                            break;
                          case 'restoreTrash':
                            if (detail && onRestore) onRestore(detail.id);
                            break;
                          case 'legacyUpdate':
                            if (detail && onLegacyUpdate) onLegacyUpdate(detail.id);
                            break;
                          default:
                            break;
                        }
                      }}
                    >
                      <DropdownItem
                        key="payload"
                        className={isDebugMode ? 'text-primary' : 'hidden'}
                        startContent={<DynamicIcon name="code-2" size={16} className="shrink-0" />}
                      >
                        Payload
                      </DropdownItem>
                      <DropdownItem
                        key="restoreTrash"
                        className={isTrashed && detail && onRestore ? 'text-warning' : 'hidden'}
                        isDisabled={saving}
                        startContent={
                          <DynamicIcon name="archive-restore" size={16} className="shrink-0" />
                        }
                      >
                        Відновити зі смітника
                      </DropdownItem>
                      <DropdownItem
                        key="legacyUpdate"
                        className={
                          isEdit && !isFolder && detail?.sku && onLegacyUpdate
                            ? 'text-lime-600'
                            : 'hidden'
                        }
                        isDisabled={saving || legacyUpdating}
                        startContent={
                          <DynamicIcon
                            name={legacyUpdating ? 'refresh-cw' : 'database'}
                            size={16}
                            className={`shrink-0 ${legacyUpdating ? 'animate-spin' : ''}`}
                          />
                        }
                      >
                        Синхронізувати товар
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}
              <Button variant="light" onPress={requestClose} isDisabled={saving}>
                Скасувати
              </Button>
              <Button
                color="primary"
                onPress={() => void handleSave()}
                // isLoading={saving}
                isDisabled={!hasObjectKind || !form.name.trim() || saving || !isDirty || !requiredFieldsOk}
                startContent={saving ? <DynamicIcon name="loader-2" className="animate-spin" size={14} /> : <DynamicIcon name="save" size={14} />}
              >
                Зберегти
              </Button>
            </DrawerFooter>
          )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
      {nestedGoodId && (
        <ProductDrawer
          mode="edit"
          parentFolderId={nestedQuery.data?.parentId || CATALOG_ROOT_ID}
          parentFolderName={nestedQuery.data?.parentName}
          detail={nestedQuery.data ?? null}
          detailLoading={nestedQuery.isLoading || !nestedQuery.data}
          dictionaries={dictionaries}
          saving={saving}
          onClose={() => setNestedGoodId(null)}
          onCreate={onCreate}
          onUpdate={async (id, input, opts) => {
            await onUpdate(id, input, { ...opts, keepOpen: true });
            applyNestedSaveToBom(id, input);
          }}
          onRestore={onRestore}
          catalogSearch={catalogSearch}
          onLegacyUpdate={onLegacyUpdate}
          legacyUpdating={legacyUpdating}
          stackLevel={stackLevel + 1}
          stackGoodIds={currentStackGoodIds}
        />
      )}
      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title="Перегляд Payload картки товару"
      />
      <UnsavedChangesModal {...guard.modalProps} />
      <ConfirmModal
        isOpen={generateReplace != null}
        title={generateReplace?.type === 'sku' ? 'Замінити SKU?' : 'Замінити штрихкод?'}
        message={
          generateReplace?.type === 'sku'
            ? `У полі вже є SKU «${form.sku}». Згенерувати новий і замінити?`
            : generateReplace?.type === 'barcode'
              ? `У полі вже є штрихкод «${barcodes[generateReplace.idx]?.code || ''}». Згенерувати новий і замінити?`
              : ''
        }
        confirmText="Замінити"
        cancelText="Скасувати"
        confirmColor="warning"
        onConfirm={() => {
          const pending = generateReplace;
          setGenerateReplace(null);
          if (pending?.type === 'sku') {
            void applyGeneratedSku();
          } else if (pending?.type === 'barcode') {
            void applyGeneratedBarcode(pending.idx);
          }
        }}
        onCancel={() => setGenerateReplace(null)}
      />
      {batchPickerIdx != null && (
        <BatchNumbersAutocomplete
          batches={batches}
          isOpen={batchPickerIdx != null}
          isLoading={batchesLoading}
          selectedBatch={barcodes[batchPickerIdx]?.goodPartName || ''}
          selectedStorage=""
          includeAllStorages
          onSelect={handleBatchSelect}
          onClose={() => setBatchPickerIdx(null)}
          onRefresh={() => {
            const sku = form.sku.trim();
            if (sku) {
              void fetchBatches(sku, undefined, undefined, true, undefined, {
                includeSmallStorage: true,
              });
            }
          }}
          inputRef={batchInputRef}
        />
      )}
    </>
  );
}
