import { useState, useCallback, useRef } from 'react';
import { ToastService } from '@/services/ToastService';
import { LoggingService } from '@/services/LoggingService';
import { serializeMovementItems } from '../WarehouseMovementUtils';
import type { MovementProduct, MovementDraft, MovementBatch } from '../WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// useMovementDraftState — стан і логіка чернетки переміщення
//
// Відповідає за:
//   • savedDraft, isSaving, isSending, notes, selectedDateTime
//   • formatLocalDateTime / buildEffectiveNotes (утиліти нотаток)
//   • isHistoryDocRef — чи документ завантажений з Dilovod
//   • handleSaveDraft — збереження або оновлення чернетки в БД
//   • handleReset — скидання стану до початкового
//   • loadDraftObject — відновлення чернетки з об'єкту MovementDraft
//   • loadMovementFromHistory — відновлення документа з Dilovod-History
// ---------------------------------------------------------------------------

/** Форматує Date у "YYYY-MM-DD HH:mm:ss" в локальному часі (без UTC-конвертації) */
export const formatLocalDateTime = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** Генерує суфікс коментаря. isAdd=true → "Додано", false → "Оновлено" */
const buildDefaultNotes = (isAdd: boolean): string => {
  const date = new Date().toLocaleString('uk-UA');
  return (isAdd ? 'Додано' : 'Оновлено') + ' з Backoffice ' + date;
};

/**
 * Видаляє попередній суфікс "Додано/Оновлено з Backoffice …" і додає новий.
 * Гарантує що суфікс не дублюється при повторних збереженнях.
 */
export const buildEffectiveNotes = (userNotes: string, isAdd: boolean): string => {
  const suffix = buildDefaultNotes(isAdd);
  const cleaned = userNotes
    .replace(/\s*\|\s*(Додано|Оновлено) з Backoffice .+$/, '')
    .trim();
  return cleaned ? `${cleaned} | ${suffix}` : suffix;
};

// ---------------------------------------------------------------------------
// Трансформація даних документа Dilovod → MovementBatch[]
// Виділено окремо для читабельності loadMovementFromHistory
// ---------------------------------------------------------------------------

const buildBatchesFromDocGoods = (
  goods: any[],
  product: MovementProduct,
): MovementBatch[] =>
  goods.map((good, idx) => {
    const totalPortions = parseFloat(good.qty) || 0;
    const portionsPerBox = product.portionsPerBox || 1;
    const calculatedBoxes = Math.floor(totalPortions / portionsPerBox);
    const remainingPortions = totalPortions % portionsPerBox;

    return {
      id: `batch-${product.sku}-${idx}`,
      batchId: good.goodPart || '',
      batchNumber: good.goodPart__pr || '',
      // storage: у tpGoods Діловода є лише unit (одиниця виміру), а не склад партії.
      // Склад партії відомий тільки при ручному виборі через BatchNumbersAutocomplete.
      storage: '',
      quantity: totalPortions,
      boxes: calculatedBoxes,
      portions: remainingPortions,
    };
  });

// ---------------------------------------------------------------------------

export interface UseMovementDraftStateReturn {
  savedDraft: MovementDraft | null;
  setSavedDraft: (v: MovementDraft | null) => void;
  isSaving: boolean;
  isSending: boolean;
  notes: string;
  setNotes: (v: string) => void;
  selectedDateTime: Date;
  setSelectedDateTime: (date: Date) => void;
  isHistoryDocRef: React.MutableRefObject<boolean>;
  handleSaveDraft: (
    summaryItems: MovementProduct[],
    lastSavedSnapshotRef: React.MutableRefObject<string>,
  ) => Promise<MovementDraft | null>;
  handleReset: () => Promise<void>;
  loadDraftObject: (
    draft: MovementDraft,
    loadProducts: () => Promise<MovementProduct[]>,
    loadDraftIntoProducts: (prods: MovementProduct[], items: any[], asOfDate?: Date) => Promise<void>,
  ) => Promise<void>;
  loadMovementFromHistory: (
    doc: any,
    loadProducts: () => Promise<MovementProduct[]>,
    setProducts: React.Dispatch<React.SetStateAction<MovementProduct[]>>,
    setSelectedProductIds: (v: Set<string>) => void,
    lastSavedSnapshotRef: React.MutableRefObject<string>,
    refreshBatchQuantities: (
      prods: MovementProduct[],
      selectedIds: Set<string>,
      asOfDate?: Date,
    ) => Promise<void>,
  ) => Promise<void>;
}

export const useMovementDraftState = (
  createMovement: (data: any) => Promise<any>,
  updateDraft: (id: number, data: any) => Promise<any>,
  warehouseConfigRef: React.MutableRefObject<{ storageFrom: string; storageTo: string } | null>,
): UseMovementDraftStateReturn => {
  const [savedDraft, setSavedDraft] = useState<MovementDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [selectedDateTime, setSelectedDateTime] = useState<Date>(new Date());

  // Чи завантажений документ з Dilovod (з Історії), а не нова чернетка
  // Впливає на суфікс нотатки: "Оновлено" для документів Dilovod, "Додано" для нових
  const isHistoryDocRef = useRef<boolean>(false);

  // ─────────────────────────────────────────────────────────────────────
  // Збереження / оновлення чернетки в БД
  // ─────────────────────────────────────────────────────────────────────

  const handleSaveDraft = useCallback(
    async (
      summaryItems: MovementProduct[],
      lastSavedSnapshotRef: React.MutableRefObject<string>,
    ): Promise<MovementDraft | null> => {
      if (summaryItems.length === 0) {
        ToastService.show({
          title: 'Немає товарів для збереження',
          color: 'danger',
          description: 'Додайте хоча б один товар з партіями для збереження чернетки',
          hideIcon: false,
          icon: 'triangle-alert',
        });
        return null;
      }

      setIsSaving(true);
      try {
        const items = serializeMovementItems(summaryItems);

        let result: any;

        if (savedDraft && savedDraft.status !== 'finalized' && savedDraft.id > 0) {
          LoggingService.warehouseMovementLog(`🏪 Оновлюємо існуючу чернетку: ${savedDraft.id}`);
          const effectiveNotes = buildEffectiveNotes(notes, false);
          result = await updateDraft(savedDraft.id, {
            items,
            movementDate: selectedDateTime.toISOString(),
            notes: effectiveNotes,
          });
        } else {
          LoggingService.warehouseMovementLog('🏪 Створюємо нову чернетку');
          const isAdd = !isHistoryDocRef.current;
          const effectiveNotes = buildEffectiveNotes(notes, isAdd);
          // Використовуємо ID складів з налаштувань (завантажені разом з товарами)
          const storageFrom = warehouseConfigRef.current?.storageFrom ?? savedDraft?.sourceWarehouse ?? '';
          const storageTo   = warehouseConfigRef.current?.storageTo   ?? savedDraft?.destinationWarehouse ?? '';
          result = await createMovement({
            sourceWarehouse: storageFrom,
            destinationWarehouse: storageTo,
            items,
            movementDate: selectedDateTime.toISOString(),
            notes: effectiveNotes,
            ...(savedDraft?.docNumber != null && { docNumber: savedDraft.docNumber }),
            ...(savedDraft?.dilovodDocId != null && { dilovodDocId: savedDraft.dilovodDocId }),
          });
        }

        if (result) {
          const saved: MovementDraft = {
            ...result,
            movementDate: formatLocalDateTime(selectedDateTime),
          };
          setSavedDraft(saved);

          // Оновлюємо snapshot для відстеження наступних змін
          lastSavedSnapshotRef.current = JSON.stringify(
            summaryItems.map(p => ({
              id: p.id,
              batches: p.details.batches.map(b => ({
                batchNumber: b.batchNumber,
                boxes: b.boxes,
                portions: b.portions,
              })),
            })),
          );

          if (result._existing) {
            ToastService.show({ title: 'Знайдено існуючу чернетку — підключено', color: 'warning', hideIcon: false, icon: 'refresh-ccw-dot' });
            LoggingService.warehouseMovementLog(`♻️ Підключено існуючу чернетку #${result.id}`);
          } else {
            ToastService.show({ title: 'Чернетку збережено успішно!', color: 'success', hideIcon: false });
            LoggingService.warehouseMovementLog('✅ Чернетка збережена');
          }
          return saved;
        }
        return null;
      } catch (err: any) {
        const message = err?.message || 'Невідома помилка';
        ToastService.show({ title: 'Помилка збереження', description: message, color: 'danger', hideIcon: false });
        LoggingService.warehouseMovementLog(`🚨 Помилка збереження чернетки: ${message}`);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [savedDraft, notes, selectedDateTime, createMovement, updateDraft, warehouseConfigRef],
  );

  // ─────────────────────────────────────────────────────────────────────
  // Скидання стану до початкового
  // ─────────────────────────────────────────────────────────────────────

  const handleReset = useCallback(async (): Promise<void> => {
    setSavedDraft(null);
    setNotes('');
    setSelectedDateTime(new Date());
    isHistoryDocRef.current = false;
    // Запам'ятовуємо що юзер свідомо скасував — не відновлювати чернетку при наступному рендері
    sessionStorage.setItem('warehouse-draft-dismissed', '1');
    LoggingService.warehouseMovementLog('🔄 Скасовано');
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Відновлення чернетки з об'єкту MovementDraft (таб "Чернетки")
  // ─────────────────────────────────────────────────────────────────────

  const loadDraftObject = useCallback(
    async (
      draft: MovementDraft,
      loadProducts: () => Promise<MovementProduct[]>,
      loadDraftIntoProducts: (prods: MovementProduct[], items: any[], asOfDate?: Date) => Promise<void>,
    ): Promise<void> => {
      try {
        LoggingService.warehouseMovementLog(`📂 Завантажуємо чернетку #${draft.id}`);

        setSavedDraft(null);
        setNotes('');
        isHistoryDocRef.current = false; // Наша чернетка → "Оновлено"
        sessionStorage.removeItem('warehouse-draft-dismissed');

        if (draft.movementDate) {
          setSelectedDateTime(new Date(draft.movementDate));
        }

        const prods = await loadProducts();

        let draftItems: any[] = [];
        if (typeof draft.items === 'string') {
          draftItems = JSON.parse(draft.items as unknown as string);
        } else if (Array.isArray(draft.items)) {
          draftItems = draft.items;
        }

        setSavedDraft(draft);
        if (draft.notes) setNotes(draft.notes);
        const draftDate = draft.movementDate ? new Date(draft.movementDate) : undefined;
        await loadDraftIntoProducts(prods, draftItems, draftDate);
      } catch (err: any) {
        ToastService.show({
          title: 'Помилка завантаження чернетки',
          description: err?.message,
          color: 'danger',
        });
      }
    },
    [],
  );

  // ─────────────────────────────────────────────────────────────────────
  // Завантаження переміщення з Dilovod-History для редагування
  // Трансформує GoodMovingDocument → MovementProduct[] + MovementDraft
  // ─────────────────────────────────────────────────────────────────────

  const loadMovementFromHistory = useCallback(
    async (
      doc: any,
      loadProducts: () => Promise<MovementProduct[]>,
      setProducts: React.Dispatch<React.SetStateAction<MovementProduct[]>>,
      setSelectedProductIds: (v: Set<string>) => void,
      lastSavedSnapshotRef: React.MutableRefObject<string>,
      refreshBatchQuantities: (
        prods: MovementProduct[],
        selectedIds: Set<string>,
        asOfDate?: Date,
      ) => Promise<void>,
    ): Promise<void> => {
      try {
        LoggingService.warehouseMovementLog(
          `📂 Завантажуємо переміщення #${doc.number} для редагування`,
        );

        setSavedDraft(null);
        setNotes('');
        isHistoryDocRef.current = true; // Документ з Dilovod → завжди "Оновлено"
        sessionStorage.removeItem('warehouse-draft-dismissed');

        const currentProducts = await loadProducts();

        if (!doc.details?.tableParts?.tpGoods) {
          LoggingService.warehouseMovementLog('⚠️ Немає товарів у документі');
          return;
        }

        const goodsFromDoc = Object.values(doc.details.tableParts.tpGoods) as any[];

        // Групуємо товари за good (ID товару)
        const goodsMap = new Map<string, any[]>();
        goodsFromDoc.forEach(good => {
          const existing = goodsMap.get(good.good) || [];
          existing.push(good);
          goodsMap.set(good.good, existing);
        });

        // Оновлюємо products на основі документа з Dilovod
        const updated = currentProducts.map(product => {
          const docsGoods = Array.from(goodsMap.values())
            .flat()
            .filter(g => g.good === product.id || g.good__pr === product.name);

          if (docsGoods.length > 0) {
            return {
              ...product,
              details: {
                ...product.details,
                batches: buildBatchesFromDocGoods(docsGoods, product),
              },
            };
          }
          return product;
        });

        setProducts(updated);

        const selectedIds = new Set(
          goodsFromDoc
            .map(good => {
              const prod = currentProducts.find(
                p => p.id === good.good || p.name === good.good__pr,
              );
              return prod?.id ?? null;
            })
            .filter((id): id is string => id !== null),
        );
        setSelectedProductIds(selectedIds);

        // Будуємо тимчасову чернетку для редагування
        // id=0 означає, що запис в нашій БД ще не існує
        // handleSaveDraft при id===0 автоматично викличе createMovement
        const editingDraft: MovementDraft = {
          id: 0,
          internalDocNumber: doc.number || '0',
          docNumber: doc.number ?? undefined,
          dilovodDocId: doc.id ?? undefined,
          status: 'draft',
          sourceWarehouse: doc.storage || '',
          destinationWarehouse: doc.storageTo || '',
          items: Array.from(goodsMap.entries()).flatMap(([, goods]) =>
            goods.map(good => {
              const product = updated.find(p => p.id === good.good || p.name === good.good__pr);
              const totalPortions = parseFloat(good.qty) || 0;
              const portionsPerBox = product?.portionsPerBox || 1;
              return {
                sku: good.good,
                productName: good.good__pr,
                batchId: good.goodPart || '',
                batchNumber: good.goodPart__pr || '',
                // batchStorage: у tpGoods Діловода немає поля складу партії — є лише unit (одиниця виміру).
                // Склад партії відомий лише при ручному виборі через BatchNumbersAutocomplete.
                batchStorage: '',
                forecast: 0,
                boxQuantity: Math.floor(totalPortions / portionsPerBox),
                portionQuantity: totalPortions % portionsPerBox,
              };
            }),
          ),
          draftCreatedAt: new Date().toISOString(),
          dilovodPayload: {
            header: {
              id: doc.id,
              number: doc.number || '0',
              date: doc.date || new Date().toISOString().replace('T', ' ').substring(0, 19),
              firm: doc.firm || '',
              storage: doc.storage || '',
              storageTo: doc.storageTo || '',
              docMode: doc.docMode || '',
              remark: doc.remark || '',
              baseDoc: doc.baseDoc || '',
              author: doc.author || '',
              amountCost: doc.amountCost || 0,
            },
            tableParts: {
              tpGoods: Array.from(goodsMap.entries()).flatMap(([, goods]) =>
                goods.map((good, idx) => ({
                  rowNum: idx + 1,
                  good: good.good,
                  qty: parseFloat(good.qty) || 0,
                  unit: good.unit || '1103600000000001',
                  amountCost: good.amountCost || 0,
                  goodPart: good.goodPart || '',
                  price: good.price || 0,
                  accGood: good.accGood || '1119000000001076',
                  printName: good.good__pr || '',
                })),
              ),
            },
          },
        };

        setSavedDraft(editingDraft);

        // Відновлюємо нотатку з документа Dilovod
        if (doc.remark) {
          setNotes(
            doc.remark
              .replace(/(?:\s*\|\s*)?(?:Додано|Оновлено) з Backoffice.*$/, '')
              .trim(),
          );
        }

        // Відновлюємо дату з документа (doc.date — локальний час Dilovod)
        let docParsedDate: Date | undefined;
        if (doc.date) {
          const candidate = new Date(doc.date.replace(' ', 'T'));
          if (!isNaN(candidate.getTime())) {
            docParsedDate = candidate;
            setSelectedDateTime(candidate);
          }
        }

        // Зберігаємо snapshot
        lastSavedSnapshotRef.current = JSON.stringify(
          updated
            .filter(p => selectedIds.has(p.id))
            .map(p => ({
              id: p.id,
              batches: p.details.batches.map(b => ({
                batchNumber: b.batchNumber,
                boxes: b.boxes,
                portions: b.portions,
              })),
            })),
        );

        await refreshBatchQuantities(updated, selectedIds, docParsedDate);

        LoggingService.warehouseMovementLog(
          `✅ Переміщення #${doc.number} завантажено для редагування`,
        );
      } catch (err: any) {
        const message = err?.message || 'Помилка завантаження';
        ToastService.show({
          title: 'Помилка завантаження переміщення',
          description: message,
          color: 'danger',
        });
        LoggingService.warehouseMovementLog(`🚨 Помилка завантаження переміщення: ${message}`);
      }
    },
    [],
  );

  return {
    savedDraft,
    setSavedDraft,
    isSaving,
    isSending,
    notes,
    setNotes,
    selectedDateTime,
    setSelectedDateTime,
    isHistoryDocRef,
    handleSaveDraft,
    handleReset,
    loadDraftObject,
    loadMovementFromHistory,
  };
};
