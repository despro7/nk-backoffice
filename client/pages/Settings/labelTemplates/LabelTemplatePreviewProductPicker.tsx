import { useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, AutocompleteItem, Chip, Input, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { LabelInputMap } from '@shared/constants/labelInputKeys';
import { emptyLabelInputs } from '@shared/utils/labelInputs';
import { LabelTemplateService } from '@/services/LabelTemplateService';
import { ToastService } from '@/services/ToastService';
import { BatchNumbersAutocomplete } from '@/pages/Warehouse/WarehouseMovement/components/BatchNumbersAutocomplete';
import type { BatchNumber } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import { useBatchNumbers } from '@/pages/Warehouse/WarehouseMovement/hooks/useBatchNumbers';
import type { ProductLabelKind } from '@shared/types/productLabel';
import {
  filterFinishedProductIndex,
  useFinishedProductSearchIndex,
} from './useFinishedProductSearchIndex';

type CatalogHit = { id: string; name: string; sku: string | null };

interface LabelTemplatePreviewProductPickerProps {
  previewInputs: LabelInputMap | null;
  onPreviewInputsChange: (inputs: LabelInputMap | null) => void;
  labelKind?: ProductLabelKind;
  disabled?: boolean;
}

export function LabelTemplatePreviewProductPicker({
  previewInputs,
  onPreviewInputsChange,
  labelKind = 'portion',
  disabled,
}: LabelTemplatePreviewProductPickerProps) {
  const [product, setProduct] = useState<CatalogHit | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const { index: productIndex, loading: productIndexLoading } = useFinishedProductSearchIndex();
  const [selectedBatch, setSelectedBatch] = useState<BatchNumber | null>(null);
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [loadingInputs, setLoadingInputs] = useState(false);
  const [userPickedBatch, setUserPickedBatch] = useState(false);

  const { batches, loading: batchesLoading, error: batchesError, fetchBatches } = useBatchNumbers();

  const productKey = product ? product.sku || product.id : null;
  const productLabel = product
    ? `${product.name}${product.sku ? ` (${product.sku})` : ''}`
    : '';

  const productOptions = useMemo(
    () => filterFinishedProductIndex(productIndex, productQuery),
    [productIndex, productQuery],
  );

  const productItems = useMemo(() => {
    if (!productQuery.trim()) return [];
    if (!product) return productOptions;
    const key = product.sku || product.id;
    const has = productOptions.some((row) => (row.sku || row.id) === key);
    return has ? productOptions : [product, ...productOptions];
  }, [product, productOptions, productQuery]);

  const productInputValue = productMenuOpen || !product ? productQuery : productLabel;

  const clearPreview = useCallback(() => {
    setProduct(null);
    setProductQuery('');
    setSelectedBatch(null);
    setUserPickedBatch(false);
    onPreviewInputsChange(null);
  }, [onPreviewInputsChange]);

  useEffect(() => {
    if (!product?.sku) return;
    void fetchBatches(product.sku, undefined, undefined, false, undefined, {
      includeSmallStorage: true,
    });
  }, [product?.sku, fetchBatches]);

  useEffect(() => {
    if (!product || userPickedBatch || selectedBatch || batches.length === 0) return;
    setSelectedBatch(batches[0]);
  }, [product, batches, userPickedBatch, selectedBatch]);

  useEffect(() => {
    if (!product || !selectedBatch?.batchId) return;
    let cancelled = false;
    setLoadingInputs(true);
    void LabelTemplateService.getPreviewInputs({
      goodId: product.id,
      batchId: selectedBatch.batchId,
      batchNumber: selectedBatch.batchNumber,
      expiration: selectedBatch.expiration,
      labelKind,
    })
      .then((data) => {
        if (cancelled) return;
        onPreviewInputsChange({ ...emptyLabelInputs(), ...data.inputs });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onPreviewInputsChange(null);
        ToastService.show({
          title: 'Перегляд наліпки',
          description: err instanceof Error ? err.message : undefined,
          color: 'danger',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingInputs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product, selectedBatch, labelKind, onPreviewInputsChange]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[220px] flex-1 sm:max-w-md">
          <Autocomplete
            aria-label="Товар для перегляду"
            label="Дані для перегляду"
            labelPlacement="outside"
            placeholder="Пошук товару за назвою або SKU"
            isDisabled={disabled}
            inputValue={productInputValue}
            onInputChange={setProductQuery}
            selectedKey={productKey}
            onOpenChange={(open) => {
              setProductMenuOpen(open);
              if (open && product) setProductQuery(productLabel);
              if (!open) setProductQuery('');
            }}
            onClear={clearPreview}
            onSelectionChange={(key) => {
              if (!key) {
                clearPreview();
                return;
              }
              const hit = productItems.find((row) => (row.sku || row.id) === String(key));
              if (!hit) return;
              setProduct(hit);
              setSelectedBatch(null);
              setUserPickedBatch(false);
              setProductQuery('');
              onPreviewInputsChange(null);
            }}
            items={productItems}
            isClearable
            allowsCustomValue={false}
            menuTrigger="focus"
            defaultFilter={() => true}
            startContent={<DynamicIcon name="scan-eye" size={16} className="text-default-400" />}
            listboxProps={{
              emptyContent: productIndexLoading
                ? 'Завантаження індексу товарів…'
                : 'Лише активні товари ГП — введіть назву або SKU (мін. 2 символи)',
            }}
          >
            {(item) => (
              <AutocompleteItem key={item.sku || item.id} textValue={`${item.name} ${item.sku ?? ''}`}>
                {item.name}{item.sku ? ` (${item.sku})` : ''}
              </AutocompleteItem>
            )}
          </Autocomplete>
        </div>

        <div className="min-w-[200px] flex-1 sm:max-w-xs">
          <Input
            label="Партія"
            labelPlacement="outside"
            placeholder={product?.sku ? 'Оберіть партію…' : 'Спочатку товар'}
            value={selectedBatch?.batchNumber || ''}
            isReadOnly
            isDisabled={disabled || !product?.sku}
            onClick={() => {
              if (product?.sku) setBatchPickerOpen(true);
            }}
            classNames={{ input: product?.sku ? 'cursor-pointer' : undefined }}
          />
          {batchesError ? <p className="mt-1 text-xs text-danger">{batchesError}</p> : null}
        </div>

        <div className="flex items-center gap-2 pb-1 sm:pb-0">
          {loadingInputs ? <Spinner size="sm" /> : null}
          {previewInputs && product ? (
            <Chip size="sm" variant="flat" color="success" startContent={<DynamicIcon name="check" size={12} />}>
              Живі дані
            </Chip>
          ) : product && !selectedBatch ? (
            <Chip size="sm" variant="flat" color="default">Зразок</Chip>
          ) : null}
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
          setBatchPickerOpen(false);
        }}
        onClose={() => setBatchPickerOpen(false)}
        onRefresh={() => {
          if (product?.sku) {
            void fetchBatches(product.sku, undefined, undefined, true, undefined, {
              includeSmallStorage: true,
            });
          }
        }}
      />
    </>
  );
}
