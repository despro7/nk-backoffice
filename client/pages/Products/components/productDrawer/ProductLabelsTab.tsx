import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
  Spinner,
  Tab,
  Tabs,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { saveAs } from 'file-saver';
import type { CatalogGoodDetailDto } from '../../ProductsTypes';
import type { BatchNumber } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import { BatchNumbersAutocomplete } from '@/pages/Warehouse/WarehouseMovement/components/BatchNumbersAutocomplete';
import { useBatchNumbers } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import { ProductLabelService } from '@/services/ProductLabelService';
import { ToastService } from '@/services/ToastService';
import PrinterService from '@/services/printerService';
import type {
  ProductLabelKind,
  ProductLabelPayload,
  ProductLabelPublishedDto,
} from '@shared/types/productLabel';
import {
  ensureNutritionText,
  getNutritionValidationErrors,
  isNutritionTextComplete,
} from '@shared/utils/productLabelNutrition';
import {
  ensureStorageText,
  prepareProductLabelForRender,
  resolveLabelExpiryDate,
} from '@shared/utils/productLabel';
import { ensureSplitTitle } from '@shared/utils/splitProductTitle';
import { ProductLabelPreview } from './ProductLabelPreview';

interface ProductLabelsTabProps {
  detail: CatalogGoodDetailDto;
  readOnly?: boolean;
  isAdmin?: boolean;
}

const EMPTY_PAYLOAD = (kind: ProductLabelKind): ProductLabelPayload => ({
  labelKind: kind,
  batchId: '',
  batchNumber: '',
  barcode: '',
  title: { line1: '', line2: '', line1FontSize: 14, line2FontSize: 11, align: 'center' },
  ingredientsText: '',
  nutritionText: '',
  nutritionEnergyManual: false,
  storageText: '',
  expiresAt: '',
  netWeightLabel: '',
});

export function ProductLabelsTab({ detail, readOnly, isAdmin = false }: ProductLabelsTabProps) {
  const [labelKind, setLabelKind] = useState<ProductLabelKind>('portion');
  const [payload, setPayload] = useState<ProductLabelPayload>(() => EMPTY_PAYLOAD('portion'));
  const [published, setPublished] = useState<ProductLabelPublishedDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<BatchNumber | null>(null);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewingVersion, setViewingVersion] = useState(false);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [userPickedBatch, setUserPickedBatch] = useState(false);

  const preferPublishedIdRef = useRef<number | undefined>(undefined);

  const { batches, loading: batchesLoading, error: batchesError, fetchBatches } = useBatchNumbers();

  const sku = detail.sku || '';

  useEffect(() => {
    if (!sku) return;
    void fetchBatches(sku, undefined, undefined, false, undefined, { includeSmallStorage: true });
  }, [sku, fetchBatches]);

  useEffect(() => {
    setUserPickedBatch(false);
    setSelectedBatch(null);
    setSelectedVersionId('');
    setPublished([]);
    setViewingVersion(false);
    preferPublishedIdRef.current = undefined;
  }, [labelKind]);

  const loadLabelState = useCallback(
    async (
      batch: BatchNumber,
      kind: ProductLabelKind,
      options?: { preferPublishedId?: number },
    ) => {
      if (!detail.id || !batch.batchId) return;
      setLoading(true);
      setViewingVersion(false);
      try {
        let draft = await ProductLabelService.getDraft(detail.id, batch.batchId, kind);
        if (!draft) {
          draft = await ProductLabelService.seedDraft(detail.id, {
            batchId: batch.batchId,
            labelKind: kind,
            batchNumber: batch.batchNumber,
            expiration: batch.expiration,
          });
        }
        const versions = await ProductLabelService.listPublished(detail.id, batch.batchId, kind);
        setPublished(versions);

        const preferId = options?.preferPublishedId ?? preferPublishedIdRef.current;
        preferPublishedIdRef.current = undefined;
        const preferred = preferId ? versions.find((v) => v.id === preferId) : undefined;

        if (preferred) {
          setPayload(preferred.payload);
          setSelectedVersionId(String(preferred.id));
          setViewingVersion(true);
          return;
        }

        setPayload({
          ...draft.payload,
          title: ensureSplitTitle(draft.payload.title, detail.name, detail.printName),
          nutritionText: ensureNutritionText(draft.payload.nutritionText),
          storageText: ensureStorageText(draft.payload.storageText),
          nutritionEnergyManual: Boolean(draft.payload.nutritionEnergyManual),
          expiresAt: resolveLabelExpiryDate(draft.payload.expiresAt, batch.expiration),
        });
        setSelectedVersionId(versions[0] ? String(versions[0].id) : '');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Помилка завантаження наліпки';
        ToastService.show({ title: 'Наліпки', description: message, color: 'danger' });
      } finally {
        setLoading(false);
      }
    },
    [detail.id, detail.name, detail.printName],
  );

  useEffect(() => {
    if (!selectedBatch) return;
    void loadLabelState(selectedBatch, labelKind);
  }, [selectedBatch, labelKind, loadLabelState]);

  useEffect(() => {
    if (!detail.id || userPickedBatch || selectedBatch) return;

    let cancelled = false;
    void (async () => {
      try {
        const latest = await ProductLabelService.getLatestPublished(detail.id, labelKind);
        if (cancelled || !latest) return;

        const batchFromList = batches.find((b) => b.batchId === latest.batchId);
        const batch: BatchNumber =
          batchFromList ??
          ({
            batchId: latest.batchId,
            batchNumber: latest.batchNumber,
            storage: '',
            storageDisplayName: '',
            quantity: 0,
            firm: '',
            firmDisplayName: '',
            expiration: latest.payload.expiresAt || null,
          } satisfies BatchNumber);

        preferPublishedIdRef.current = latest.id;
        setSelectedBatch(batch);
      } catch {
        // Користувач обере партію вручну
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detail.id, labelKind, batches, userPickedBatch, selectedBatch]);

  const selectedVersion = useMemo(
    () => published.find((p) => String(p.id) === selectedVersionId) ?? null,
    [published, selectedVersionId],
  );

  const versionOptions = useMemo(
    () =>
      published.map((row) => ({
        key: String(row.id),
        label: `v${row.version} · ${new Date(row.publishedAt).toLocaleString('uk-UA')}`,
      })),
    [published],
  );

  const handleBatchSelect = (batch: BatchNumber) => {
    setUserPickedBatch(true);
    setSelectedBatch(batch);
    setBatchPickerOpen(false);
  };

  const patchPayload = (patch: Partial<ProductLabelPayload>) => {
    setViewingVersion(false);
    setPayload((prev) => ({ ...prev, ...patch }));
  };

  const handleVersionSelect = (key: string) => {
    setSelectedVersionId(key);
    const row = published.find((p) => String(p.id) === key);
    if (row) {
      setPayload(row.payload);
      setViewingVersion(true);
    }
  };

  const nutritionErrors = useMemo(
    () => getNutritionValidationErrors(payload.nutritionText),
    [payload.nutritionText],
  );
  const nutritionIncomplete = !isNutritionTextComplete(payload.nutritionText);

  const handleSaveDraft = async () => {
    if (!selectedBatch || readOnly || viewingVersion) return;
    setSaving(true);
    try {
      const preparedPayload = prepareProductLabelForRender(payload);
      const data = await ProductLabelService.saveDraft(detail.id, {
        batchId: selectedBatch.batchId,
        labelKind,
        batchNumber: selectedBatch.batchNumber,
        payload: preparedPayload,
      });
      setPayload(data.payload);
      ToastService.show({
        title: 'Чернетку збережено!',
        description: nutritionIncomplete
          ? 'Але поживна цінність ще не заповнена повністю'
          : undefined,
        color: nutritionIncomplete ? 'warning' : 'success',
      });
    } catch (err) {
      ToastService.show({
        title: 'Помилка збереження!',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedBatch || readOnly) return;
    if (nutritionIncomplete) {
      ToastService.show({
        title: 'Заповніть поживну цінність',
        description: nutritionErrors[0] || 'Усі 4 рядки мають містити числові значення',
        color: 'warning',
      });
      return;
    }
    setGenerating(true);
    try {
      const preparedPayload = prepareProductLabelForRender(payload);
      await ProductLabelService.saveDraft(detail.id, {
        batchId: selectedBatch.batchId,
        labelKind,
        batchNumber: selectedBatch.batchNumber,
        payload: preparedPayload,
      });
      const row = await ProductLabelService.generatePublished(detail.id, preparedPayload);
      const versions = await ProductLabelService.listPublished(
        detail.id,
        selectedBatch.batchId,
        labelKind,
      );
      setPublished(versions);
      setSelectedVersionId(String(row.id));
      setViewingVersion(true);
      ToastService.show({
        title: 'PDF згенеровано',
        description: `Версія v${row.version}`,
        color: 'success',
      });
    } catch (err) {
      ToastService.show({
        title: 'Помилка генерації PDF',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setGenerating(false);
    }
  };

  const resolveVersionId = (): number | null => {
    if (selectedVersionId) return parseInt(selectedVersionId, 10);
    return published[0]?.id ?? null;
  };

  const handleDownload = async () => {
    const labelId = resolveVersionId();
    if (!labelId) {
      ToastService.show({ title: 'Спочатку згенеруйте PDF', color: 'warning' });
      return;
    }
    try {
      const res = await fetch(ProductLabelService.pdfUrl(detail.id, labelId), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const version = published.find((p) => p.id === labelId);
      saveAs(blob, version?.pdfFileName || `label-${labelId}.pdf`);
    } catch (err) {
      ToastService.show({
        title: 'Помилка завантаження',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    }
  };

  const printPdfInBrowser = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 500);
      };
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      URL.revokeObjectURL(url);
      throw new Error('Браузер заблокував вікно друку');
    }
  };

  const fetchSelectedPdfBlob = async (): Promise<Blob> => {
    const labelId = resolveVersionId();
    if (!labelId) {
      throw new Error('Спочатку згенеруйте PDF');
    }
    const res = await fetch(ProductLabelService.pdfUrl(detail.id, labelId), {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  const handlePrintBrowser = async () => {
    setPrinting(true);
    try {
      const blob = await fetchSelectedPdfBlob();
      printPdfInBrowser(blob);
    } catch (err) {
      ToastService.show({
        title: 'Помилка друку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintQz = async () => {
    const labelId = resolveVersionId();
    if (!labelId) {
      ToastService.show({ title: 'Спочатку згенеруйте PDF', color: 'warning' });
      return;
    }
    const copies = Math.min(999, Math.max(1, printQuantity));
    setPrinting(true);
    try {
      const res = await fetch('/api/settings/equipment', { credentials: 'include' });
      const json = await res.json();
      const printerName = json?.data?.printer?.name as string | undefined;
      if (!printerName) {
        throw new Error('Принтер не налаштовано (Налаштування → Обладнання)');
      }
      const base64 = await ProductLabelService.fetchPdfBase64(detail.id, labelId);
      for (let i = 0; i < copies; i += 1) {
        await PrinterService.printPdf(printerName, base64);
      }
    } catch (err) {
      ToastService.show({
        title: 'Помилка друку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleDeleteVersion = async () => {
    const labelId = resolveVersionId();
    if (!labelId || !isAdmin) return;
    const row = published.find((p) => p.id === labelId);
    if (!row) return;
    const confirmed = window.confirm(
      `Видалити версію v${row.version} від ${new Date(row.publishedAt).toLocaleString('uk-UA')}?`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await ProductLabelService.deletePublished(detail.id, labelId);
      if (!selectedBatch) return;
      const versions = await ProductLabelService.listPublished(
        detail.id,
        selectedBatch.batchId,
        labelKind,
      );
      setPublished(versions);
      if (versions[0]) {
        setSelectedVersionId(String(versions[0].id));
        setPayload(versions[0].payload);
        setViewingVersion(true);
      } else {
        setSelectedVersionId('');
        setViewingVersion(false);
        await loadLabelState(selectedBatch, labelKind);
      }
      ToastService.show({ title: 'Версію видалено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Помилка видалення',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleCloneVersion = () => {
    const labelId = resolveVersionId();
    const row = published.find((p) => p.id === labelId);
    if (!row) return;
    setPayload(row.payload);
    setViewingVersion(false);
    ToastService.show({ title: 'Версію скопійовано в чернетку', color: 'success' });
  };

  if (!sku) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        Для наліпок потрібен артикул (SKU) товару.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Tabs
            selectedKey={labelKind}
            onSelectionChange={(key) => setLabelKind(key as ProductLabelKind)}
            size="md"
            fullWidth
            color="primary"
            aria-label="Тип наліпки"
          >
            <Tab key="portion" title="Порція" />
            <Tab key="box" title="Коробка" isDisabled />
          </Tabs>

          <Input
            size="md"
            label="Номер партії"
            labelPlacement="outside"
            placeholder="Оберіть партію…"
            value={selectedBatch?.batchNumber || ''}
            isReadOnly
            onClick={() => setBatchPickerOpen(true)}
            classNames={{ input: 'cursor-pointer' }}
            endContent={
              <Button
                isIconOnly
                size="sm"
                variant="light"
                aria-label="Обрати партію"
                onPress={() => setBatchPickerOpen(true)}
              >
                <DynamicIcon name="chevrons-up-down" size={16} />
              </Button>
            }
          />
          {batchesError ? <p className="text-xs text-danger">{batchesError}</p> : null}

          {versionOptions.length > 0 ? (
            <div className="flex items-end gap-2">
              <Select
                label="Версія"
                labelPlacement="outside"
                size="md"
                className="min-w-0 flex-1"
                selectedKeys={selectedVersionId ? [selectedVersionId] : []}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  if (key) handleVersionSelect(String(key));
                }}
              >
                {versionOptions.map((opt) => (
                  <SelectItem key={opt.key}>{opt.label}</SelectItem>
                ))}
              </Select>
              {isAdmin ? (
                <Button
                  isIconOnly
                  size="md"
                  variant="flat"
                  color="danger"
                  aria-label="Видалити версію"
                  onPress={() => void handleDeleteVersion()}
                  isLoading={deleting}
                  isDisabled={!selectedVersionId || readOnly}
                >
                  <DynamicIcon name="trash-2" size={16} />
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">Ще немає опублікованих версій</p>
          )}

          {viewingVersion ? (
            <p className="rounded-[8px] bg-default-100 px-3 py-2 text-xs text-default-600">
              Режим перегляду версії. Натисніть «Редагувати як чернетку», щоб змінити.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="flat"
              color="warning"
              className="bg-rose-400 text-white"
              onPress={handleSaveDraft}
              isLoading={saving}
              isDisabled={!selectedBatch || readOnly || loading || viewingVersion}
            >
              Зберегти чернетку
            </Button>
            <Button
              size="sm"
              color="primary"
              onPress={handleGenerate}
              isLoading={generating}
              isDisabled={!selectedBatch || readOnly || loading}
            >
              Згенерувати PDF
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="bordered"
              onPress={() => void handleDownload()}
              isDisabled={!published.length}
              startContent={<DynamicIcon name="download" size={14} />}
            >
              Завантажити
            </Button>
            <Dropdown placement="bottom-start">
              <DropdownTrigger>
                <Button
                  variant="bordered"
                  isLoading={printing}
                  isDisabled={!published.length}
                  startContent={<DynamicIcon name="printer" size={14} />}
                  endContent={<DynamicIcon name="chevron-down" size={14} />}
                >
                  Друк
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Спосіб друку"
                onAction={(key) => {
                  if (key === 'browser') void handlePrintBrowser();
                  if (key === 'qz') void handlePrintQz();
                }}
              >
                <DropdownItem key="browser" startContent={<DynamicIcon name="monitor" size={14} />}>
                  Через браузер
                </DropdownItem>
                <DropdownItem key="qz" startContent={<DynamicIcon name="printer" size={14} />}>
                  Через QZ Tray
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <Input
              type="number"
              size="sm"
              label="К-сть (QZ)"
              labelPlacement="outside"
              className="w-24"
              min={1}
              max={999}
              value={String(printQuantity)}
              onValueChange={(value) => {
                const parsed = parseInt(value, 10);
                setPrintQuantity(Number.isFinite(parsed) && parsed > 0 ? Math.min(999, parsed) : 1);
              }}
              isDisabled={!published.length}
            />
            {published.length > 0 ? (
              <Button variant="flat" onPress={handleCloneVersion} isDisabled={readOnly}>
                Редагувати як чернетку
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-text-secondary">
            Чернетки спільні для всіх користувачів. Кожна генерація PDF створює нову незмінну версію.
          </p>
        </div>

        <div className="relative flex w-full min-w-0 justify-center lg:justify-start">
          {loading ? (
            <div className="flex min-h-[480px] w-full items-center justify-center">
              <Spinner label="Завантаження наліпки…" />
            </div>
          ) : selectedBatch ? (
            <div className="flex w-full flex-col items-center gap-2">
              <ProductLabelPreview
                payload={payload}
                onChange={patchPayload}
                disabled={readOnly || viewingVersion}
                nutritionErrors={viewingVersion ? [] : nutritionErrors}
              />
              {selectedVersion ? (
                <p className="text-center text-xs text-secondary">
                  Згенеровано{' '}
                  {new Date(selectedVersion.publishedAt).toLocaleString('uk-UA')}
                  {selectedVersion.publishedByName
                    ? ` · ${selectedVersion.publishedByName}`
                    : selectedVersion.publishedBy
                      ? ` · користувач #${selectedVersion.publishedBy}`
                      : ''}
                  {' · '}партія {selectedVersion.batchNumber}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-border-subtle bg-surface-page p-6 text-center">
              <DynamicIcon name="square-text" size={48} strokeWidth={1.5} className="mb-2 text-secondary" />
              <p className="text-sm max-w-2xs">Оберіть партію для попереднього перегляду наліпки</p>
            </div>
          )}
        </div>
      </div>

      <BatchNumbersAutocomplete
        batches={batches}
        isOpen={batchPickerOpen}
        isLoading={batchesLoading}
        selectedBatch={selectedBatch?.batchId || ''}
        selectedStorage={selectedBatch?.storage || ''}
        includeAllStorages
        onSelect={handleBatchSelect}
        onClose={() => setBatchPickerOpen(false)}
        onRefresh={() =>
          void fetchBatches(sku, undefined, undefined, true, undefined, {
            includeSmallStorage: true,
          })
        }
      />
    </section>
  );
}
