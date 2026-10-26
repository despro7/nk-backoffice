import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Tab,
  Tabs,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { saveAs } from 'file-saver';
import type { Template } from '@pdfme/common';
import type { CatalogGoodDetailDto } from '../../ProductsTypes';
import type { BatchNumber } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import { BatchNumbersAutocomplete } from '@/pages/Warehouse/WarehouseMovement/components/BatchNumbersAutocomplete';
import { useBatchNumbers } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import { ProductLabelService } from '@/services/ProductLabelService';
import { LabelTemplateService } from '@/services/LabelTemplateService';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import type { ProductLabelKind, ProductLabelPublishedDto } from '@shared/types/productLabel';
import {
  formatProductLabelHistoryCaption,
  formatProductLabelHistoryOption,
  PRODUCT_LABEL_DRAFT_SELECTION_KEY,
  productLabelHistorySelectionKey,
  type ProductLabelHistoryEntry,
} from '@shared/utils/productLabelHistory';
import type { ProductLabelPayloadV2 } from '@shared/types/labelTemplate';
import { CATALOG_ACC_POLICY_KIT } from '@shared/types/catalog';
import {
  LABEL_EDITABLE_KEYS,
  LABEL_INPUT_LABELS,
  LABEL_INPUTS_SCHEMA_VERSION,
  type LabelInputKey,
  type LabelInputMap,
} from '@shared/constants/labelInputKeys';
import {
  diffLabelOverrides,
  emptyLabelInputs,
  getLabelNutritionErrors,
  mergeLabelOverrides,
  withAutoEnergy,
} from '@shared/utils/labelInputs';
import {
  hydrateLabelTemplateContent,
  toLabelPdfmeTemplate,
} from '@shared/pdfme/builtInLabelTemplates';
import { loadLabelDesignerAssets } from '@/pages/Settings/labelTemplates/labelPdfmeFonts';
import { LabelPdfmeViewer } from './label/LabelPdfmeViewer';

interface ProductLabelsTabProps {
  detail: CatalogGoodDetailDto;
  readOnly?: boolean;
  isAdmin?: boolean;
  overlayZClassName?: string;
}

function payloadKey(payload: ProductLabelPayloadV2): string {
  return JSON.stringify(payload.inputs);
}

export function ProductLabelsTab({
  detail,
  readOnly,
  isAdmin = false,
  overlayZClassName,
}: ProductLabelsTabProps) {
  const audience = detail.accPolicyId === CATALOG_ACC_POLICY_KIT ? 'kit' : 'good';
  const [labelKind, setLabelKind] = useState<ProductLabelKind>('portion');
  const [baseInputs, setBaseInputs] = useState<LabelInputMap>(() => emptyLabelInputs());
  const [overrides, setOverrides] = useState<Partial<LabelInputMap>>({});
  const [energyManual, setEnergyManual] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [presetOptions, setPresetOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [historyEntries, setHistoryEntries] = useState<ProductLabelHistoryEntry[]>([]);
  const [selectedEntryKey, setSelectedEntryKey] = useState('');
  const [savedDraftPayloadKey, setSavedDraftPayloadKey] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchNumber | null>(null);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewingVersion, setViewingVersion] = useState(false);
  const [userPickedBatch, setUserPickedBatch] = useState(false);
  const preferPublishedIdRef = useRef<number | undefined>(undefined);

  const { batches, loading: batchesLoading, error: batchesError, fetchBatches } = useBatchNumbers();
  const sku = detail.sku || '';

  const inputs = useMemo(
    () => withAutoEnergy(mergeLabelOverrides(baseInputs, overrides), energyManual),
    [baseInputs, overrides, energyManual],
  );

  const draftPayload = useMemo<ProductLabelPayloadV2>(
    () => ({
      version: LABEL_INPUTS_SCHEMA_VERSION,
      templateId,
      inputs,
      overrides,
      nutritionEnergyManual: energyManual,
    }),
    [templateId, inputs, overrides, energyManual],
  );

  useEffect(() => {
    if (!sku) return;
    void fetchBatches(sku, undefined, undefined, false, undefined, { includeSmallStorage: true });
  }, [sku, fetchBatches]);

  useEffect(() => {
    setUserPickedBatch(false);
    setSelectedBatch(null);
    setSelectedEntryKey('');
    setHistoryEntries([]);
    setSavedDraftPayloadKey(null);
    setViewingVersion(false);
    preferPublishedIdRef.current = undefined;
  }, [labelKind]);

  useEffect(() => {
    let cancelled = false;
    void LabelTemplateService.list({ audience, labelKind }).then((rows) => {
      if (!cancelled) setPresetOptions(rows.map((row) => ({ id: row.id, name: row.name })));
    }).catch(() => {
      if (!cancelled) setPresetOptions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [audience, labelKind]);

  const applyDraft = useCallback((draft: Awaited<ReturnType<typeof ProductLabelService.getDraft>>) => {
    if (!draft) return;
    setBaseInputs({ ...emptyLabelInputs(), ...draft.baseInputs });
    setOverrides(draft.payload.overrides ?? {});
    setEnergyManual(Boolean(draft.payload.nutritionEnergyManual));
    setTemplateId(draft.payload.templateId);
    setSavedDraftPayloadKey(payloadKey(draft.payload));
  }, []);

  const applyPublishedVersion = useCallback((row: ProductLabelPublishedDto) => {
    setBaseInputs({ ...emptyLabelInputs(), ...row.payload.inputs });
    setOverrides({});
    setTemplateId(row.payload.templateId);
    setViewingVersion(true);
    setSavedDraftPayloadKey(null);
  }, []);

  const selectHistoryEntry = useCallback(
    (entry: ProductLabelHistoryEntry) => {
      const key = productLabelHistorySelectionKey(entry);
      setSelectedEntryKey(key);
      if (entry.entryType === 'draft') {
        applyDraft(entry);
        setViewingVersion(false);
        return;
      }
      applyPublishedVersion(entry);
    },
    [applyDraft, applyPublishedVersion],
  );

  const loadTemplate = useCallback(
    async (id: string | null, kind: ProductLabelKind) => {
      const assets = await loadLabelDesignerAssets();
      const applyResolved = (resolved: Awaited<ReturnType<typeof ProductLabelService.resolveTemplate>>) => {
        if (!resolved.template) {
          setTemplate(null);
          return;
        }
        setTemplate(
          hydrateLabelTemplateContent(toLabelPdfmeTemplate(resolved.template), assets) as Template,
        );
      };

      if (id) {
        try {
          const detailTemplate = await LabelTemplateService.get(id);
          setTemplate(
            hydrateLabelTemplateContent(toLabelPdfmeTemplate(detailTemplate.template), assets) as Template,
          );
          return;
        } catch {
          // fallback — пресет видалили, беремо дефолт з матриці
        }
      }

      const resolved = await ProductLabelService.resolveTemplate(detail.id, kind);
      applyResolved(resolved);
    },
    [detail.id],
  );

  useEffect(() => {
    void loadTemplate(templateId, labelKind).catch(() => setTemplate(null));
  }, [templateId, labelKind, loadTemplate]);

  const loadLabelState = useCallback(
    async (batch: BatchNumber, kind: ProductLabelKind, options?: { preferPublishedId?: number }) => {
      if (!detail.id || !batch.batchId) return;
      setLoading(true);
      setViewingVersion(false);
      try {
        let history = await ProductLabelService.listHistory(detail.id, batch.batchId, kind);
        if (!history.some((row) => row.entryType === 'draft')) {
          await ProductLabelService.seedDraft(detail.id, {
            batchId: batch.batchId,
            labelKind: kind,
            batchNumber: batch.batchNumber,
            expiration: batch.expiration,
          });
          history = await ProductLabelService.listHistory(detail.id, batch.batchId, kind);
        }
        setHistoryEntries(history);
        const preferId = options?.preferPublishedId ?? preferPublishedIdRef.current;
        preferPublishedIdRef.current = undefined;
        const preferred = preferId
          ? history.find((row) => row.entryType === 'published' && row.id === preferId)
          : undefined;
        if (preferred) {
          selectHistoryEntry(preferred);
          return;
        }
        const draftEntry = history.find((row) => row.entryType === 'draft');
        if (draftEntry) {
          selectHistoryEntry(draftEntry);
          return;
        }
        const firstPublished = history.find((row) => row.entryType === 'published');
        if (firstPublished) selectHistoryEntry(firstPublished);
      } catch (err) {
        ToastService.show({
          title: 'Наліпки',
          description: err instanceof Error ? err.message : 'Помилка завантаження наліпки',
          color: 'danger',
        });
      } finally {
        setLoading(false);
      }
    },
    [detail.id, selectHistoryEntry],
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
            expiration: latest.payload.inputs.expires_at || null,
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

  const publishedEntries = useMemo(
    () => historyEntries.filter((row): row is ProductLabelHistoryEntry & { entryType: 'published' } => row.entryType === 'published'),
    [historyEntries],
  );

  const selectedHistoryEntry = useMemo(
    () =>
      historyEntries.find((row) => productLabelHistorySelectionKey(row) === selectedEntryKey) ?? null,
    [historyEntries, selectedEntryKey],
  );

  const selectedPublished = useMemo(
    () => (selectedHistoryEntry?.entryType === 'published' ? selectedHistoryEntry : null),
    [selectedHistoryEntry],
  );

  const isDirty = useMemo(() => {
    if (viewingVersion) return false;
    if (selectedPublished && selectedEntryKey !== PRODUCT_LABEL_DRAFT_SELECTION_KEY) {
      return payloadKey(draftPayload) !== payloadKey(selectedPublished.payload);
    }
    if (publishedEntries.length === 0) return true;
    if (savedDraftPayloadKey) {
      return payloadKey(draftPayload) !== savedDraftPayloadKey;
    }
    return true;
  }, [
    draftPayload,
    publishedEntries.length,
    savedDraftPayloadKey,
    selectedEntryKey,
    selectedPublished,
    viewingVersion,
  ]);

  const nutritionErrors = useMemo(() => getLabelNutritionErrors(inputs), [inputs]);

  const patchInput = (key: LabelInputKey, value: string) => {
    setViewingVersion(false);
    if (key === 'nutrition_energy') setEnergyManual(true);
    setOverrides((prev) => {
      const next = { ...prev, [key]: value };
      return diffLabelOverrides(baseInputs, mergeLabelOverrides(baseInputs, next));
    });
  };

  const handleSaveDraft = async () => {
    if (!selectedBatch || readOnly || viewingVersion) return;
    setSaving(true);
    try {
      const data = await ProductLabelService.saveDraft(detail.id, {
        batchId: selectedBatch.batchId,
        labelKind,
        batchNumber: selectedBatch.batchNumber,
        payload: draftPayload,
      });
      applyDraft(data);
      const history = await ProductLabelService.listHistory(
        detail.id,
        selectedBatch.batchId,
        labelKind,
      );
      setHistoryEntries(history);
      setSelectedEntryKey(PRODUCT_LABEL_DRAFT_SELECTION_KEY);
      ToastService.show({ title: 'Чернетку збережено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Помилка збереження',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDraft = async () => {
    if (!selectedBatch || readOnly) return;
    setResetting(true);
    try {
      await fetchBatches(sku, undefined, undefined, true, undefined, { includeSmallStorage: true });
      const draft = await ProductLabelService.seedDraft(detail.id, {
        batchId: selectedBatch.batchId,
        labelKind,
        batchNumber: selectedBatch.batchNumber,
        expiration: selectedBatch.expiration,
      });
      applyDraft(draft);
      const history = await ProductLabelService.listHistory(
        detail.id,
        selectedBatch.batchId,
        labelKind,
      );
      setHistoryEntries(history);
      setSelectedEntryKey(PRODUCT_LABEL_DRAFT_SELECTION_KEY);
      setViewingVersion(false);
      setResetConfirmOpen(false);
      ToastService.show({ title: 'Чернетку скинуто', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Помилка скидання чернетки',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setResetting(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedBatch || readOnly || nutritionErrors.length > 0) {
      if (nutritionErrors[0]) {
        ToastService.show({ title: nutritionErrors[0], color: 'warning' });
      }
      return;
    }
    setGenerating(true);
    try {
      const created = await ProductLabelService.generatePublished(detail.id, {
        payload: draftPayload,
        batchId: selectedBatch.batchId,
        batchNumber: selectedBatch.batchNumber,
        labelKind,
      });
      preferPublishedIdRef.current = created.id;
      await loadLabelState(selectedBatch, labelKind, { preferPublishedId: created.id });
      ToastService.show({ title: `PDF v${created.version} згенеровано`, color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Помилка генерації',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handlePresetChange = async (key: string) => {
    const nextId = key === 'default' ? null : key;
    try {
      await ProductLabelService.setTemplateOverride(detail.id, labelKind, nextId);
      const resolved = await ProductLabelService.resolveTemplate(detail.id, labelKind);
      setTemplateId(resolved.templateId);
      if (resolved.template) {
        const assets = await loadLabelDesignerAssets();
        setTemplate(
          hydrateLabelTemplateContent(toLabelPdfmeTemplate(resolved.template), assets) as Template,
        );
      }
      ToastService.show({ title: 'Пресет наліпки оновлено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося змінити пресет',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    }
  };

  const resolveVersionId = () => {
    if (selectedEntryKey === PRODUCT_LABEL_DRAFT_SELECTION_KEY) {
      return publishedEntries[0]?.id;
    }
    const parsed = parseInt(selectedEntryKey, 10);
    return Number.isFinite(parsed) ? parsed : publishedEntries[0]?.id;
  };

  const canUsePublishedPdf = selectedEntryKey !== PRODUCT_LABEL_DRAFT_SELECTION_KEY && Boolean(selectedPublished);

  const handleDownload = async () => {
    const labelId = resolveVersionId();
    if (!labelId) return;
    const res = await fetch(ProductLabelService.pdfUrl(detail.id, labelId), { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    saveAs(blob, `label-${labelKind}.pdf`);
  };

  const fetchSelectedPdfBlob = async (): Promise<Blob> => {
    const labelId = resolveVersionId();
    if (!labelId) throw new Error('Спочатку згенеруйте PDF');
    const res = await fetch(ProductLabelService.pdfUrl(detail.id, labelId), { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  const handlePrintBrowser = async () => {
    setPrinting(true);
    try {
      const blob = await fetchSelectedPdfBlob();
      const url = URL.createObjectURL(blob);
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      frame.src = url;
      document.body.appendChild(frame);
      frame.onload = () => {
        frame.contentWindow?.print();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      };
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
    if (!labelId || !isAdmin || !selectedBatch) return;
    if (!window.confirm('Видалити обрану версію PDF?')) return;
    setDeleting(true);
    try {
      await ProductLabelService.deletePublished(detail.id, labelId);
      await loadLabelState(selectedBatch, labelKind);
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
    if (!selectedPublished) return;
    setOverrides(
      diffLabelOverrides(baseInputs, { ...emptyLabelInputs(), ...selectedPublished.payload.inputs }),
    );
    setSelectedEntryKey(PRODUCT_LABEL_DRAFT_SELECTION_KEY);
    setViewingVersion(false);
    ToastService.show({ title: 'Версію скопійовано в чернетку', color: 'success' });
  };

  if (!sku) {
    return <p className="py-8 text-center text-sm text-default-500">Для наліпок потрібен артикул (SKU) товару.</p>;
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Card className="border border-default-200 shadow-none">
            <CardBody className="gap-4 p-4">
              <Tabs
                selectedKey={labelKind}
                onSelectionChange={(key) => setLabelKind(key as ProductLabelKind)}
                size="md"
                fullWidth
                color="primary"
                aria-label="Тип наліпки"
              >
                <Tab key="portion" title="Порція" />
                <Tab key="box" title="Коробка" />
              </Tabs>

              <Select
                label="Пресет"
                labelPlacement="outside"
                size="md"
                selectedKeys={[
                  templateId && presetOptions.some((p) => p.id === templateId) ? templateId : 'default',
                ]}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  if (key) void handlePresetChange(String(key));
                }}
                isDisabled={readOnly}
              >
                {[
                  <SelectItem key="default">За замовчуванням (Settings)</SelectItem>,
                  ...presetOptions.map((opt) => <SelectItem key={opt.id}>{opt.name}</SelectItem>),
                ]}
              </Select>

              <Input
                size="md"
                label="Номер партії"
                labelPlacement="outside"
                placeholder="Оберіть партію…"
                value={selectedBatch?.batchNumber || ''}
                isReadOnly
                onClick={() => setBatchPickerOpen(true)}
                classNames={{ input: 'cursor-pointer' }}
              />
              {batchesError ? <p className="text-xs text-danger">{batchesError}</p> : null}

              {historyEntries.length > 0 ? (
                <div className="flex items-end gap-2">
                  <Select
                    label="Версії"
                    labelPlacement="outside"
                    size="md"
                    className="min-w-0 flex-1"
                    selectedKeys={selectedEntryKey ? [selectedEntryKey] : []}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0];
                      if (!key) return;
                      const row = historyEntries.find(
                        (entry) => productLabelHistorySelectionKey(entry) === String(key),
                      );
                      if (row) selectHistoryEntry(row);
                    }}
                  >
                    {historyEntries.map((row) => (
                      <SelectItem
                        key={productLabelHistorySelectionKey(row)}
                        textValue={formatProductLabelHistoryOption(row)}
                      >
                        {formatProductLabelHistoryOption(row)}
                      </SelectItem>
                    ))}
                  </Select>
                  {isAdmin ? (
                    <Button
                      isIconOnly
                      size="md"
                      variant="flat"
                      color="danger"
                      aria-label="Видалити версію PDF"
                      onPress={() => void handleDeleteVersion()}
                      isLoading={deleting}
                      isDisabled={
                        !selectedPublished || readOnly || selectedEntryKey === PRODUCT_LABEL_DRAFT_SELECTION_KEY
                      }
                    >
                      <DynamicIcon name="trash-2" size={16} />
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-default-500">Завантаження версій…</p>
              )}

              {viewingVersion && selectedPublished ? (
                <Button
                  size="sm"
                  variant="flat"
                  className="w-full"
                  onPress={handleCloneVersion}
                  isDisabled={readOnly}
                >
                  Редагувати як чернетку
                </Button>
              ) : null}
            </CardBody>
          </Card>

          <Card className="border border-default-200 shadow-none">
            <CardBody className="gap-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-default-500">Чернетка</p>
              <div className="flex flex-col gap-2">
                <Button
                  size="md"
                  variant="flat"
                  className="justify-start"
                  onPress={() => void handleSaveDraft()}
                  isLoading={saving}
                  isDisabled={!selectedBatch || readOnly || viewingVersion}
                  startContent={<DynamicIcon name="save" size={16} />}
                >
                  Зберегти чернетку
                </Button>
                <Button
                  size="md"
                  variant="flat"
                  className="justify-start"
                  onPress={() => setResetConfirmOpen(true)}
                  isDisabled={!selectedBatch || readOnly || resetting}
                  startContent={<DynamicIcon name="refresh-cw" size={16} />}
                >
                  Синхронізувати з картки
                </Button>
                <Button
                  size="md"
                  color="primary"
                  className="justify-start"
                  onPress={() => void handleGenerate()}
                  isLoading={generating}
                  isDisabled={!selectedBatch || readOnly || !isDirty}
                  startContent={<DynamicIcon name="file-output" size={16} />}
                >
                  Згенерувати PDF
                </Button>
              </div>

              <Divider />

              <p className="text-xs font-semibold uppercase tracking-wide text-default-500">Опублікований PDF</p>
              <div className="flex flex-col gap-2">
                <Button
                  size="md"
                  variant="bordered"
                  className="justify-start"
                  onPress={() => void handleDownload()}
                  isDisabled={!canUsePublishedPdf}
                  startContent={<DynamicIcon name="download" size={16} />}
                >
                  Завантажити
                </Button>
                <Button
                  size="md"
                  variant="bordered"
                  className="justify-start"
                  isLoading={printing}
                  isDisabled={!canUsePublishedPdf}
                  onPress={() => void handlePrintBrowser()}
                  startContent={<DynamicIcon name="printer" size={16} />}
                >
                  Друк (браузер)
                </Button>
              </div>
            </CardBody>
          </Card>

          <Accordion variant="splitted" defaultExpandedKeys={['fields']}>
            <AccordionItem
              key="fields"
              aria-label="Текстові поля наліпки"
              title={
                <span className="text-sm font-semibold text-foreground">Текстові поля</span>
              }
              subtitle="Локальні правки чернетки"
            >
              <div className="max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pb-1 pr-1">
                {LABEL_EDITABLE_KEYS.map((key) => (
                  <Input
                    key={key}
                    size="sm"
                    label={LABEL_INPUT_LABELS[key]}
                    labelPlacement="outside"
                    value={inputs[key] || ''}
                    isReadOnly={readOnly || viewingVersion}
                    onValueChange={(value) => patchInput(key, value)}
                  />
                ))}
                {nutritionErrors[0] && !viewingVersion ? (
                  <p className="text-xs text-warning-600">{nutritionErrors[0]}</p>
                ) : null}
              </div>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="min-w-0">
          {loading ? (
            <div className="flex min-h-[480px] items-center justify-center">
              <Spinner label="Завантаження наліпки…" />
            </div>
          ) : selectedBatch ? (
            <div className="flex w-full flex-col items-center gap-2">
              <LabelPdfmeViewer template={template} inputs={inputs} />
              {selectedHistoryEntry ? (
                <p className="text-center text-xs text-secondary">
                  {formatProductLabelHistoryCaption(selectedHistoryEntry)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-default-500">Оберіть партію для попереднього перегляду</p>
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
        shouldBlockScroll={false}
        onSelect={(batch) => {
          setUserPickedBatch(true);
          setSelectedBatch(batch);
        }}
        onClose={() => setBatchPickerOpen(false)}
        onRefresh={() => void fetchBatches(sku, undefined, undefined, true, undefined, { includeSmallStorage: true })}
        overlayZClassName={overlayZClassName}
      />

      <ConfirmModal
        isOpen={resetConfirmOpen}
        title="Синхронізувати наліпку з картки?"
        message="Локальні правки чернетки буде скинуто. Опубліковані PDF не зміняться."
        confirmText="Синхронізувати"
        confirmColor="warning"
        confirmLoading={resetting}
        overlayZClassName={overlayZClassName}
        onConfirm={() => void handleResetDraft()}
        onCancel={() => {
          if (!resetting) setResetConfirmOpen(false);
        }}
      />
    </section>
  );
}
