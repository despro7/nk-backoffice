import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Input, Switch, Tooltip } from '@heroui/react';
import {
  Chip,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/react';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { formatRelativeDate } from '../lib/formatUtils';

interface Material {
  id: number;
  dilovodId: string;
  sku: string | null;
  name: string;
  parentId: string | null;
  categoryName: string | null;
  barcode: string | null;
  stockBalanceByStock: Record<string, number> | null;
  manualOrder: number;
  isActive: boolean;
  lastSyncAt: string;
}

interface Folder {
  id: string;
  name: string;
}

const WarehouseMaterials: React.FC = () => {
  const { isAdmin, canEditProducts } = useRoleAccess();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [savingReorder, setSavingReorder] = useState(false);

  // Inline barcode editing
  const [editingBarcode, setEditingBarcode] = useState<number | null>(null);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [savingBarcode, setSavingBarcode] = useState<number | null>(null);

  // Parent IDs modal
  const [isParentIdsModalOpen, setIsParentIdsModalOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [parentIdsLoading, setParentIdsLoading] = useState(false);
  const [parentIdsSaving, setParentIdsSaving] = useState(false);
  const [newFolderInput, setNewFolderInput] = useState({ id: '', name: '' });

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set('includeInactive', 'true');
      const res = await fetch(`/api/materials?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMaterials(data.materials ?? []);
      }
    } catch (err) {
      console.error('[WarehouseMaterials] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchParentIds = async () => {
    setParentIdsLoading(true);
    try {
      const res = await fetch('/api/materials/parent-ids', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFolders(Array.isArray(data.folders) ? data.folders : []);
      }
    } finally {
      setParentIdsLoading(false);
    }
  };

  const saveParentIds = async () => {
    setParentIdsSaving(true);
    try {
      const res = await fetch('/api/materials/parent-ids', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folders }),
      });
      if (res.ok) {
        ToastService.show({ title: 'Збережено', description: 'Список папок оновлено', color: 'success' });
        setIsParentIdsModalOpen(false);
      } else {
        const err = await res.json().catch(() => ({}));
        ToastService.show({ title: 'Помилка', description: err.error || 'Не вдалося зберегти', color: 'danger' });
      }
    } catch (err) {
      ToastService.show({ title: 'Помилка мережі', description: String(err), color: 'danger' });
    } finally {
      setParentIdsSaving(false);
    }
  };

  const syncMaterials = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/materials/sync', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        ToastService.show({ title: 'Синхронізовано', description: data.message, color: 'success' });
        fetchMaterials();
      } else {
        ToastService.show({ title: 'Помилка', description: data.error || 'Невідома помилка', color: 'danger' });
      }
    } catch (err) {
      ToastService.show({ title: 'Помилка мережі', description: String(err), color: 'danger' });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { fetchMaterials(); }, []);
  useEffect(() => { fetchMaterials(); }, [showInactive]);
  useEffect(() => { if (isParentIdsModalOpen) fetchParentIds(); }, [isParentIdsModalOpen]);

  // ── Filtering ────────────────────────────────────────────────────────────────

  const displayMaterials = useMemo(() => {
    if (!searchTerm) return materials;
    const q = searchTerm.toLowerCase();
    return materials.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.sku ?? '').toLowerCase().includes(q) ||
      (m.barcode ?? '').toLowerCase().includes(q)
    );
  }, [materials, searchTerm]);

  // ── Drag & Drop ──────────────────────────────────────────────────────────────

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;

    // При активному пошуку DnD не робимо — порядок незрозумілий
    if (searchTerm) {
      ToastService.show({ title: 'Очистіть пошук', description: 'Перетягування доступне лише без фільтра пошуку', color: 'warning' });
      return;
    }

    const reordered = Array.from(materials);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Призначаємо новий manualOrder за позицією
    const updated = reordered.map((m, idx) => ({ ...m, manualOrder: idx }));
    setMaterials(updated);

    setSavingReorder(true);
    try {
      const res = await fetch('/api/materials/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: updated.map(m => ({ id: m.id, manualOrder: m.manualOrder })) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        ToastService.show({ title: 'Помилка збереження порядку', description: err.error || '', color: 'danger' });
        fetchMaterials(); // відкат
      }
    } catch (err) {
      ToastService.show({ title: 'Помилка мережі', description: String(err), color: 'danger' });
      fetchMaterials();
    } finally {
      setSavingReorder(false);
    }
  };

  // ── Barcode editing ──────────────────────────────────────────────────────────

  const startBarcodeEdit = (material: Material) => {
    setEditingBarcode(material.id);
    setBarcodeValue(material.barcode ?? '');
  };

  const cancelBarcodeEdit = () => {
    setEditingBarcode(null);
    setBarcodeValue('');
  };

  const saveBarcode = async (material: Material) => {
    setSavingBarcode(material.id);
    try {
      const res = await fetch(`/api/materials/${material.id}/barcode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ barcode: barcodeValue }),
      });
      if (res.ok) {
        setMaterials(prev => prev.map(m => m.id === material.id ? { ...m, barcode: barcodeValue.trim() || null } : m));
        ToastService.show({ title: 'Оновлено', description: 'Штрих-код збережено', color: 'success' });
      } else {
        const err = await res.json().catch(() => ({}));
        ToastService.show({ title: 'Помилка', description: err.error || 'Не вдалося оновити', color: 'danger' });
      }
    } finally {
      setSavingBarcode(null);
      cancelBarcodeEdit();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="container">
      <div className="mb-6">
        <p className="text-gray-600">Господарські матеріали (коробки, скотч, плівка тощо) синхронізовані з Dilovod</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Toolbar */}
        <div className="flex justify-between gap-4 p-4">
          <div className="flex flex-1 gap-4 items-center">
            <Switch isSelected={showInactive} onValueChange={setShowInactive} classNames={{ label: "text-sm text-gray-700 leading-none" }}>Показати <br/>застарілі</Switch>
            <Input
              placeholder="Пошук по назві, SKU або штрих-коду..."
              value={searchTerm}
              isClearable
              onClear={() => setSearchTerm('')}
              onChange={e => setSearchTerm(e.target.value)}
              startContent={<DynamicIcon name="search" size={16} />}
              className="max-w-sm"
            />
            {searchTerm && (
              <span className="text-sm text-gray-400">Знайдено: {displayMaterials.length}</span>
            )}
            {savingReorder && (
              <span className="flex items-center gap-1 text-sm text-gray-400">
                <DynamicIcon name="loader-2" className="animate-spin" size={14} /> Збереження порядку...
              </span>
            )}
          </div>

          {isAdmin() && (
            <div className="flex flex-wrap gap-4">
              <Button color="warning" variant="flat" onPress={() => setIsParentIdsModalOpen(true)}>
                <DynamicIcon name="folder-open" size={14} />
                Папки Dilovod
              </Button>
              <Button color="primary" onPress={syncMaterials} isDisabled={syncing}>
                {syncing
                  ? <><DynamicIcon name="loader-2" className="animate-spin" size={14} /> Синхронізація...</>
                  : <><DynamicIcon name="refresh-cw" size={14} /> Синхронізувати з Dilovod</>}
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="p-4">
          {/* Table header */}
          <div className="grid grid-cols-[48px_24px_1fr_160px_140px_120px] gap-2 px-4 py-2 bg-gray-100 rounded-sm text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div />
            <div>#</div>
            <div>Матеріали</div>
            <div>Залишки</div>
            <div>Категорія</div>
            <div>Оновлено</div>
          </div>
          {/* Body */}
          {loading ? (
            <div className="flex items-center justify-center p-12 text-gray-400">
              <DynamicIcon name="loader-2" className="animate-spin mr-2" size={18} />
              Завантаження...
            </div>
          ) : displayMaterials.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              Матеріали не знайдено. Додайте папки Dilovod та натисніть «Синхронізувати».
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="materials" isDropDisabled={!!searchTerm || !canEditProducts()}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {displayMaterials.map((material, index) => (
                      <Draggable
                        key={material.id}
                        draggableId={String(material.id)}
                        index={index}
                        isDragDisabled={!!searchTerm || !canEditProducts()}
                      >
                        {(drag, snapshot) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            className={`grid grid-cols-[32px_40px_1fr_160px_140px_120px] gap-2 px-4 py-3 border-b border-gray-50 items-center transition-colors rounded-sm ${snapshot.isDragging ? 'bg-gray-100 shadow-md' : 'hover:bg-gray-50'} ${!material.isActive ? 'opacity-40' : ''}`}
                          >
                            {/* Drag handle */}
                            <div
                              {...drag.dragHandleProps}
                              className={`flex items-center justify-center text-gray-300 ${canEditProducts() && !searchTerm ? 'cursor-grab hover:text-gray-500' : 'cursor-default'}`}
                              title={canEditProducts() && !searchTerm ? 'Перетягніть для зміни порядку' : ''}
                            >
                              <DynamicIcon name="grip-vertical" size={16} />
                            </div>
                            {/* Index */}
                            <div className="text-sm text-gray-400 text-center">{index + 1}</div>
                            {/* Name + SKU + Barcode */}
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-sm font-semibold text-gray-900 truncate">{material.name}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {material.sku && (
                                  <span className="text-sm text-gray-500">
                                    SKU: {material.sku}
                                  </span>
                                )}
                                {editingBarcode === material.id ? (
                                  <>
                                    <input
                                      type="text"
                                      value={barcodeValue}
                                      onChange={e => setBarcodeValue(e.target.value)}
                                      className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      autoFocus
                                      disabled={savingBarcode === material.id}
                                      placeholder="---"
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveBarcode(material);
                                        else if (e.key === 'Escape') cancelBarcodeEdit();
                                      }}
                                      onFocus={e => e.currentTarget.select()}
                                    />
                                    <Button size="sm" color="success" variant="flat" onPress={() => saveBarcode(material)} isDisabled={savingBarcode === material.id} className="min-w-0 px-2">
                                      {savingBarcode === material.id
                                        ? <DynamicIcon name="loader-2" className="animate-spin" size={12} />
                                        : <DynamicIcon name="check" size={12} />}
                                    </Button>
                                    <Button size="sm" color="danger" variant="flat" onPress={cancelBarcodeEdit} isDisabled={savingBarcode === material.id} className="min-w-0 px-2">
                                      <DynamicIcon name="x" size={12} />
                                    </Button>
                                  </>
                                ) : (
                                  <div
                                    className={`flex items-center gap-1 text-sm text-gray-700 bg-gray-100 ${canEditProducts() ? 'cursor-pointer hover:bg-gray-200' : 'cursor-not-allowed opacity-60'} px-2 py-1 rounded min-w-[80px]`}
                                    onClick={() => canEditProducts() && startBarcodeEdit(material)}
                                    title={canEditProducts() ? 'Натисніть для редагування' : 'Немає прав'}
                                  >
                                    <DynamicIcon name="scan-barcode" size={14} />
                                    {material.barcode || <span className="text-neutral-400">додати штрих‑код</span>}
                                  </div>
                                )}
                              </div>
                              {!material.isActive && (
                                <span className="w-fit text-xs py-0.5 px-1.5 rounded bg-gray-400 text-white">Неактивний</span>
                              )}
                            </div>
                            {/* Stock balances */}
                            <div className="flex flex-col gap-1 text-sm">
                              {material.stockBalanceByStock ? (
                                <Tooltip content="Склад ГП / Склад М" color="secondary" size="sm">
                                  <div className="flex items-center gap-1 text-sm cursor-help">
                                    <DynamicIcon name="package" size={14} />
                                    <span>{material.stockBalanceByStock['1'] ?? 0}</span>
                                    <span className="text-gray-500">/</span>
                                    <span>{material.stockBalanceByStock['2'] ?? 0}</span>
                                  </div>
                                </Tooltip>
                              ) : (
                                <Tooltip content="Записи відсутні" color="secondary" size="sm">
                                  <div className="flex items-center gap-1 text-sm text-gray-300 cursor-help">
                                    <DynamicIcon name="package" size={14} />
                                    <span>0 / 0</span>
                                  </div>
                                </Tooltip>
                              )}
                            </div>
                            {/* Category name */}
                            <div className="text-xs text-gray-500 truncate">
                              {material.categoryName || (
                                <span className="font-mono text-gray-300">{material.parentId}</span>
                              )}
                            </div>
                            {/* Last sync */}
                            <div className="text-sm text-gray-400">{formatRelativeDate(material.lastSyncAt)}</div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* Parent IDs modal */}
      <Modal isOpen={isParentIdsModalOpen} onClose={() => setIsParentIdsModalOpen(false)} size="lg">
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <DynamicIcon name="folder-open" size={18} />
              Папки Dilovod
            </div>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600 mb-3">
              Товари з цих папок Dilovod будуть показані в розділі «Матеріали».
              Вкажіть ID батьківської папки та її назву для відображення в таблиці.
            </p>

            {parentIdsLoading ? (
              <div className="flex items-center gap-2 py-4 text-gray-500">
                <DynamicIcon name="loader-2" className="animate-spin" size={16} />
                Завантаження...
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {folders.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Список порожній</p>
                  )}
                  {folders.map((folder, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <Input
                        size="sm"
                        value={folder.id}
                        onChange={e => setFolders(prev => prev.map((f, i) => i === index ? { ...f, id: e.target.value } : f))}
                        placeholder="ID папки"
                        className="w-48 font-mono"
                        label="ID"
                        labelPlacement="outside"
                      />
                      <Input
                        size="sm"
                        value={folder.name}
                        onChange={e => setFolders(prev => prev.map((f, i) => i === index ? { ...f, name: e.target.value } : f))}
                        placeholder="Назва (напр. Пакети)"
                        className="flex-1"
                        label="Назва"
                        labelPlacement="outside"
                      />
                      <Button
                        size="sm" color="danger" variant="flat" isIconOnly
                        onPress={() => setFolders(prev => prev.filter((_, i) => i !== index))}
                        title="Видалити"
                        // className="mt-5"
                      >
                        <DynamicIcon name="trash-2" size={14} />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-end gap-2 pt-2 mb-2 border-t border-gray-100">
                  <Input
                    size="sm"
                    value={newFolderInput.id}
                    onChange={e => setNewFolderInput(prev => ({ ...prev, id: e.target.value }))}
                    placeholder="ID папки"
                    className="w-48 font-mono"
                    label="ID"
                    labelPlacement="outside"
                  />
                  <Input
                    size="sm"
                    value={newFolderInput.name}
                    onChange={e => setNewFolderInput(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Назва папки..."
                    className="flex-1"
                    label="Назва"
                    labelPlacement="outside"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newFolderInput.id.trim()) {
                        setFolders(prev => [...prev, { id: newFolderInput.id.trim(), name: newFolderInput.name.trim() }]);
                        setNewFolderInput({ id: '', name: '' });
                      }
                    }}
                  />
                  <Button
                    size="sm" color="success" variant="flat"
                    // className="bg-green-300 text-green-600"
                    onPress={() => {
                      if (newFolderInput.id.trim()) {
                        setFolders(prev => [...prev, { id: newFolderInput.id.trim(), name: newFolderInput.name.trim() }]);
                        setNewFolderInput({ id: '', name: '' });
                      }
                    }}
                  >
                    <DynamicIcon name="plus" size={14} />
                    Додати
                  </Button>
                </div>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsParentIdsModalOpen(false)} isDisabled={parentIdsSaving}>
              Скасувати
            </Button>
            <Button color="primary" onPress={saveParentIds} isDisabled={parentIdsSaving || parentIdsLoading}>
              {parentIdsSaving
                ? <><DynamicIcon name="loader-2" className="animate-spin" size={14} /> Збереження...</>
                : <><DynamicIcon name="save" size={14} /> Зберегти</>}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default WarehouseMaterials;
