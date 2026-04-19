import { useState, useRef } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { StepperInput } from '../../shared/StepperInput';
import { BatchNumbersAutocomplete } from './BatchNumbersAutocomplete';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useBatchNumbers, type BatchNumber } from '../hooks/useBatchNumbers';
import { ToastService } from '@/services/ToastService';
import { pluralize } from '@/lib/formatUtils';
import type { MovementProduct, MovementBatch } from '../WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// MovementProductRow — рядок товару з акордіоном для редагування багатьох партій
// ---------------------------------------------------------------------------

interface MovementProductRowProps {
  product: MovementProduct;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onChange: (id: string, batches: MovementBatch[]) => void;
  activeField?: string | null;
  selectedDateTime?: Date;
  firmId?: string; // ID фірми для запиту партій
}

export const MovementProductRow = ({
  product,
  isOpen,
  onToggle,
  onChange,
  activeField = null,
  selectedDateTime = new Date(),
  firmId,
}: MovementProductRowProps) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingBatchIndex, setEditingBatchIndex] = useState<number | null>(null);
  const [deleteConfirmBatchIndex, setDeleteConfirmBatchIndex] = useState<number | null>(null);
  const [isCollapseConfirmOpen, setIsCollapseConfirmOpen] = useState(false);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const isDrawerJustClosed = useRef(false);
  const { batches, loading, fetchBatches } = useBatchNumbers();

  // Обчислюємо загальну кількість порцій по всіх партіях
  const totalPortions = product.details.batches.reduce(
    (sum, batch) => sum + batch.boxes * product.portionsPerBox + batch.portions,
    0
  );

  const handleToggle = () => {
    // Якщо намагаємося закрити акордіон і вже є партії — питаємо підтвердження
    if (isOpen && product.details.batches.length > 0) {
      setIsCollapseConfirmOpen(true);
      return;
    }
    onToggle(product.id);
  };

  const handleConfirmCollapse = () => {
    setIsCollapseConfirmOpen(false);
    onChange(product.id, []); // очищаємо всі партії
    onToggle(product.id);
  };

  const handleAddBatchClick = () => {
    setEditingBatchIndex(-1); // -1 означає "додавання нової партії"
    setIsDrawerOpen(true);
    fetchBatches(product.sku, selectedDateTime, firmId);
  };

  const handleEditBatchClick = (index: number) => {
    setEditingBatchIndex(index);
    setIsDrawerOpen(true);
    fetchBatches(product.sku, selectedDateTime, firmId);
  };

  /** Примусово оновлює партії з Dilovod (скидає серверний кеш) */
  const handleRefreshBatches = () => {
    fetchBatches(product.sku, selectedDateTime, firmId, true);
  };

  const handleDrawerClose = () => {
    isDrawerJustClosed.current = true;
    setIsDrawerOpen(false);
    setEditingBatchIndex(null);
  };

  const handleBatchSelect = (batch: BatchNumber) => {
    isDrawerJustClosed.current = true;

    const newBatches = [...product.details.batches];
    
    if (editingBatchIndex === -1) {
      // Перевіряємо, чи ця партія (batchId + storage) вже є в списку
      const isDuplicate = newBatches.some(
        (b) => b.batchId === batch.batchId && b.storage === batch.storage,
      );
      if (isDuplicate) {
        ToastService.show({
          title: 'Партія вже додана',
          description: `Партія ${batch.batchNumber} (${batch.storageDisplayName}) вже є в списку`,
          color: 'warning',
          icon: 'alert-triangle',
          hideIcon: false,
          timeout: 4000,
        });
        setIsDrawerOpen(false);
        setEditingBatchIndex(null);
        return;
      }
      // Додавання нової партії
      const newBatch: MovementBatch = {
        id: `batch-${Date.now()}`,
        batchId: batch.batchId,
        batchNumber: batch.batchNumber,
        storage: batch.storage,
        quantity: batch.quantity,
        boxes: 0,
        portions: 0,
      };
      newBatches.push(newBatch);
    } else if (editingBatchIndex !== null) {
      // Перевіряємо, чи обрана партія вже присутня під іншим індексом
      const isDuplicate = newBatches.some(
        (b, i) => i !== editingBatchIndex && b.batchId === batch.batchId && b.storage === batch.storage,
      );
      if (isDuplicate) {
        ToastService.show({
          title: 'Партія вже додана',
          description: `Партія ${batch.batchNumber} (${batch.storageDisplayName}) вже є в списку`,
          color: 'warning',
          icon: 'alert-triangle',
          hideIcon: false,
          timeout: 4000,
        });
        setIsDrawerOpen(false);
        setEditingBatchIndex(null);
        return;
      }
      // Редагування існуючої партії — лише обновляємо пов'язану інформацію партії
      newBatches[editingBatchIndex].batchId = batch.batchId;
      newBatches[editingBatchIndex].batchNumber = batch.batchNumber;
      newBatches[editingBatchIndex].storage = batch.storage;
      newBatches[editingBatchIndex].quantity = batch.quantity;
    }

    onChange(product.id, newBatches);
    setIsDrawerOpen(false);
    setEditingBatchIndex(null);

    ToastService.show({
      title: 'Партія успішно додана',
      description: `Партія ${batch.batchNumber} (залишок: ${batch.quantity} пор.) готова до редагування`,
      color: 'primary',
      icon: 'package-plus',
      hideIcon: false,
      timeout: 5000
    });
  };

  const handleUpdateBatchQuantity = (index: number, field: 'boxes' | 'portions', value: number) => {
    const newBatches = [...product.details.batches];
    newBatches[index][field] = value;
    onChange(product.id, newBatches);
  };

  const handleRemoveBatch = (index: number) => {
    const newBatches = product.details.batches.filter((_, i) => i !== index);
    onChange(product.id, newBatches);

    ToastService.show({
      title: 'Партія видалена',
      description: `Партія ${product.details.batches[index].batchNumber} була видалена`,
      color: 'default',
      icon: 'package-minus',
      hideIcon: false,
      timeout: 3000
    });
  };

  const handleOpenDeleteConfirm = (index: number) => {
    setDeleteConfirmBatchIndex(index);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmBatchIndex !== null) {
      handleRemoveBatch(deleteConfirmBatchIndex);
      setDeleteConfirmBatchIndex(null);
    }
  };

  const handleMaxBatch = (index: number) => {
    const batch = product.details.batches[index];
    const maxBoxes = Math.floor(batch.quantity / product.portionsPerBox);
    const maxPortions = batch.quantity - maxBoxes * product.portionsPerBox;

    const newBatches = [...product.details.batches];
    newBatches[index].boxes = maxBoxes;
    newBatches[index].portions = maxPortions;
    onChange(product.id, newBatches);

    ToastService.show({
      title: 'Додано все що на залишку',
      description: `Партія ${batch.batchNumber}: ${maxBoxes} коробок + ${maxPortions} порцій`,
      color: 'default',
      icon: 'check-circle-2',
      hideIcon: false,
      timeout: 3000
    });
  };

  return (
    <div className="border-b border-gray-200">
      {/* Заголовок акордіона */}
      <div className="flex items-center justify-between px-6 py-4 cursor-pointer" onClick={handleToggle}>
        <div className="flex items-center gap-4">
          <div
            className={`w-6 h-6 rounded-full border-2 leading-[100%] pb-[2px] flex items-center justify-center flex-shrink-0 transition-colors ${
              isOpen ? 'border-blue-500' : 'border-gray-300'
            }`}
          >
            <span className={`text-xl ${isOpen ? 'text-blue-500' : 'text-gray-400'}`}>
              {isOpen ? '−' : '+'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xl font-semibold text-neutral-800">{product.name}</span>
            <div className="flex gap-3 text-gray-400 text-xs">
              <span>артикул: {product.sku}</span>
              {product.barcode && <span className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-1 before:bg-neutral-300 before:rounded-full">штрих-код: {product.barcode}</span>}
              <span className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-1 before:bg-neutral-300 before:rounded-full">в коробці: {product.portionsPerBox} пор.</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2">
            <DynamicIcon name="box" className="w-5 h-5 text-neutral-300" />
            <div className="flex items-center gap-2 font-semibold text-lg text-neutral-800">
              <span className={`${product.stockData.mainStock == 0 && 'text-danger-400'}`}>{product.stockData.mainStock}</span> {totalPortions > 0 && <span className="text-danger-400">{"->"} {product.stockData.mainStock - totalPortions}</span>}
              /
              <span className={`${product.stockData.smallStock == 0 && 'text-danger-400'}`}>{product.stockData.smallStock} {totalPortions > 0 && <span className="text-green-600">{"->"} {product.stockData.smallStock + totalPortions}</span>}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400/60">
            Склад ГП / Склад М
          </div>
        </div>
      </div>

      {/* Вміст акордіона */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.section
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: 'auto' },
              collapsed: { opacity: 0, height: 0 },
            }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="bg-gray-100 pt-6 pb-6 px-6 shadow-inner">
              {/* Список обраних партій */}
              {product.details.batches.length > 0 && (
                <div className="space-y-3 mb-6">
                  {product.details.batches.map((batch, index) => {
                    const batchTotal = batch.boxes * product.portionsPerBox + batch.portions;
                    const maxBoxes = Math.floor(batch.quantity / product.portionsPerBox);
                    const maxPortions = Math.max(0, batch.quantity - batch.boxes * product.portionsPerBox);

                    return (
                      <div key={batch.id} className="border-b-1 border-gray-300 pb-4 flex flex-col gap-3">
                        {/* Заголовок партії */}
                        <div className="flex items-center justify-between">
                          <h3 className="flex items-center gap-2">
                            <span className="font-semibold text-neutral-800">Партія: {batch.batchNumber}</span>
                            <span className="font-normal text-neutral-800 text-xs uppercase border-1 border-gray-400 rounded-sm px-1.5 py-1">Залишок: {batch.quantity} {batchTotal > 0 && <span className="text-purple-600">{"->"} {batch.quantity - batchTotal}</span>} {pluralize(batchTotal > 0 ? batch.quantity - batchTotal : batch.quantity, 'порція', 'порції', 'порцій')}</span>
                          </h3>
                        </div>

                        {/* Вхідні поля для коробок/порцій */}
                        <div className="grid grid-cols-[1fr_1fr_1fr_320px] items-end gap-3 pb-3">
                          <StepperInput
                            label={`коробок × ${product.portionsPerBox}`}
                            value={batch.boxes}
                            max={maxBoxes}
                            onChange={(val) => handleUpdateBatchQuantity(index, 'boxes', val)}
                            onIncrement={() =>
                              handleUpdateBatchQuantity(index, 'boxes', Math.min(batch.boxes + 1, maxBoxes))
                            }
                            onDecrement={() =>
                              handleUpdateBatchQuantity(index, 'boxes', Math.max(0, batch.boxes - 1))
                            }
                          />
                          <StepperInput
                            label="порцій"
                            value={batch.portions}
                            max={maxPortions}
                            onChange={(val) => handleUpdateBatchQuantity(index, 'portions', val)}
                            onIncrement={() =>
                              handleUpdateBatchQuantity(index, 'portions', Math.min(batch.portions + 1, maxPortions))
                            }
                            onDecrement={() =>
                              handleUpdateBatchQuantity(index, 'portions', Math.max(0, batch.portions - 1))
                            }
                          />
                          <div className="flex flex-col items-center gap-2">
                            <span className="text-sm text-gray-500">всього</span>
                            <div className="w-full h-[74px] flex items-center justify-center text-2xl font-medium text-neutral-800 border-2 rounded-xl">
                              {batchTotal}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="lg"
                              variant="light"
                              className="h-19 px-12 text-purple-500 bg-purple-100 hover:bg-purple-200!"
                              onPress={() => handleMaxBatch(index)}
                              startContent={<DynamicIcon name="package-plus" strokeWidth={1.5} className="w-6 h-6 shrink-0 -mx-1" />}
                            >
                              MAX
                            </Button>
                            <Button
                              isIconOnly
                              size="lg"
                              variant="light"
                              className="h-19 px-12 text-blue-500 bg-blue-100 hover:bg-blue-200!"
                              onPress={() => handleEditBatchClick(index)}
                            >
                              <DynamicIcon name="edit-2" strokeWidth={1.5} className="w-6 h-6 shrink-0" />
                            </Button>
                            <Button
                              isIconOnly
                              size="lg"
                              variant="light"
                              className="h-19 px-12 text-red-500 bg-red-100 hover:bg-red-200!"
                              onPress={() => handleOpenDeleteConfirm(index)}
                            >
                              <DynamicIcon name="trash-2" strokeWidth={1.5} className="w-6 h-6 shrink-0" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Сумарна інформація */}
              <div className="flex items-center justify-end gap-10">
                {product.details.batches.length === 0 && (
                  <div className="flex-1 text-center leading-none text-gray-500 text-sm">
                    Партії не обрано. Натисніть кнопку нижче для додавання.
                  </div>
                )}
                {/* Кнопка додавання партії */}
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-bold text-neutral-800 leading-none">{totalPortions}</div>
                  <span className="text-xs text-gray-500 mt-1 leading-none">всього порцій</span>
                </div>
                <Button
                  color="primary"
                  variant="solid"
                  size="lg"
                  startContent={<DynamicIcon name="plus" className="w-4 h-4" />}
                  onPress={handleAddBatchClick}
                >
                  Додати партію
                </Button>
                {/* <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-300 mb-1">прогноз</span>
                  <div className="text-3xl font-semibold text-gray-300">{product.details.forecast}</div>
                </div> */}
              </div>

              {/* BatchNumbersAutocomplete — видно коли Drawer відкритий */}
              {isDrawerOpen && (
                <BatchNumbersAutocomplete
                  batches={batches}
                  isOpen={isDrawerOpen}
                  isLoading={loading}
                  selectedBatch={editingBatchIndex !== null && editingBatchIndex !== -1 ? product.details.batches[editingBatchIndex]?.batchNumber : ''}
                  selectedStorage={editingBatchIndex !== null && editingBatchIndex !== -1 ? product.details.batches[editingBatchIndex]?.storage : ''}
                  selectedDateTime={selectedDateTime}
                  addedBatchKeys={new Set(
                    product.details.batches
                      .filter((_, i) => i !== editingBatchIndex)
                      .map((b) => `${b.batchId}:${b.storage}`),
                  )}
                  onSelect={handleBatchSelect}
                  onClose={handleDrawerClose}
                  onRefresh={handleRefreshBatches}
                  inputRef={batchInputRef}
                />
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ConfirmModal для видалення партії */}
      <ConfirmModal
        isOpen={deleteConfirmBatchIndex !== null}
        title="Видалити партію?"
        message={
          deleteConfirmBatchIndex !== null
            ? `Видалення партії ${product.details.batches[deleteConfirmBatchIndex].batchNumber} – ${product.details.batches[deleteConfirmBatchIndex].boxes} коробок + ${product.details.batches[deleteConfirmBatchIndex].portions} порцій`
            : ''
        }
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmBatchIndex(null)}
      />

      {/* ConfirmModal для згортання акордіона з партіями */}
      <ConfirmModal
        isOpen={isCollapseConfirmOpen}
        title="Виключити товар зі списку?"
        message={`Товар «${product.name}» вже має ${product.details.batches.length} ${pluralize(product.details.batches.length, 'партію', 'партії', 'партій')} (${totalPortions} пор.). Після закриття всі партії будуть видалені.`}
        confirmText="Видалити і закрити"
        cancelText="Скасувати"
        onConfirm={handleConfirmCollapse}
        onCancel={() => setIsCollapseConfirmOpen(false)}
      />
    </div>
  );
};
