import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Chip, Progress, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea } from '@heroui/react';
import { Tabs, Tab } from '@heroui/tabs';
import { DynamicIcon } from 'lucide-react/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { ToastService } from '@/services/ToastService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InventoryStatus = 'draft' | 'in_progress' | 'completed';

interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  /** Залишок за системою (порції або штуки) */
  systemBalance: number;
  /** Фактична кількість (порції або штуки) */
  actualCount: number | null;
  /** Кількість повних коробок (тільки для порційних товарів) */
  boxCount: number | null;
  /** Одиниця виміру: portions = порційний, pcs = штучний */
  unit: 'portions' | 'pcs';
  /** Порцій у коробці (з БД, default 24) */
  portionsPerBox: number;
  /** Чи перевірено позицію */
  checked: boolean;
}

interface InventorySession {
  id: string;
  createdAt: string;
  status: InventoryStatus;
  completedAt: string | null;
  comment: string;
  items: InventoryProduct[];
}

// ---------------------------------------------------------------------------
// Touch-friendly input components (стиль з WarehouseMovement)
// ---------------------------------------------------------------------------

interface StepperInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

/**
 * Сенсорне поле введення для touch-монітора.
 * Клік на центральну область фокусує прихований <input inputMode="numeric">,
 * що викликає системну екранну клавіатуру Windows (OSK).
 * Кнопки ± дозволяють коригувати значення без клавіатури.
 */
const StepperInput = ({ label, value, onChange, onIncrement, onDecrement }: StepperInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const focusInput = () => inputRef.current?.focus();

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="relative w-full">
        {/* Видима область — клік відкриває OSK */}
        <div
          className={`w-full h-18 flex items-center justify-center text-2xl font-medium text-gray-800 bg-white border-2 rounded-xl transition-colors cursor-text select-none ${
            isFocused ? 'border-blue-500' : 'border-gray-200'
          }`}
          onClick={focusInput}
        >
          {value}
        </div>

        {/* Прихований нативний input — отримує фокус → Windows OSK */}
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={value}
          min={0}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(isNaN(v) ? 0 : Math.max(0, v));
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-text"
          aria-label={label}
        />

        {/* Кнопки ± поверх прихованого input */}
        <Button
          isIconOnly variant="light"
          className="absolute left-2 top-1/2 -translate-y-1/2 h-14 w-10 min-w-6 z-10"
          onPress={onDecrement}
          aria-label="Зменшити"
        >
          <DynamicIcon name="minus" className="w-6 h-6" />
        </Button>
        <Button
          isIconOnly variant="light"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-14 w-10 min-w-6 z-10"
          onPress={onIncrement}
          aria-label="Збільшити"
        >
          <DynamicIcon name="plus" className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
};

interface InfoDisplayProps {
  label: string;
  value: string | number;
  colorClass?: string;
}

/** Поле тільки для читання — показує розраховане значення */
const InfoDisplay = ({ label, value, colorClass = 'text-gray-800' }: InfoDisplayProps) => (
  <div className="flex flex-col items-center gap-2">
    <span className="text-sm text-gray-500">{label}</span>
    <div className={`w-full h-18 flex items-center justify-center text-2xl font-medium bg-transparent border-2 border-gray-200 rounded-xl ${colorClass}`}>
      {value}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Mock data — замінити на API-дані
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock data — тимчасово, поки API не повертає реальні дані
// ---------------------------------------------------------------------------

const MOCK_PRODUCTS: InventoryProduct[] = [
  { id: '1', sku: 'BEEF-001',  name: 'Яловичина (порції)',   systemBalance: 120, actualCount: null, boxCount: null, unit: 'portions', portionsPerBox: 24, checked: false },
  { id: '2', sku: 'PORK-002',  name: 'Свинина (порції)',     systemBalance: 96,  actualCount: null, boxCount: null, unit: 'portions', portionsPerBox: 24, checked: false },
  { id: '3', sku: 'CHCK-003',  name: 'Курятина (порції)',    systemBalance: 144, actualCount: null, boxCount: null, unit: 'portions', portionsPerBox: 24, checked: false },
  { id: '4', sku: 'FISH-004',  name: 'Риба лосось (порції)', systemBalance: 72,  actualCount: null, boxCount: null, unit: 'portions', portionsPerBox: 12, checked: false },
  { id: '5', sku: 'VEG-005',   name: 'Овочевий мікс',        systemBalance: 50,  actualCount: null, boxCount: null, unit: 'pcs',      portionsPerBox: 1,  checked: false },
  { id: '6', sku: 'SAUCE-006', name: 'Соус томатний',         systemBalance: 30,  actualCount: null, boxCount: null, unit: 'pcs',      portionsPerBox: 1,  checked: false },
];

const MOCK_HISTORY: InventorySession[] = [
  {
    id: 'inv-001',
    createdAt: '2026-03-22T09:00:00Z',
    status: 'completed',
    completedAt: '2026-03-22T11:35:00Z',
    comment: 'Планова інвентаризація',
    items: [],
  },
  {
    id: 'inv-002',
    createdAt: '2026-03-15T08:45:00Z',
    status: 'completed',
    completedAt: '2026-03-15T10:20:00Z',
    comment: '',
    items: [],
  },
];

// ---------------------------------------------------------------------------
// Helper utils
// ---------------------------------------------------------------------------

const totalPortions = (p: InventoryProduct): number | null => {
  if (p.unit !== 'portions') return p.actualCount;
  if (p.boxCount === null && p.actualCount === null) return null;
  return ((p.boxCount ?? 0) * p.portionsPerBox) + (p.actualCount ?? 0);
};

const statusLabel: Record<InventoryStatus, string> = {
  draft: 'Чернетка',
  in_progress: 'В процесі',
  completed: 'Завершена',
};

const statusColor: Record<InventoryStatus, 'default' | 'warning' | 'success'> = {
  draft: 'default',
  in_progress: 'warning',
  completed: 'success',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProductRowProps {
  product: InventoryProduct;
  index: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onChange: (id: string, field: 'boxCount' | 'actualCount', value: number) => void;
  onCheck: (id: string) => void;
}

const ProductRow = ({ product, index, isOpen, onToggle, onChange, onCheck }: ProductRowProps) => {
  const total = totalPortions(product);
  const deviation = total !== null ? total - product.systemBalance : null;
  const hasDeviation = deviation !== null && deviation !== 0;
  const isCountEntered = total !== null;

  const deviationColorClass =
    deviation === null ? 'text-gray-400'
    : deviation === 0 ? 'text-green-600'
    : deviation < 0 ? 'text-red-500'
    : 'text-blue-600';

  const deviationLabel =
    deviation === null ? '—'
    : deviation > 0 ? `+${deviation}`
    : `${deviation}`;

  return (
    <div className={`border-b border-gray-200 transition-colors ${product.checked ? 'bg-neutral-50' : ''}`}>
      {/* Accordion header */}
      <div
        className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onToggle(product.id)}
      >
        {/* Checkbox */}
        <button
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            product.checked ? 'border-green-500 bg-green-500' : 'border-gray-300'
          }`}
          onClick={(e) => { e.stopPropagation(); onCheck(product.id); }}
          aria-label={product.checked ? 'Відмінити перевірку' : 'Позначити як перевірено'}
        >
          {product.checked && <DynamicIcon name="check" className="w-4 h-4 text-white" />}
        </button>

        {/* Index */}
        {/* <span className="text-sm text-gray-400 w-6 text-center flex-shrink-0">{index + 1}</span> */}

        {/* Name */}
        <span className={`flex-1 text-lg font-semibold text-neutral-800 pl-1 ${product.checked ? 'text-gray-400' : ''}`}>
          {product.name}
        </span>

        {/* Deviation */}
        {hasDeviation && (
            <div className="flex flex-col items-end mr-2">
                <span className="text-xs text-gray-400">{deviation! > 0 ? 'Надлишок' : 'Нестача'}</span>
                <span className={`text-base font-semibold ${deviation! < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                    {deviation! > 0 ? '+' : ''}{deviation}
                </span>
            </div>
        )}

        {/* Count */}
        <div className="flex flex-col items-end mr-2">
            <span className="text-xs text-gray-400">За фактом</span>
            <span className="text-base font-bold text-gray-800 flex items-center h-6">
              {isCountEntered ? (
                <>
                {!hasDeviation && (<DynamicIcon name="check-circle" className="w-4 h-4 text-green-500 mr-1 inline-block" />)}
                {total}
                </>
                ) : <DynamicIcon name="circle-question-mark" className="w-4 h-4 text-gray-400/60 inline-block" />
              }
            </span>
        
        </div>

        {/* System balance */}
        <div className="hidden sm:flex flex-col items-end mr-2">
          <span className="text-xs text-gray-400">За обліком</span>
          <span className="text-base font-bold text-gray-600">{product.systemBalance}</span>
        </div>

        {/* Expand icon */}
        <DynamicIcon
          name="chevron-down"
          className={`w-5 h-5 text-gray-400 ml-1 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Accordion body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="bg-gray-100 py-4 px-4 shadow-inner border-t border-gray-200">
              <div className="grid grid-cols-5 gap-6 items-end">
                {product.unit === 'portions' && (
                  <StepperInput
                    label={`Коробок × ${product.portionsPerBox}`}
                    value={product.boxCount ?? 0}
                    onChange={(v) => onChange(product.id, 'boxCount', v)}
                    onIncrement={() => onChange(product.id, 'boxCount', (product.boxCount ?? 0) + 1)}
                    onDecrement={() => onChange(product.id, 'boxCount', Math.max(0, (product.boxCount ?? 0) - 1))}
                  />
                )}

                <StepperInput
                  label={product.unit === 'portions' ? 'Залишок порцій' : 'Фактична кількість'}
                  value={product.actualCount ?? 0}
                  onChange={(v) => onChange(product.id, 'actualCount', v)}
                  onIncrement={() => onChange(product.id, 'actualCount', (product.actualCount ?? 0) + 1)}
                  onDecrement={() => onChange(product.id, 'actualCount', Math.max(0, (product.actualCount ?? 0) - 1))}
                />

                {product.unit === 'portions' && (
                  <InfoDisplay label="Разом порцій" value={total ?? '—'} />
                )}

                <InfoDisplay
                  label="Відхилення"
                  value={deviationLabel}
                  colorClass={deviationColorClass}
                />

                <Button
                  size="lg"
                  color={product.checked ? 'success' : 'primary'}
                  variant={product.checked ? 'flat' : 'solid'}
                  onPress={() => onCheck(product.id)}
                  startContent={<DynamicIcon name={product.checked ? 'check-circle' : 'circle-check'} className="w-4 h-4 shrink-0" />}
                  className="h-18 rounded-lg gap-1.5"
                >
                  {product.checked ? 'Перевірено' : 'Підтвердити'}
                </Button>
              </div>

              {/* System info + confirm button */}
              <div className="mt-3 pl-4 gap-2 flex items-center text-sm text-gray-400">
                  <span className="font-mono">SKU: {product.sku}</span>
                  <span className="mx-1 text-gray-300">|</span>
                  <span className="font-mono">За обліком: <strong>{product.systemBalance}</strong></span>
                
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// History table
// ---------------------------------------------------------------------------

const HistoryTable = ({ sessions }: { sessions: InventorySession[] }) => {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <DynamicIcon name="clipboard-list" className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>Немає завершених інвентаризацій</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Дата</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Статус</th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600">Коментар</th>
            <th className="text-right py-3 px-4 font-semibold text-gray-600">Дії</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-gray-700">{formatDate(s.createdAt)}</td>
              <td className="py-3 px-4">
                <Chip size="sm" color={statusColor[s.status]} variant="flat">
                  {statusLabel[s.status]}
                </Chip>
              </td>
              <td className="py-3 px-4 text-gray-500 italic">{s.comment || '—'}</td>
              <td className="py-3 px-4 text-right">
                <Button size="sm" variant="light" isIconOnly aria-label="Переглянути">
                  <DynamicIcon name="eye" className="w-4 h-4 text-blue-500" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WarehouseInventory() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [sessionStatus, setSessionStatus] = useState<InventoryStatus | null>(null);
  /** ID поточної сесії в БД (null = ще не збережена) */
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [comment, setComment] = useState('');
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [historySessions, setHistorySessions] = useState<InventorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // --- Завантаження товарів з API ---
  const loadProducts = useCallback(async (): Promise<InventoryProduct[]> => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const res = await fetch('/api/warehouse/inventory/products', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const loaded: InventoryProduct[] = (data.products ?? []).map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        systemBalance: p.systemBalance,
        unit: p.unit as 'portions' | 'pcs',
        portionsPerBox: p.portionsPerBox,
        actualCount: null,
        boxCount: null,
        checked: false,
      }));
      setProducts(loaded);
      return loaded;
    } catch (err: any) {
      setProductsError(err.message ?? 'Помилка завантаження товарів');
      return [];
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // --- Завантаження незавершеної чернетки при mount ---
  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/inventory/draft', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.draft) return;

      const draft = data.draft;
      // Завантажуємо актуальні залишки з API
      const freshProducts = await loadProducts();

      // Відновлюємо введені дані з чернетки
      const savedItems: InventoryProduct[] = JSON.parse(draft.items ?? '[]');
      const savedMap = new Map(savedItems.map((p: InventoryProduct) => [p.id, p]));

      const merged = freshProducts.map((p) => {
        const saved = savedMap.get(p.id);
        if (!saved) return p;
        return {
          ...p,
          actualCount: saved.actualCount,
          boxCount: saved.boxCount,
          checked: saved.checked,
        };
      });

      setProducts(merged);
      setSessionId(draft.id);
      setSessionStatus('in_progress');
      setComment(draft.comment ?? '');
    } catch {
      // Тихо ігноруємо — просто не відновлюємо чернетку
    }
  }, [loadProducts]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // --- Завантаження історії ---
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/warehouse/inventory/history', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const sessions: InventorySession[] = (data.sessions ?? []).map((s: any) => ({
        id: String(s.id),
        createdAt: s.createdAt,
        status: s.status as InventoryStatus,
        completedAt: s.completedAt ?? null,
        comment: s.comment ?? '',
        items: JSON.parse(s.items ?? '[]'),
      }));
      setHistorySessions(sessions);
    } catch {
      // Тихо ігноруємо
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // --- Computed ---
  const checkedCount = useMemo(() => products.filter((p) => p.checked).length, [products]);
  const totalCount = products.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const deviationCount = useMemo(
    () =>
      products.filter((p) => {
        const total = totalPortions(p);
        return total !== null && total !== p.systemBalance;
      }).length,
    [products]
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [products, searchQuery]
  );

  // --- Helpers ---
  /** Серіалізує поточний стан items (тільки ті, що мають дані) */
  const serializeItems = (prods: InventoryProduct[]) =>
    prods.map(({ id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked }) => ({
      id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked,
    }));

  // --- Handlers ---
  const handleStartSession = async () => {
    setSessionStatus('in_progress');
    // Одразу створюємо сесію в БД
    try {
      const res = await fetch('/api/warehouse/inventory/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment, items: serializeItems(products) }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSessionId(data.session.id);
    } catch {
      // Не критично — ID збережеться при першому збереженні чернетки
    }
  };

  const handleToggleProduct = (id: string) => {
    setOpenProductId((prev) => (prev === id ? null : id));
  };

  const handleProductChange = (id: string, field: 'boxCount' | 'actualCount', value: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleCheckProduct = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
    );
  };

  const handleFinish = async () => {
    setShowConfirmFinish(false);
    try {
      if (sessionId) {
        await fetch(`/api/warehouse/inventory/draft/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items: serializeItems(products) }),
        });
      }
    } catch {
      // Не блокуємо UI — завершуємо локально
    }
    setSessionStatus('completed');
  };

  const handleReset = async () => {
    setShowConfirmCancel(false);
    // Видаляємо чернетку з БД
    if (sessionId) {
      try {
        await fetch(`/api/warehouse/inventory/draft/${sessionId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch { /* ігноруємо */ }
    }
    setSessionId(null);
    setSessionStatus(null);
    setComment('');
    setOpenProductId(null);
    setSearchQuery('');
    // Перезавантажуємо товари
    loadProducts();
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const items = serializeItems(products);
      if (sessionId) {
        // Оновлюємо існуючу
        const res = await fetch(`/api/warehouse/inventory/draft/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items }),
        });
        if (!res.ok) throw new Error('Помилка збереження');
      } else {
        // Створюємо нову
        const res = await fetch('/api/warehouse/inventory/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items }),
        });
        if (!res.ok) throw new Error('Помилка збереження');
        const data = await res.json();
        setSessionId(data.session.id);
      }
      ToastService.show({
        title: 'Чернетку збережено',
        description: 'Ви можете повернутись до інвентаризації пізніше',
        color: 'success',
      });
    } catch {
      ToastService.show({ title: 'Помилка збереження чернетки', color: 'danger' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSaveComment = () => {
    setComment(commentDraft);
    setShowCommentModal(false);
    ToastService.show({
      title: 'Коментар додано',
      color: 'success',
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="container">

      {/* ── Main content ── */}
      <div className="flex flex-col gap-4 pb-12 w-full">

        {/* Page subtitle */}
        <p className="text-sm text-gray-500">Підрахунок фактичних залишків малого складу від {formatDate(new Date().toISOString())}</p>

        {/* Tabs row */}
        <div className="flex items-center justify-between gap-4">
          {/* Tabs */}
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => {
              const tab = key as 'current' | 'history';
              setActiveTab(tab);
              if (tab === 'history' && historySessions.length === 0) {
                loadHistory();
              }
            }}
            variant="solid"
            color="default"
            size="lg"
            classNames={{
              tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg",
              cursor: "bg-secondary text-white shadow-sm rounded-md",
              tab: "px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100 text-neutral-500",
              tabContent: "group-data-[selected=true]:text-white text-neutral-400",
            }}
          >
            <Tab key="current" title="Поточна інвентаризація" />
            <Tab key="history" title="Історія" />
          </Tabs>

          {/* Right side meta */}
          <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0 bg-neutral-50 px-4 py-2 h-12 rounded-lg">
            {/* Статус */}
            <div className="flex items-center gap-1.5">
              <span>Статус:</span>
              {sessionStatus === null && (
                <Chip size="sm" color="default" variant="flat" startContent={<DynamicIcon name="file" className="w-3 h-3 ml-1" />}>
                  Чернетка
                </Chip>
              )}
              {sessionStatus === 'in_progress' && (
                <Chip size="sm" color="warning" variant="flat" startContent={<DynamicIcon name="loader-2" className="w-3 h-3 ml-1 animate-spin" />}>
                  В процесі
                </Chip>
              )}
              {sessionStatus === 'completed' && (
                <Chip size="sm" color="success" variant="flat" startContent={<DynamicIcon name="circle-check" className="w-3 h-3 ml-1" />}>
                  Завершена
                </Chip>
              )}
            </div>

            <span className="text-gray-300">|</span>

            {/* Дата */}
            <span className="flex items-center gap-1.5 text-gray-500">
              <DynamicIcon name="calendar" className="w-3.5 h-3.5 text-gray-400" />
              {new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>

            <span className="text-gray-300">|</span>

            {/* Хто проводить */}
            <span className="flex items-center gap-1.5 text-gray-500">
              <DynamicIcon name="user" className="w-3.5 h-3.5 text-gray-400" />
              {user?.name ?? user?.email ?? '—'}
            </span>
          </div>
        </div>

        {/* ──────────── TAB: CURRENT ──────────── */}
        {activeTab === 'current' && (
          <>
            {/* No active session */}
            {sessionStatus === null && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <DynamicIcon name="clipboard-list" className="w-8 h-8 text-blue-500" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-2">
                    Немає активної інвентаризації
                  </h2>
                  <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                    Розпочніть нову інвентаризацію, щоб зафіксувати фактичні залишки малого складу
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto">
                    <Input
                      placeholder="Коментар (необов'язково)"
                      value={comment}
                      onValueChange={setComment}
                      size="sm"
                      className="flex-1"
                      startContent={<DynamicIcon name="message-square" className="w-4 h-4 text-gray-400" />}
                    />
                    <Button
                      color="primary"
                      onPress={handleStartSession}
                      startContent={<DynamicIcon name="play" className="w-4 h-4" />}
                    >
                      Розпочати
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Active / completed session */}
            {(sessionStatus === 'in_progress' || sessionStatus === 'completed') && (
              <>
                {/* Progress bar + actions */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2 h-6">
                    <span className="text-sm font-medium text-gray-700">
                      Перевірено: <strong>{checkedCount}</strong> / {totalCount} позицій
                    </span>
                    <div className="flex items-center gap-3">
                      {deviationCount > 0 && (
                        <Chip size="sm" color="warning" variant="flat" startContent={<DynamicIcon name="alert-triangle" className="w-3 h-3 ml-1" />}>
                          {deviationCount} відхилень
                        </Chip>
                      )}
                      <span className="text-sm font-semibold text-gray-700">{progressPercent}%</span>
                    </div>
                  </div>
                  <Progress
                    aria-label="Прогрес інвентаризації"
                    value={progressPercent}
                    color={progressPercent === 100 ? 'success' : 'primary'}
                    size="sm"
                    className="mb-3"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Пошук позиції..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      size="sm"
                      className="flex-1 min-w-[200px]"
                      startContent={<DynamicIcon name="search" className="w-4 h-4 text-gray-400" />}
                      isClearable
                      onClear={() => setSearchQuery('')}
                    />
                  </div>
                </div>

                {/* Products list */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {productsLoading ? (
                    <div className="text-center py-8 text-gray-400">
                      <DynamicIcon name="loader-2" className="w-8 h-8 mx-auto mb-2 opacity-50 animate-spin" />
                      <p className="text-sm">Завантаження товарів...</p>
                    </div>
                  ) : productsError ? (
                    <div className="text-center py-8 text-red-400">
                      <DynamicIcon name="alert-triangle" className="w-8 h-8 mx-auto mb-2 opacity-70" />
                      <p className="text-sm">{productsError}</p>
                      <Button size="sm" variant="flat" color="danger" className="mt-3" onPress={loadProducts}>
                        Спробувати знову
                      </Button>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <DynamicIcon name="search-x" className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{searchQuery ? 'Позицій не знайдено' : 'Немає товарів на малому складі'}</p>
                    </div>
                  ) : (
                    filteredProducts.map((product, index) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        index={index}
                        isOpen={openProductId === product.id}
                        onToggle={handleToggleProduct}
                        onChange={handleProductChange}
                        onCheck={handleCheckProduct}
                      />
                    ))
                  )}
                </div>

                {/* Summary */}
                {checkedCount > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">                    <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <DynamicIcon name="bar-chart-2" className="w-4 h-4" />
                      Підсумок
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 rounded">
                            <th className="text-left py-2 px-3 font-medium text-gray-500">Позиція</th>
                            <th className="text-center py-2 px-3 font-medium text-gray-500">За обліком</th>
                            <th className="text-center py-2 px-3 font-medium text-gray-500">Факт</th>
                            <th className="text-center py-2 px-3 font-medium text-gray-500">Відхилення</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products
                            .filter((p) => p.checked || totalPortions(p) !== null)
                            .map((p) => {
                              const total = totalPortions(p);
                              const dev = total !== null ? total - p.systemBalance : null;
                              return (
                                <tr key={p.id} className="border-t border-gray-100">
                                  <td className="py-2 px-3 text-gray-700">{p.name}</td>
                                  <td className="py-2 px-3 text-center text-gray-600">{p.systemBalance}</td>
                                  <td className="py-2 px-3 text-center font-medium">{total ?? '—'}</td>
                                  <td className="py-2 px-3 text-center">
                                    {dev === null ? '—' : (
                                      <span className={`font-semibold ${dev === 0 ? 'text-green-600' : dev < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                        {dev > 0 ? '+' : ''}{dev}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Bottom action bar ── */}
                {sessionStatus === 'in_progress' && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between gap-3">
                    {/* Ліва частина */}
                    <Button
                      variant="flat"
                      color="default"
                      onPress={() => setShowConfirmCancel(true)}
                      startContent={<DynamicIcon name="x" className="w-4 h-4" />}
                    >
                      Скасувати
                    </Button>

                    {/* Права частина */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="flat"
                        color="default"
                        onPress={() => { setCommentDraft(comment); setShowCommentModal(true); }}
                        startContent={<DynamicIcon name="message-square-plus" className="w-4 h-4" />}
                      >
                        {comment ? 'Редагувати коментар' : 'Додати коментар'}
                      </Button>
                      <Button
                        variant="flat"
                        color="default"
                        onPress={handleSaveDraft}
                        isLoading={isSavingDraft}
                        startContent={!isSavingDraft ? <DynamicIcon name="save" className="w-4 h-4" /> : undefined}
                      >
                        Зберегти чернетку
                      </Button>
                      <Button
                        color={deviationCount > 0 ? 'danger' : 'success'}
                        className="text-white"
                        isDisabled={checkedCount === 0}
                        onPress={() => setShowConfirmFinish(true)}
                        startContent={
                          <DynamicIcon
                            name={deviationCount > 0 ? 'alert-triangle' : 'check'}
                            className="w-4 h-4"
                          />
                        }
                      >
                        {deviationCount > 0 ? 'Завершити і зафіксувати відхилення' : 'Завершити'}
                      </Button>
                    </div>
                  </div>
                )}

                {sessionStatus === 'completed' && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex justify-end">
                    <Button
                      color="primary"
                      variant="flat"
                      onPress={handleReset}
                      startContent={<DynamicIcon name="plus" className="w-4 h-4" />}
                    >
                      Нова інвентаризація
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ──────────── TAB: HISTORY ──────────── */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">Попередні інвентаризації</h2>
              <Button
                size="sm"
                variant="flat"
                color="default"
                onPress={loadHistory}
                isLoading={historyLoading}
                startContent={!historyLoading ? <DynamicIcon name="refresh-cw" className="w-3.5 h-3.5" /> : undefined}
              >
                Оновити
              </Button>
            </div>
            {historyLoading ? (
              <div className="text-center py-8 text-gray-400">
                <DynamicIcon name="loader-2" className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-sm">Завантаження...</p>
              </div>
            ) : historySessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <DynamicIcon name="clipboard-x" className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Немає завершених інвентаризацій</p>
                <Button size="sm" variant="flat" className="mt-3" onPress={loadHistory}>
                  Завантажити
                </Button>
              </div>
            ) : (
              <HistoryTable sessions={historySessions} />
            )}
          </div>
        )}
      </div>

      {/* ──────────── Confirm finish modal ──────────── */}
      <ConfirmModal
        isOpen={showConfirmFinish}
        title={deviationCount > 0 ? 'Зафіксувати відхилення?' : 'Завершити інвентаризацію?'}
        message={
          deviationCount > 0
            ? `Перевірено ${checkedCount} з ${totalCount} позицій. Знайдено ${deviationCount} відхилень від системних залишків.`
            : `Перевірено ${checkedCount} з ${totalCount} позицій.`
        }
        confirmText={deviationCount > 0 ? 'Зафіксувати і завершити' : 'Завершити'}
        cancelText="Назад"
        onConfirm={handleFinish}
        onCancel={() => setShowConfirmFinish(false)}
      />

      {/* ──────────── Confirm cancel modal ──────────── */}
      <ConfirmModal
        isOpen={showConfirmCancel}
        title="Скасувати інвентаризацію?"
        message="Всі незбережені дані будуть втрачені."
        confirmText="Скасувати інвентаризацію"
        cancelText="Назад"
        onConfirm={handleReset}
        onCancel={() => setShowConfirmCancel(false)}
      />

      {/* ──────────── Comment modal ──────────── */}
      <Modal isOpen={showCommentModal} onClose={() => setShowCommentModal(false)}>
        <ModalContent>
          <ModalHeader>Коментар до інвентаризації</ModalHeader>
          <ModalBody>
            <Textarea
              placeholder="Введіть коментар до інвентаризації..."
              value={commentDraft}
              onValueChange={setCommentDraft}
              minRows={3}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setShowCommentModal(false)}>
              Скасувати
            </Button>
            <Button color="primary" onPress={handleSaveComment}>
              Зберегти
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
