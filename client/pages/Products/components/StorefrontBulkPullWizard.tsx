import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from '@heroui/react';
import { storefrontApi } from '@/services/StorefrontService';
import type {
  StorefrontBulkSyncReport,
  StorefrontPullApplyFlags,
  WooPullBulkFieldKey,
  WooPullBulkPreviewItem,
  WooPullBulkRowAction,
} from '@shared/types/storefront';
import {
  BULK_PULL_FIELD_KEYS,
  BULK_PULL_FIELD_OPTIONS,
  buildBulkApplyFromMatrix,
} from './productDrawer/storefrontPullFields';
import { StorefrontBlockingProgressModal } from './StorefrontBlockingProgressModal';
import {
  buildStorefrontBulkReport,
  StorefrontSyncReportModal,
} from './StorefrontSyncReportModal';
import { PullFieldConflictTooltip } from './PullFieldConflictTooltip';

const BULK_PULL_LOAD_CONCURRENCY = 4;

type WizardFilter = 'all' | 'conflicts' | 'not_on_wc' | 'ready';

type RowState = {
  preview: WooPullBulkPreviewItem;
  action: WooPullBulkRowAction;
  fieldFlags: Record<WooPullBulkFieldKey, boolean>;
};

interface StorefrontBulkPullWizardProps {
  goodIds: string[];
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onItemDone?: (completed: number, total: number) => void,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
      completed += 1;
      onItemDone?.(completed, items.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function initFieldFlags(preview: WooPullBulkPreviewItem): Record<WooPullBulkFieldKey, boolean> {
  const flags = {} as Record<WooPullBulkFieldKey, boolean>;
  for (const key of BULK_PULL_FIELD_KEYS) {
    flags[key] = Boolean(preview.defaultApply[key]);
  }
  return flags;
}

export function StorefrontBulkPullWizard({
  goodIds,
  isOpen,
  onClose,
  onComplete,
}: StorefrontBulkPullWizardProps) {
  const [phase, setPhase] = useState<'loading' | 'matrix' | 'applying'>('loading');
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });
  const [rows, setRows] = useState<RowState[]>([]);
  const [filter, setFilter] = useState<WizardFilter>('all');
  const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0 });
  const [report, setReport] = useState<StorefrontBulkSyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceImages, setReplaceImages] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!isOpen || goodIds.length === 0) return;
    setPhase('loading');
    setError(null);
    setLoadProgress({ current: 0, total: goodIds.length });
    try {
      const items = await mapWithConcurrency(
        goodIds,
        BULK_PULL_LOAD_CONCURRENCY,
        async (goodId) => {
          const result = await storefrontApi.pullBulkPreview([goodId]);
          return result.items[0];
        },
        (current, total) => setLoadProgress({ current, total }),
      );
      setRows(
        items.map((preview) => ({
          preview,
          action: preview.wcStatus === 'not_found' ? 'create_on_wc' : 'pull',
          fieldFlags: initFieldFlags(preview),
        })),
      );
      setPhase('matrix');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('matrix');
    }
  }, [goodIds, isOpen]);

  useEffect(() => {
    if (isOpen) {
      void loadPreview();
    } else {
      setRows([]);
      setPhase('loading');
      setReport(null);
      setError(null);
      setReplaceImages(false);
    }
  }, [isOpen, loadPreview]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      switch (filter) {
        case 'conflicts':
          return row.preview.conflicts.length > 0;
        case 'not_on_wc':
          return row.preview.wcStatus === 'not_found';
        case 'ready':
          return row.preview.wcStatus === 'found' && row.action === 'pull';
        default:
          return true;
      }
    });
  }, [rows, filter]);

  const globalFieldState = useMemo(() => {
    const state = {} as Record<WooPullBulkFieldKey, { checked: boolean; indeterminate: boolean }>;
    for (const field of BULK_PULL_FIELD_KEYS) {
      const pullRows = rows.filter((row) => row.action === 'pull' && row.preview.wcStatus === 'found');
      const checkedCount = pullRows.filter((row) => row.fieldFlags[field]).length;
      state[field] = {
        checked: pullRows.length > 0 && checkedCount === pullRows.length,
        indeterminate: checkedCount > 0 && checkedCount < pullRows.length,
      };
    }
    return state;
  }, [rows]);

  const toggleGlobalField = (field: WooPullBulkFieldKey, checked: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.action === 'pull' && row.preview.wcStatus === 'found'
          ? { ...row, fieldFlags: { ...row.fieldFlags, [field]: checked } }
          : row,
      ),
    );
  };

  const toggleRowField = (goodId: string, field: WooPullBulkFieldKey, checked: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.preview.goodId === goodId
          ? { ...row, fieldFlags: { ...row.fieldFlags, [field]: checked } }
          : row,
      ),
    );
  };

  const setRowAction = (goodId: string, action: WooPullBulkRowAction) => {
    setRows((prev) =>
      prev.map((row) => (row.preview.goodId === goodId ? { ...row, action } : row)),
    );
  };

  const handleApply = async () => {
    setPhase('applying');
    setApplyProgress({ current: 0, total: rows.length });
    const started = Date.now();

    try {
      const items = rows.map((row) => {
        if (row.action === 'skip') {
          return { goodId: row.preview.goodId, action: 'skip' as const };
        }
        if (row.action === 'create_on_wc') {
          return { goodId: row.preview.goodId, action: 'create_on_wc' as const };
        }
        const apply: StorefrontPullApplyFlags = {
          ...buildBulkApplyFromMatrix(row.fieldFlags),
          wooProductId: true,
        };
        if (apply.images && replaceImages) {
          apply.replaceImages = true;
        }
        return { goodId: row.preview.goodId, action: 'pull' as const, apply };
      });

      const applyResults = await mapWithConcurrency(
        items,
        1,
        async (item) => {
          const result = await storefrontApi.pullBulkApply([item]);
          return result.results[0];
        },
        (current, total) => setApplyProgress({ current, total }),
      );
      setReport(
        buildStorefrontBulkReport(
          'pull',
          Date.now() - started,
          applyResults.map((row) => ({
            goodId: row.goodId,
            sku: row.sku,
            name: row.name,
            ok: row.ok,
            action: row.action,
            appliedFields: row.appliedFields,
            created: row.created,
            error: row.error,
            warnings: row.warnings,
          })),
        ),
      );
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('matrix');
    }
  };

  const pullCount = rows.filter((row) => row.action === 'pull').length;
  const createCount = rows.filter((row) => row.action === 'create_on_wc').length;
  const skipCount = rows.filter((row) => row.action === 'skip').length;
  const hasImagesSelected = rows.some(
    (row) => row.action === 'pull' && row.fieldFlags.images,
  );
  const hasLocalImagesConflict = rows.some(
    (row) =>
      row.action === 'pull' &&
      row.fieldFlags.images &&
      row.preview.conflicts.some((conflict) => conflict.field === 'images'),
  );

  return (
    <>
      <StorefrontBlockingProgressModal
        isOpen={isOpen && phase === 'loading'}
        title="Завантаження даних з WooCommerce"
        subtitle="Перевірка товарів та конфліктів"
        current={loadProgress.current}
        total={loadProgress.total}
      />
      <StorefrontBlockingProgressModal
        isOpen={isOpen && phase === 'applying'}
        title="Застосування pull з сайту"
        subtitle="Оновлення товарів у Backoffice"
        current={applyProgress.current}
        total={applyProgress.total}
      />

      <Modal
        isOpen={isOpen && phase === 'matrix' && !report}
        onClose={onClose}
        size="5xl"
        scrollBehavior="inside"
        classNames={{ base: 'max-w-[95vw] rounded-xl' }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col items-start gap-1">
            <span>Завантажити з сайту ({goodIds.length})</span>
            <span className="text-sm font-normal text-default-500">
              Pull {pullCount} · Create {createCount} · Skip {skipCount}
            </span>
          </ModalHeader>
          <ModalBody>
            {error ? (
              <p className="mb-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>
            ) : null}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Select
                size="sm"
                className="w-44"
                aria-label="Фільтр"
                selectedKeys={[filter]}
                onChange={(e) => setFilter((e.target.value as WizardFilter) || 'all')}
              >
                <SelectItem key="all">Усі</SelectItem>
                <SelectItem key="conflicts">З конфліктами</SelectItem>
                <SelectItem key="not_on_wc">Немає на WC</SelectItem>
                <SelectItem key="ready">Готові до pull</SelectItem>
              </Select>
            </div>

            <div className="overflow-auto rounded-lg border border-default-200">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-content1">
                  <tr className="border-b border-default-200 text-default-500">
                    <th className="min-w-[180px] px-2 py-2 font-medium">Товар</th>
                    {BULK_PULL_FIELD_OPTIONS.map((field) => (
                      <th key={field.key} className="px-1 py-2 text-center font-medium">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            size="sm"
                            isSelected={globalFieldState[field.key].checked}
                            isIndeterminate={globalFieldState[field.key].indeterminate}
                            onValueChange={(checked) => toggleGlobalField(field.key, checked)}
                            aria-label={`Усі: ${field.label}`}
                          />
                          <span className="max-w-[72px] leading-tight">{field.label}</span>
                        </div>
                      </th>
                    ))}
                    <th className="min-w-[120px] px-2 py-2 font-medium">Дія</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const isPull = row.action === 'pull' && row.preview.wcStatus === 'found';
                    return (
                      <tr key={row.preview.goodId} className="border-t border-default-100">
                        <td className="px-2 py-2">
                          <p className="font-medium">{row.preview.name}</p>
                          <p className="font-mono text-default-500">{row.preview.sku}</p>
                          {row.preview.wcStatus === 'not_found' ? (
                            <Chip size="sm" color="warning" variant="flat" className="mt-1">Немає на WC</Chip>
                          ) : null}
                        </td>
                        {BULK_PULL_FIELD_OPTIONS.map((field) => {
                          const conflict = row.preview.conflicts.find((c) => c.field === field.conflictField);
                          const disabled = !isPull;
                          return (
                            <td key={field.key} className="px-1 py-2 text-center">
                              {disabled ? (
                                <span className="text-default-300">—</span>
                              ) : (
                                <div className="inline-flex items-center gap-0.5">
                                  <Checkbox
                                    size="sm"
                                    isSelected={row.fieldFlags[field.key]}
                                    onValueChange={(checked) =>
                                      toggleRowField(row.preview.goodId, field.key, checked)
                                    }
                                    aria-label={`${row.preview.sku}: ${field.label}`}
                                  />
                                  {conflict ? (
                                    <PullFieldConflictTooltip
                                      fieldLabel={field.label}
                                      localValue={conflict.localValue}
                                      remoteValue={conflict.remoteValue}
                                    />
                                  ) : null}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2">
                          <Select
                            size="sm"
                            className="min-w-[110px]"
                            aria-label="Дія"
                            selectedKeys={[row.action]}
                            onChange={(e) =>
                              setRowAction(
                                row.preview.goodId,
                                (e.target.value as WooPullBulkRowAction) || 'pull',
                              )
                            }
                          >
                            <SelectItem key="pull" isDisabled={row.preview.wcStatus === 'not_found'}>
                              Pull
                            </SelectItem>
                            <SelectItem key="skip">Skip</SelectItem>
                            <SelectItem key="create_on_wc">Create on WC</SelectItem>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasImagesSelected ? (
              <div className="mt-3 rounded-lg border border-default-200 bg-default-50 px-3 py-2">
                <Checkbox
                  size="sm"
                  isSelected={replaceImages}
                  onValueChange={setReplaceImages}
                  aria-label="Замінити існуючі зображення"
                >
                  <span className="text-sm">Замінити існуючі локальні зображення перед імпортом з WC</span>
                </Checkbox>
                {hasLocalImagesConflict && !replaceImages ? (
                  <p className="mt-1 text-xs text-warning-700">
                    Для товарів із локальними зображеннями увімкніть заміну, інакше імпорт не виконається.
                  </p>
                ) : null}
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>Скасувати</Button>
            <Button color="primary" onPress={() => void handleApply()} isDisabled={rows.length === 0}>
              Застосувати
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <StorefrontSyncReportModal
        report={report}
        onClose={() => {
          setReport(null);
          onClose();
        }}
      />
    </>
  );
}
