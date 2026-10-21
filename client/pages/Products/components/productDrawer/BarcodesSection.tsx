import { Button, Input, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useProductMovementsDrawerOptional } from '@/features/product-movements/context/productMovementsDrawerContext.shared';
import type { BarcodeRow, RowDeleteKind } from './productDrawerTypes';
import { FieldDirtyMarker } from './FieldDirtyMarker';
import { RowDeleteButton } from './RowDeleteButton';

function BarcodeBatchMovementsButton({
  sku,
  productName,
  batchId,
  batchLabel,
  disabled,
}: {
  sku: string | null;
  productName: string | null;
  batchId: string;
  batchLabel: string;
  disabled?: boolean;
}) {
  const movementsDrawer = useProductMovementsDrawerOptional();
  if (!movementsDrawer) {
    return null;
  }
  const { open } = movementsDrawer;
  const canOpen = Boolean(sku?.trim() && batchId.trim());
  return (
    <Button
      size="sm"
      variant="light"
      className="min-w-0 shrink-0 gap-1 px-3 h-10"
      startContent={<DynamicIcon name="arrow-left-right" size={14} />}
      isDisabled={disabled || !canOpen}
      onPress={() => {
        if (!sku?.trim() || !batchId.trim()) return;
        open({
          sku: sku.trim(),
          productName: productName?.trim() || undefined,
          goodPartId: batchId.trim(),
          batchLabel: batchLabel.trim() || undefined,
          autoGenerate: true,
          placement: 'left',
          nonDismissable: true,
        });
      }}
    >
      <span className="hidden md:inline-block">Рухи партії</span>
    </Button>
  );
}

interface BarcodesSectionProps {
  barcodes: BarcodeRow[];
  sku: string | null;
  productName: string | null;
  saving?: boolean;
  barcodeGeneratingIdx: number | null;
  dirty?: boolean;
  rowDeleteConfirm: { kind: RowDeleteKind; idx: number } | null;
  onBarcodesChange: (updater: (prev: BarcodeRow[]) => BarcodeRow[]) => void;
  onGenerateBarcode: (idx: number) => void;
  onOpenBatchPicker: (idx: number) => void;
  onRowDeleteConfirm: (next: { kind: RowDeleteKind; idx: number } | null) => void;
}

export function BarcodesSection({
  barcodes,
  sku,
  productName,
  saving,
  barcodeGeneratingIdx,
  dirty,
  rowDeleteConfirm,
  onBarcodesChange,
  onGenerateBarcode,
  onOpenBatchPicker,
  onRowDeleteConfirm,
}: BarcodesSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-1">
        <DynamicIcon name="scan-barcode" size={14} />
        <span>Штрихкоди і партії</span>
        <FieldDirtyMarker show={dirty} />
      </h3>
      {barcodes.map((b, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2">
          <Input
            size="md"
            aria-label="Штрихкод"
            labelPlacement="outside"
            placeholder="Введіть або згенеруйте штрихкод"
            classNames={{
              base: 'flex-1',
              inputWrapper: 'border-1 border-default-200',
            }}
            value={b.code}
            onValueChange={(v) =>
              onBarcodesChange((prev) => prev.map((row, i) => (i === idx ? { ...row, code: v } : row)))
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
                  content: 'bg-blue-500 text-white rounded-sm',
                }}
              >
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="default"
                  className={`text-default-500 hover:text-blue-600/75 hover:bg-blue-600/10! -mr-2`}
                  aria-label="Генерувати ШК автоматично"
                  onPress={() => onGenerateBarcode(idx)}
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
              inputWrapper: 'cursor-pointer border-1 border-default-200',
              input: 'cursor-pointer py-2',
            }}
            onClick={() => onOpenBatchPicker(idx)}
            endContent={
              <DynamicIcon name="chevrons-up-down" size={14} className="shrink-0 text-default-400" />
            }
          />
          <BarcodeBatchMovementsButton
            sku={sku}
            productName={productName}
            batchId={b.goodPart}
            batchLabel={b.goodPartName}
            disabled={saving}
          />
          <RowDeleteButton
            ariaLabel="Видалити ШК"
            className="shrink-0 h-10"
            confirming={rowDeleteConfirm?.kind === 'barcode' && rowDeleteConfirm.idx === idx}
            onRequest={() => onRowDeleteConfirm({ kind: 'barcode', idx })}
            onConfirm={() => {
              onBarcodesChange((prev) => prev.filter((_, i) => i !== idx));
              onRowDeleteConfirm(null);
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
          onBarcodesChange((prev) => [
            ...prev,
            { code: '', activity: true, goodPart: '', goodPartName: '' },
          ])
        }
      >
        Додати ШК
      </Button>
    </section>
  );
}
