import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
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
  Spinner,
  Tab,
  Tabs,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { parseNumberInput } from '@/lib/numberInput';
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
  CatalogGoodDetailDto,
  CatalogGoodImageDto,
  CatalogUpdateGoodInput,
} from '../../ProductsTypes';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_CURRENCY_ID,
  CATALOG_PRICE_TYPE_MILITARY_ID,
  CATALOG_PRICE_TYPE_RETAIL_ID,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_FINISHED_PRODUCTS_FOLDER_NAME,
  CATALOG_ROOT_ID,
  CATALOG_TRASH_ID,
} from '../../ProductsTypes';
import { DescriptionEditor } from '../DescriptionEditor';
import { ProductImageUpload } from '../ProductImageUpload';
import { StockBadge } from '@/components/StockBadge';
import {
  areRequiredCatalogPricesFilled,
  catalogKitPortionCount,
  catalogMainPrice,
  catalogNameContainsWeight,
  expectedBomWeightKg,
  expectedMilitaryPrice,
  formatCatalogName,
  isArchiveFolderId,
  listCatalogFolderOptions,
  weightsAlmostEqual,
  withSyncedDerivedPrices,
} from '../../ProductsUtils';
import type {
  BarcodeRow,
  BomRow,
  CardTabKey,
  CatalogSearchHit,
  DrawerForm,
  DrawerObjectKind,
  PriceRow,
  ProductDrawerProps,
  RowDeleteKind,
} from './productDrawerTypes';
import { CARD_TABS } from './productDrawerTypes';
import {
  drawerTitle,
  emptyForm,
  formatWeightKg,
  isRequiredPositiveField,
  NESTED_DRAWER_MAX_W,
  NESTED_DRAWER_Z,
  NESTED_OVERLAY_Z,
  newStagingSessionId,
  parseSpecQtyInput,
  resolveObjectKind,
  snapshotState,
  sortDictByName,
} from './productDrawerUtils';
import { BarcodesSection } from './BarcodesSection';
import { BomSection, newBomRowFromSearch } from './BomSection';
import { PricesSection } from './PricesSection';
import { RequisitesSection } from './RequisitesSection';

async function fetchCatalogGoodDetail(id: string): Promise<CatalogGoodDetailDto> {
  const res = await fetch(`/api/catalog/goods/${id}`, { credentials: 'include' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as CatalogGoodDetailDto;
}

export function ProductDrawer({
  mode,
  parentFolderId,
  parentFolderName,
  treeItems,
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
  readOnly = false,
}: ProductDrawerProps) {
  const open = mode != null;
  const isEdit = mode === 'edit';
  const fieldsLocked = saving || readOnly;
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
  /** Батьківська група при створенні (впливає на parentId і SKU) */
  const [createParentId, setCreateParentId] = useState(parentFolderId);
  const [components, setComponents] = useState<BomRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [barcodes, setBarcodes] = useState<BarcodeRow[]>([]);
  const [bomQuery, setBomQuery] = useState('');
  const [bomSuggestions, setBomSuggestions] = useState<CatalogSearchHit[]>([]);
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
      sortDictByName(
        (dictionaries.accPolicies || []).filter(
          (p) => p.id !== CATALOG_ACC_POLICY_GOOD && p.id !== CATALOG_ACC_POLICY_KIT
        )
      ),
    [dictionaries.accPolicies]
  );

  const folderOptions = useMemo(
    () => listCatalogFolderOptions(treeItems || {}),
    [treeItems]
  );

  const createParentName = useMemo(() => {
    const fromOptions = folderOptions.find((f) => f.id === createParentId);
    return fromOptions?.name || parentFolderName || 'Немає';
  }, [folderOptions, createParentId, parentFolderName]);

  const commitBaseline = useCallback(
    (
      nextForm: DrawerForm,
      nextComponents: BomRow[],
      nextPrices: PriceRow[],
      nextBarcodes: BarcodeRow[],
      nextKind: DrawerObjectKind | null,
      nextParentId?: string | null
    ) => {
      baselineRef.current = snapshotState(
        nextForm,
        nextComponents,
        nextPrices,
        nextBarcodes,
        nextKind,
        nextParentId
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
        unitId: c.unitId ?? '',
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
      commitBaseline(nextForm, nextComponents, nextPrices, nextBarcodes, resolvedKind, detail.parentId);
    } else {
      setImages([]);
      const items = treeItems || {};
      let nextParent = parentFolderId || CATALOG_ROOT_ID;
      if (isArchiveFolderId(nextParent, items)) {
        const liveParent = items[nextParent]?.parentId;
        nextParent = !liveParent || liveParent === '0' ? CATALOG_ROOT_ID : liveParent;
      }
      setCreateParentId(nextParent);
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
      commitBaseline(nextForm, [], [], [], kind, nextParent);
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
    if (!open || readOnly) return false;
    void baselineVersion;
    return snapshotState(form, components, prices, barcodes, objectKind, isEdit ? detail?.parentId : createParentId) !== baselineRef.current;
  }, [open, form, components, prices, barcodes, objectKind, baselineVersion, isEdit, detail?.parentId, createParentId]);

  const buildPayload = useCallback((): CatalogCreateGoodInput | CatalogUpdateGoodInput | null => {
    if (!objectKind) return null;
    const name = formatCatalogName(form.name).trim();
    if (!name) return null;

    const packageRatio = form.packageRatio ? parseFloat(form.packageRatio) : null;
    const specQty = isGood ? parseSpecQtyInput(form.specQty) : undefined;
    const weight = parseNumberInput(form.weight);
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
      if (isGood && !isRequiredPositiveField(form.packageRatio)) missing.push('порцій у коробці');
      if (!isRequiredPositiveField(form.weight)) missing.push('вага');
      if (!areRequiredCatalogPricesFilled(prices)) missing.push('основні ціни');
      if (missing.length > 0) {
        ToastService.show({
          title: 'Не заповнені обовʼязкові поля',
          description: `Вкажіть: ${missing.join(', ')}. Значення не можуть бути порожніми або 0.`,
          color: 'warning',
          icon: 'alert-triangle'
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
      parentId: createParentId === CATALOG_ROOT_ID ? null : createParentId,
      isGroup: isFolder,
    };
    // Staging commit на сервері через stagingSessionId у payload
    await onCreate(input);
    setStagingSessionId(null);
  }, [buildPayload, isEdit, detail, onUpdate, onCreate, createParentId, isFolder, isGood, isKit, prices, form.packageRatio, form.weight]);

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
        parentId: createParentId === CATALOG_ROOT_ID ? null : createParentId,
        isGroup: isFolder,
      });
    }
    setShowPayloadPreview(true);
  }, [buildPayload, isEdit, detail, createParentId, isFolder]);

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
          : createParentId === CATALOG_ROOT_ID
            ? 'root'
            : createParentId;
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

  const units = useMemo(
    () =>
      sortDictByName(
        dictionaries.units.length
          ? dictionaries.units
          : [{ id: CATALOG_DEFAULT_MAIN_UNIT_ID, name: 'шт.' }]
      ),
    [dictionaries.units]
  );
  const priceTypes = useMemo(
    () => sortDictByName(dictionaries.priceTypes),
    [dictionaries.priceTypes]
  );
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
        ? expectedBomWeightKg(components, units, {
            divideBy: isGood ? parseSpecQtyInput(form.specQty) : undefined,
            warnMissingPieceWeight: isKit,
          })
        : null,
    [showBom, components, units, isGood, isKit, form.specQty]
  );
  const currentWeightKg = parseNumberInput(form.weight);
  const canFillWeightFromBom = bomWeightExpected != null && bomWeightExpected.kg > 0;
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

  const overlayZ =
    NESTED_OVERLAY_Z[Math.min(stackLevel, NESTED_OVERLAY_Z.length - 1)];

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
            'rounded-t-lg md:rounded-l-xl overflow-hidden flex flex-col max-h-[calc(100%-0.5rem)] md:max-h-full',
            stackLevel > 0
              ? `${NESTED_DRAWER_MAX_W[Math.min(stackLevel, NESTED_DRAWER_MAX_W.length - 1)]} rounded-t-lg md:top-0 md:rounded-t-none md:max-h-full shadow-2xl`
              : '',
          ].join(' '),
          header: `shrink-0 sticky top-0 z-10 bg-content1 flex flex-col gap-3 border-b border-default-200/60 py-3 md:py-4 px-3 md:px-6 md:pb-4 ${detailLoading ? 'hidden' : ''}`,
          body: 'px-3 md:px-6 flex-1 min-h-0 overflow-y-auto',
          footer: 'px-0',
          closeButton: 'absolute top-2 md:top-3 z-20',
        }}
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
                  <span className="font-semibold">Група: <span className="font-normal">{isEdit ? (detail?.parentName || 'Немає') : createParentName}</span></span>
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
          <DrawerBody className={`gap-6 pt-5 pb-0 ${!detailLoading && 'shadow-inner'}`}>
            {isEdit && detailLoading ? (
              <div className="flex justify-center h-full py-10">
                <Spinner label="Завантаження картки…" />
              </div>
            ) : (
              <>
                {cardTab === 'main' && (
                  <>
                    <RequisitesSection
                      form={form}
                      objectKind={objectKind}
                      isCreate={!isEdit}
                      isGood={isGood}
                      isKit={isKit}
                      isOther={isOther}
                      showPrintName={showPrintName}
                      nameHasWeight={nameHasWeight}
                      skuGenerating={skuGenerating}
                      saving={fieldsLocked}
                      otherAccPolicies={otherAccPolicies}
                      folderOptions={folderOptions}
                      selectedFolderId={createParentId}
                      onFolderChange={setCreateParentId}
                      onFormChange={(arg) => {
                        if (typeof arg === 'function') setForm(arg);
                        else setForm((f) => ({ ...f, ...arg }));
                      }}
                      onShowPrintNameToggle={() => setShowPrintName((v) => !v)}
                      onObjectKindChange={handleObjectKindChange}
                      onOtherAccPolicyChange={(id) => {
                        setOtherAccPolicyId(id);
                        setForm((f) => ({ ...f, accPolicyId: id }));
                      }}
                      onGenerateSku={handleGenerateSku}
                    />
                    {hasObjectKind && !isFolder && (
                      <>
                        {showBom && (
                          <BomSection
                            form={form}
                            components={components}
                            units={units}
                            isGood={isGood}
                            isKit={isKit}
                            isAdmin={isAdmin}
                            kitPortionCount={kitPortionCount}
                            packageRatioInvalid={packageRatioInvalid}
                            weightFieldInvalid={weightFieldInvalid}
                            bomQuery={bomQuery}
                            bomSuggestions={bomSuggestions}
                            editingNoteIdx={editingNoteIdx}
                            noteDeleteConfirmIdx={noteDeleteConfirmIdx}
                            rowDeleteConfirm={rowDeleteConfirm}
                            bomWeightExpected={bomWeightExpected}
                            canFillWeightFromBom={canFillWeightFromBom}
                            showExpectedWeightHint={showExpectedWeightHint}
                            onFormChange={setForm}
                            onBomQueryChange={setBomQuery}
                            onAddComponent={(hit) => {
                              const addRow = (prev: BomRow[]) => [
                                ...prev,
                                newBomRowFromSearch(hit, form.mainUnitId),
                              ];
                              if (isKit) patchKitComponents(addRow);
                              else setComponents(addRow);
                              setBomQuery('');
                              setBomSuggestions([]);
                            }}
                            onComponentsChange={setComponents}
                            onPatchKitComponents={patchKitComponents}
                            onOpenNested={openNestedComponent}
                            onEditingNoteIdx={setEditingNoteIdx}
                            onNoteDeleteConfirmIdx={setNoteDeleteConfirmIdx}
                            onRowDeleteConfirm={setRowDeleteConfirm}
                            onFillExpectedWeight={() => {
                              if (!bomWeightExpected) return;
                              setForm((f) => ({
                                ...f,
                                weight: formatWeightKg(bomWeightExpected.kg, 3),
                              }));
                            }}
                            isReadOnly={readOnly}
                          />
                        )}
                        <Divider className="bg-default-200/60" />
                        <PricesSection
                          prices={prices}
                          priceTypes={priceTypes}
                          isGood={isGood}
                          isKit={isKit}
                          kitPortionCount={kitPortionCount}
                          requiredPricesOk={requiredPricesOk}
                          mainPriceValue={mainPriceValue}
                          militaryExpected={militaryExpected}
                          rowDeleteConfirm={rowDeleteConfirm}
                          onApplyPriceRowChange={applyPriceRowChange}
                          onPricesChange={setPrices}
                          onRowDeleteConfirm={setRowDeleteConfirm}
                          isReadOnly={readOnly}
                        />
                        <Divider className="bg-default-200/60" />
                        <BarcodesSection
                          barcodes={barcodes}
                          saving={fieldsLocked}
                          barcodeGeneratingIdx={barcodeGeneratingIdx}
                          rowDeleteConfirm={rowDeleteConfirm}
                          onBarcodesChange={setBarcodes}
                          onGenerateBarcode={handleGenerateBarcode}
                          onOpenBatchPicker={openBatchPicker}
                          onRowDeleteConfirm={setRowDeleteConfirm}
                        />
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
                      isDisabled={fieldsLocked}
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
                      isDisabled={fieldsLocked}
                    />
                    
                    <h3 className="text-sm font-semibold flex items-center gap-1 pt-4">
                      <DynamicIcon name="image" size={14} />
                      <span>Зображення</span>
                    </h3>
                    <ProductImageUpload
                      goodId={isEdit ? detail?.id : null}
                      stagingSessionId={!isEdit ? stagingSessionId : null}
                      images={images}
                      isDisabled={fieldsLocked}
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
            <DrawerFooter className="-mx-3 md:-mx-6 px-3 md:px-6 md:py-5 mt-auto border-t border-default-200/60 bg-content2/75">
              {!readOnly && (isDebugMode ||
                (isTrashed && detail && onRestore) ||
                (isEdit && !isFolder && detail?.sku && onLegacyUpdate) ||
                (isAdmin && isEdit && detail)) && (
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
                        isDisabled={fieldsLocked}
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
                      <DropdownItem
                        key="dilovodId"
                        textValue="Dilovod ID"
                        className={
                          isAdmin && isEdit && detail
                            ? 'font-semibold text-default-700 cursor-default data-[hover=true]:bg-white border-none'
                            : 'hidden'
                        }
                        startContent={
                          <DynamicIcon
                            name="brackets"
                            size={16}
                            className="text-xl text-default-500 pointer-events-none shrink-0"
                          />
                        }
                      >
                        <div className="flex items-center gap-2 justify-between text-xs">
                          {detail?.id || 'Немає ID'}
                          {detail?.id && (
                            <Button
                              variant="flat"
                              size="sm"
                              className="px-2 py-1 min-w-auto h-auto rounded"
                              onPress={() => {
                                void navigator.clipboard.writeText(detail.id);
                              }}
                            >
                              Copy
                            </Button>
                          )}
                        </div>
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}
              <Button variant="light" onPress={requestClose} isDisabled={saving}>
                {readOnly ? 'Закрити' : 'Скасувати'}
              </Button>
              {!readOnly && (
              <Button
                color="primary"
                onPress={() => void handleSave()}
                isDisabled={!hasObjectKind || !form.name.trim() || saving || !isDirty || !requiredFieldsOk}
                startContent={saving ? <DynamicIcon name="loader-2" className="animate-spin" size={14} /> : <DynamicIcon name="save" size={14} />}
              >
                Зберегти
              </Button>
              )}
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
          treeItems={treeItems}
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
          readOnly={readOnly}
        />
      )}
      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title="Перегляд Payload картки товару"
        overlayZClassName={overlayZ}
      />
      <UnsavedChangesModal {...guard.modalProps} overlayZClassName={overlayZ} />
      <ConfirmModal
        isOpen={generateReplace != null}
        overlayZClassName={overlayZ}
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
          overlayZClassName={overlayZ}
        />
      )}
    </>
  );
}
