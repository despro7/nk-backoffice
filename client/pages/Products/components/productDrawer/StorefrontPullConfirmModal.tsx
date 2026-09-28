import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@heroui/use-draggable';
import {
  Accordion,
  AccordionItem,
  Button,
  Checkbox,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import MetaLogJsonView from '@/components/MetaLogJsonView';
import { storefrontApi } from '@/services/StorefrontService';
import type { WooPullApplyInput, WooPullPreviewResult } from '@shared/types/storefront';
import { isEffectivelyEmptyHtml } from '@shared/utils/storefrontDescriptionParser';

export interface StorefrontPullApplyFlags {
  fullDescription: boolean;
  shortDescription: boolean;
  storefrontDescriptionDoc: boolean;
  productIngredientsJson: boolean;
  productNutritionJson: boolean;
  weight: boolean;
  regularPrice: boolean;
  doNotPublish: boolean;
  images: boolean;
  replaceImages: boolean;
  wooProductId: boolean;
}

interface StorefrontPullConfirmModalProps {
  isOpen: boolean;
  goodId: string | null;
  sku: string | null;
  localFullDescription: string;
  localShortDescription: string;
  onApplied: () => void;
  onClose: () => void;
}

type PullFieldKey = keyof StorefrontPullApplyFlags;

type ComparisonRow = {
  key?: PullFieldKey;
  label: string;
  local: string;
  remote: string;
  conflict?: boolean;
  willApply?: boolean;
};

const PULL_FIELD_OPTIONS: Array<{
  key: PullFieldKey;
  label: string;
  hint: string;
  conflictField?: string;
}> = [
  {
    key: 'fullDescription',
    label: 'Legacy опис',
    hint: 'Повний HTML з WooCommerce',
    conflictField: 'fullDescription',
  },
  {
    key: 'shortDescription',
    label: 'Короткий опис',
    hint: 'short_description з WC',
    conflictField: 'description',
  },
  {
    key: 'storefrontDescriptionDoc',
    label: 'Storefront doc',
    hint: 'Блоки опису після парсингу',
    conflictField: 'storefrontDescriptionDoc',
  },
  {
    key: 'productIngredientsJson',
    label: 'Склад (tags)',
    hint: 'Теги інгредієнтів',
    conflictField: 'productIngredientsJson',
  },
  {
    key: 'productNutritionJson',
    label: 'КБЖВ',
    hint: 'Нутрієнти з meta / HTML',
    conflictField: 'productNutritionJson',
  },
  {
    key: 'weight',
    label: 'Вага',
    hint: 'Вага товару, кг',
    conflictField: 'weight',
  },
  {
    key: 'regularPrice',
    label: 'Ціна',
    hint: 'Роздріб і Звичайна',
    conflictField: 'regularPrice',
  },
  {
    key: 'doNotPublish',
    label: 'Не публікувати',
    hint: 'draft/publish статус WC',
    conflictField: 'doNotPublish',
  },
  {
    key: 'images',
    label: 'Зображення',
    hint: 'Імпорт з WooCommerce',
    conflictField: 'images',
  },
  {
    key: 'wooProductId',
    label: 'wooProductId',
    hint: 'Звʼязок з товаром WC',
  },
];

function isEmpty(value: string | null | undefined): boolean {
  return isEffectivelyEmptyHtml(value);
}

function hasConflict(preview: WooPullPreviewResult, field: string): boolean {
  return preview.conflicts.some((c) => c.field === field);
}

function conflictValue(
  preview: WooPullPreviewResult,
  field: string,
  side: 'local' | 'remote',
): string | null {
  const row = preview.conflicts.find((c) => c.field === field);
  if (!row) return null;
  return side === 'local' ? row.localValue : row.remoteValue;
}

function countLocalIngredients(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function defaultFlags(
  preview: WooPullPreviewResult,
  localFullDescription: string,
  localShortDescription: string,
): StorefrontPullApplyFlags {
  const hasLocalImages = preview.local.imageCount > 0;
  const hasRemoteImages = preview.proposed.imageCount > 0;

  return {
    fullDescription: !hasConflict(preview, 'fullDescription') && isEmpty(localFullDescription),
    shortDescription: Boolean(preview.proposed.shortDescription),
    storefrontDescriptionDoc: !hasConflict(preview, 'storefrontDescriptionDoc'),
    productIngredientsJson: !hasConflict(preview, 'productIngredientsJson'),
    productNutritionJson: !hasConflict(preview, 'productNutritionJson'),
    weight: !hasConflict(preview, 'weight'),
    regularPrice: Boolean(preview.proposed.regularPrice),
    doNotPublish: !hasConflict(preview, 'doNotPublish'),
    images: !hasConflict(preview, 'images') && hasRemoteImages && !hasLocalImages,
    replaceImages: false,
    wooProductId: true,
  };
}

function truncateValue(value: string | null | undefined, max = 72): string {
  if (!value) return '—';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function formatPreviewValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function countChars(value: string): string {
  if (!value.trim()) return 'порожньо';
  return `${value.length} симв.`;
}

function buildAllImportRows(
  preview: WooPullPreviewResult,
  localFullDescription: string,
  localShortDescription: string,
  flags: StorefrontPullApplyFlags,
): ComparisonRow[] {
  const ingredients = preview.proposed.parsed.productIngredientsJson;
  const blocks = preview.proposed.parsed.storefrontDescriptionDoc?.content?.length ?? 0;

  return [
    {
      key: 'fullDescription',
      label: 'Legacy опис',
      local: countChars(localFullDescription),
      remote: countChars(preview.proposed.fullDescription || ''),
      conflict: hasConflict(preview, 'fullDescription'),
      willApply: flags.fullDescription,
    },
    {
      key: 'shortDescription',
      label: 'Короткий опис',
      local: truncateValue(localShortDescription, 80),
      remote: truncateValue(preview.proposed.shortDescription, 80),
      conflict: hasConflict(preview, 'description'),
      willApply: flags.shortDescription,
    },
    {
      key: 'storefrontDescriptionDoc',
      label: 'Storefront doc',
      local: truncateValue(preview.local.storefrontDescriptionDoc, 80),
      remote: hasConflict(preview, 'storefrontDescriptionDoc')
        ? truncateValue(conflictValue(preview, 'storefrontDescriptionDoc', 'remote'), 80)
        : `${blocks} блоків`,
      conflict: hasConflict(preview, 'storefrontDescriptionDoc'),
      willApply: flags.storefrontDescriptionDoc,
    },
    {
      key: 'productIngredientsJson',
      label: 'Склад (tags)',
      local: truncateValue(preview.local.productIngredientsJson, 80),
      remote: hasConflict(preview, 'productIngredientsJson')
        ? truncateValue(conflictValue(preview, 'productIngredientsJson', 'remote'), 80)
        : ingredients.length > 0
          ? `${ingredients.length} тегів`
          : '—',
      conflict: hasConflict(preview, 'productIngredientsJson'),
      willApply: flags.productIngredientsJson,
    },
    {
      key: 'productNutritionJson',
      label: 'КБЖВ',
      local: truncateValue(preview.local.productNutritionJson, 80),
      remote: hasConflict(preview, 'productNutritionJson')
        ? truncateValue(conflictValue(preview, 'productNutritionJson', 'remote'), 80)
        : preview.proposed.parsed.productNutritionJson
          ? 'є дані'
          : '—',
      conflict: hasConflict(preview, 'productNutritionJson'),
      willApply: flags.productNutritionJson,
    },
    {
      key: 'weight',
      label: 'Вага, кг',
      local: formatPreviewValue(preview.local.weight),
      remote: formatPreviewValue(preview.proposed.weight),
      conflict: hasConflict(preview, 'weight'),
      willApply: flags.weight,
    },
    {
      key: 'regularPrice',
      label: 'Ціна',
      local: formatPreviewValue(preview.local.regularPrice),
      remote: formatPreviewValue(preview.proposed.regularPrice),
      conflict: hasConflict(preview, 'regularPrice'),
      willApply: flags.regularPrice,
    },
    {
      key: 'doNotPublish',
      label: 'Не публікувати',
      local: preview.local.doNotPublish ? 'так' : 'ні',
      remote: preview.proposed.doNotPublish ? 'так (draft)' : 'ні (publish)',
      conflict: hasConflict(preview, 'doNotPublish'),
      willApply: flags.doNotPublish,
    },
    {
      key: 'images',
      label: 'Зображення',
      local: preview.local.imageCount > 0 ? `${preview.local.imageCount} шт.` : '—',
      remote: preview.proposed.imageCount > 0 ? `${preview.proposed.imageCount} шт.` : '—',
      conflict: hasConflict(preview, 'images'),
      willApply: flags.images,
    },
    {
      key: 'wooProductId',
      label: 'wooProductId',
      local: '—',
      remote: String(preview.wooProductId),
      willApply: flags.wooProductId,
    },
  ];
}

const COMPARISON_TABLE_GRID = {
  summary: 'grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-x-3 gap-y-2',
  full: 'grid grid-cols-1 sm:grid-cols-[8.5rem_1fr_1fr_8.5rem] gap-x-3 gap-y-2',
} as const;

function ComparisonTable({
  rows,
  showApplyStatus = false,
  embedded = false,
}: {
  rows: ComparisonRow[];
  showApplyStatus?: boolean;
  embedded?: boolean;
}) {
  const gridClass = showApplyStatus ? COMPARISON_TABLE_GRID.full : COMPARISON_TABLE_GRID.summary;

  return (
    <section
      className={embedded ? undefined : 'rounded-md border border-default-200 overflow-hidden'}
    >
      <div className="bg-default-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-default-500">
        <div className={gridClass}>
          <span>Поле</span>
          {showApplyStatus ? (
            <>
              <span>Локально</span>
              <span>WooCommerce</span>
              <span className="hidden sm:block text-center">Застосувати</span>
            </>
          ) : (
            <span className="grid grid-cols-2 gap-3">
              <span>Локально</span>
              <span>WooCommerce</span>
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-default-100">
        {rows.map((row) => (
          <div key={row.label} className={`${gridClass} px-4 py-3 text-sm`}>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <p className="font-medium text-default-700 break-words">{row.label}</p>
              {row.conflict && (
                <Chip size="sm" color="warning" variant="flat">
                  конфлікт
                </Chip>
              )}
            </div>
            {showApplyStatus ? (
              <>
                <span className="min-w-0 rounded-md bg-default-50 px-2 py-1.5 text-xs text-default-600 break-words">
                  {row.local}
                </span>
                <span className="min-w-0 rounded-md bg-primary-50 px-2 py-1.5 text-xs text-primary-800 break-words">
                  {row.remote}
                </span>
                <div className="flex items-center justify-center">
                  {row.willApply != null ? (
                    <Chip size="sm" color={row.willApply ? 'success' : 'default'} variant="flat">
                      {row.willApply ? 'так' : 'ні'}
                    </Chip>
                  ) : (
                    <span className="text-xs text-default-400">—</span>
                  )}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-xs text-default-600">
                <span className="min-w-0 rounded-md bg-default-50 px-2 py-1.5 break-words">{row.local}</span>
                <span className="min-w-0 rounded-md bg-primary-50 px-2 py-1.5 text-primary-800 break-words">
                  {row.remote}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function StorefrontPullConfirmModal({
  isOpen,
  goodId,
  sku,
  localFullDescription,
  localShortDescription,
  onApplied,
  onClose,
}: StorefrontPullConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WooPullPreviewResult | null>(null);
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  const modalTargetRef = useRef<HTMLElement>(null);
  const allFieldsModalTargetRef = useRef<HTMLElement>(null);
  const { moveProps } = useDraggable({
    targetRef: modalTargetRef,
    isDisabled: !isOpen,
  });
  const { moveProps: allFieldsMoveProps } = useDraggable({
    targetRef: allFieldsModalTargetRef,
    isDisabled: !allFieldsOpen,
  });
  const [flags, setFlags] = useState<StorefrontPullApplyFlags>({
    fullDescription: false,
    shortDescription: false,
    storefrontDescriptionDoc: false,
    productIngredientsJson: false,
    productNutritionJson: false,
    weight: false,
    regularPrice: false,
    doNotPublish: false,
    images: false,
    replaceImages: false,
    wooProductId: true,
  });
  const [ingredientsConfirmOpen, setIngredientsConfirmOpen] = useState(false);
  const [imagesConfirmOpen, setImagesConfirmOpen] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    if (modalTargetRef.current) {
      modalTargetRef.current.style.transform = '';
    }
  }, [isOpen]);

  useEffect(() => {
    if (allFieldsOpen) return;
    if (allFieldsModalTargetRef.current) {
      allFieldsModalTargetRef.current.style.transform = '';
    }
  }, [allFieldsOpen]);

  useEffect(() => {
    if (!isOpen || !goodId) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setAllFieldsOpen(false);
    void storefrontApi
      .pullPreview(goodId)
      .then((data) => {
        setPreview(data);
        setFlags(defaultFlags(data, localFullDescription, localShortDescription));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [isOpen, goodId, localFullDescription, localShortDescription]);

  const hasChecked = useMemo(
    () => PULL_FIELD_OPTIONS.some((field) => flags[field.key]),
    [flags],
  );

  const selectedCount = useMemo(
    () => PULL_FIELD_OPTIONS.filter((field) => flags[field.key]).length,
    [flags],
  );

  const allImportRows = useMemo(
    () => (preview ? buildAllImportRows(preview, localFullDescription, localShortDescription, flags) : []),
    [preview, localFullDescription, localShortDescription, flags],
  );

  const summaryRows = useMemo(
    () => allImportRows.filter((row) =>
      ['Legacy опис', 'Короткий опис', 'Ціна', 'Вага, кг'].includes(row.label),
    ),
    [allImportRows],
  );

  const buildApplyPayload = (): WooPullApplyInput['apply'] => ({
    fullDescription: flags.fullDescription,
    shortDescription: flags.shortDescription,
    storefrontDescriptionDoc: flags.storefrontDescriptionDoc,
    productIngredientsJson: flags.productIngredientsJson,
    productNutritionJson: flags.productNutritionJson,
    weight: flags.weight,
    regularPrice: flags.regularPrice,
    doNotPublish: flags.doNotPublish,
    images: flags.images,
    replaceImages: flags.replaceImages,
    wooProductId: flags.wooProductId,
  });

  const runApply = async () => {
    if (!goodId) return;
    setApplying(true);
    setError(null);
    try {
      await storefrontApi.pullApply({ goodId, apply: buildApplyPayload() });
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
      setIngredientsConfirmOpen(false);
      setImagesConfirmOpen(false);
    }
  };

  const proceedAfterIngredientConfirm = () => {
    if (!preview) return;
    setIngredientsConfirmOpen(false);

    if (flags.images && flags.replaceImages && preview.local.imageCount > 0) {
      setImagesConfirmOpen(true);
      return;
    }

    if (flags.images && preview.local.imageCount > 0 && !flags.replaceImages) {
      setError('Увімкніть «Замінити існуючі зображення» або зніміть вибір поля «Зображення»');
      return;
    }

    void runApply();
  };

  const handleApply = () => {
    if (!goodId || !hasChecked || !preview) return;

    const localIngredientCount = countLocalIngredients(preview.local.productIngredientsJson);
    if (flags.productIngredientsJson && localIngredientCount > 0) {
      setIngredientsConfirmOpen(true);
      return;
    }

    proceedAfterIngredientConfirm();
  };

  const toggle = (key: PullFieldKey) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'images' && !next.images) {
        next.replaceImages = false;
      }
      return next;
    });
  };

  const selectSafeFields = () => {
    if (!preview) return;
    setFlags(defaultFlags(preview, localFullDescription, localShortDescription));
  };

  const parsedPreview = preview
    ? {
        ingredients: preview.proposed.parsed.productIngredientsJson,
        nutrition: preview.proposed.parsed.productNutritionJson,
        warnings: preview.proposed.parsed.parseWarnings,
        unparsed: preview.proposed.parsed.unparsedHtmlChunks,
        blocks: preview.proposed.parsed.storefrontDescriptionDoc?.content?.length ?? 0,
      }
    : null;

  return (
    <>
      <Modal
        ref={modalTargetRef}
        isOpen={isOpen}
        onClose={onClose}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader
            {...moveProps}
            className="flex flex-col items-start gap-1 pb-2 cursor-move touch-none select-none"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span>Завантажити з сайту</span>
              {sku && (
                <Chip size="sm" variant="flat" color="primary" className="font-mono">
                  {sku}
                </Chip>
              )}
            </div>
            {preview && (
              <p className="text-xs font-normal text-default-500">
                WooCommerce #{preview.wooProductId} · оберіть поля для імпорту в backoffice
              </p>
            )}
          </ModalHeader>

          <ModalBody className="gap-5">
            {loading && (
              <div className="flex items-center justify-center py-10 text-default-500">
                <Spinner size="sm" />
                <span className="ml-2 text-sm">Завантаження preview…</span>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {preview && (
              <>
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Порівняння даних</p>
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={<DynamicIcon name="list" size={14} />}
                      onPress={() => setAllFieldsOpen(true)}
                    >
                      Переглянути всі поля
                    </Button>
                  </div>
                  <ComparisonTable rows={summaryRows} />
                </section>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Поля для застосування</p>
                      <p className="text-xs text-default-500">
                        Обрано {selectedCount} з {PULL_FIELD_OPTIONS.length}
                      </p>
                    </div>
                    <Button size="sm" variant="flat" onPress={selectSafeFields}>
                      Безпечний вибір
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PULL_FIELD_OPTIONS.map((field) => {
                      const conflict = field.conflictField
                        ? hasConflict(preview, field.conflictField)
                        : false;
                      const selected = flags[field.key];

                      return (
                        <label
                          key={field.key}
                          className={[
                            'flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors',
                            selected
                              ? 'border-primary bg-primary-50/60'
                              : 'border-default-200 hover:border-default-300 hover:bg-default-50',
                          ].join(' ')}
                        >
                          <Checkbox
                            size="sm"
                            className="mt-0.5"
                            isSelected={selected}
                            onValueChange={() => toggle(field.key)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-default-800">{field.label}</span>
                              {conflict && (
                                <Chip size="sm" color="warning" variant="flat">
                                  конфлікт
                                </Chip>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-default-500">{field.hint}</span>
                            {field.key === 'productIngredientsJson' &&
                              countLocalIngredients(preview.local.productIngredientsJson) > 0 && (
                                <span className="mt-1 block text-xs text-warning-700">
                                  Замінить усі локальні теги складу
                                </span>
                              )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {flags.images && preview.local.imageCount > 0 && (
                    <label className="flex items-start gap-3 rounded-md border border-warning-200 bg-warning-50/50 px-3 py-2 cursor-pointer">
                      <Checkbox
                        size="sm"
                        className="mt-0.5"
                        isSelected={flags.replaceImages}
                        onValueChange={() =>
                          setFlags((prev) => ({ ...prev, replaceImages: !prev.replaceImages }))
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-default-800">
                          Замінити існуючі зображення
                        </span>
                        <span className="mt-0.5 block text-xs text-default-500">
                          Локально {preview.local.imageCount} шт. буде видалено перед імпортом з WC
                        </span>
                      </span>
                    </label>
                  )}
                </section>

                {parsedPreview && (
                  <Accordion variant="splitted" className="px-0">
                    <AccordionItem
                      key="parsed"
                      aria-label="Parsed blocks preview"
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>Parsed blocks preview</span>
                          <Chip size="sm" variant="flat">
                            {parsedPreview.blocks} блоків
                          </Chip>
                          {parsedPreview.warnings.length > 0 ? (
                            <Chip size="sm" color="warning" variant="flat">
                              {parsedPreview.warnings.length} warnings
                            </Chip>
                          ) : (
                            <Chip size="sm" color="success" variant="flat">
                              без warnings
                            </Chip>
                          )}
                        </div>
                      }
                    >
                      <div className="space-y-3">
                        {parsedPreview.warnings.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {parsedPreview.warnings.map((warning) => (
                              <Chip key={warning} size="sm" color="warning" variant="flat">
                                {warning}
                              </Chip>
                            ))}
                          </div>
                        )}

                        {parsedPreview.ingredients.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-default-600">Інгредієнти</p>
                            <div className="flex flex-wrap gap-1.5">
                              {parsedPreview.ingredients.map((item) => (
                                <Chip key={item} size="sm" variant="flat">
                                  {item}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        )}

                        <MetaLogJsonView
                          value={{
                            ingredients: parsedPreview.ingredients,
                            nutrition: parsedPreview.nutrition,
                            unparsedHtmlChunks: parsedPreview.unparsed,
                          }}
                          className="max-h-52"
                          collapsed={2}
                        />
                      </div>
                    </AccordionItem>
                  </Accordion>
                )}
              </>
            )}
          </ModalBody>

          <ModalFooter className="gap-2">
            <Button variant="light" onPress={onClose} isDisabled={applying}>
              Скасувати
            </Button>
            <Button
              color="primary"
              onPress={() => void handleApply()}
              isDisabled={!preview || !hasChecked || applying}
              isLoading={applying}
              startContent={!applying ? <DynamicIcon name="download" size={15} /> : undefined}
            >
              Застосувати ({selectedCount})
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        ref={allFieldsModalTargetRef}
        isOpen={allFieldsOpen}
        onClose={() => setAllFieldsOpen(false)}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader
            {...allFieldsMoveProps}
            className="flex flex-col items-start gap-1 cursor-move touch-none select-none"
          >
            <span>Всі поля імпорту</span>
            {sku && (
              <p className="text-xs font-normal text-default-500">
                SKU {sku} · порівняння локальних даних з WooCommerce та статус застосування
              </p>
            )}
          </ModalHeader>
          <ModalBody className="gap-4">
            <ComparisonTable rows={allImportRows} showApplyStatus />
            {preview && (
              <MetaLogJsonView
                value={preview.proposed}
                className="max-h-64"
                collapsed={2}
              />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setAllFieldsOpen(false)}>
              Закрити
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={ingredientsConfirmOpen}
        title="Замінити теги складу?"
        message="Усі локальні теги складу будуть повністю замінені даними з WooCommerce. Продовжити?"
        confirmText="Замінити"
        confirmColor="warning"
        confirmLoading={applying}
        onConfirm={proceedAfterIngredientConfirm}
        onCancel={() => setIngredientsConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={imagesConfirmOpen}
        title="Замінити зображення?"
        message={`Усі ${preview?.local.imageCount ?? 0} локальних зображень будуть видалені та замінені з WooCommerce. Продовжити?`}
        confirmText="Замінити"
        confirmColor="warning"
        confirmLoading={applying}
        onConfirm={() => void runApply()}
        onCancel={() => setImagesConfirmOpen(false)}
      />
    </>
  );
}
