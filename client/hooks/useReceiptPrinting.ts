/**
 * useReceiptPrinting — хук для управління друком чеків.
 *
 * Підтримує:
 * - Ручний перегляд (без принтера)
 * - Ручний друк через QZ Tray
 * - Автодрук при завершенні збору замовлення
 */

import { useState, useCallback } from 'react';
import { useEquipmentFromAuth } from '@/contexts/AuthContext';
import { receiptClientService } from '@/services/ReceiptService';
import type { OrderChecklistItem } from '../types/orderAssembly';

// ────────────────────────────────────────────────────────────────
// Типи
// ────────────────────────────────────────────────────────────────

export type ReceiptType = 'fiscal' | 'warehouse';

export interface UseReceiptPrintingOptions {
  order: any;
  checklistItems: OrderChecklistItem[];
  /** Функція apiCall з хука useApi (потрібна для запитів до сервера) */
  apiCall: (url: string, options?: RequestInit) => Promise<Response>;
}

export interface UseReceiptPrintingResult {
  isPrinting: boolean;
  receiptConfig: {
    enabled: boolean;
    name: string;
    defaultReceiptType?: 'fiscal' | 'warehouse' | 'both';
    autoPrintOnComplete?: boolean;
    autoPrintDelayMs?: number;
  } | undefined;
  /** Ручний друк чека через QZ Tray. receiptIndex — для вибору конкретного чека (за замовчуванням 0) */
  handlePrintReceipt: (type?: ReceiptType, receiptIndex?: number) => Promise<void>;
  /** Перегляд чека у новому вікні браузера. receiptIndex — для вибору конкретного чека (за замовчуванням 0) */
  handleViewReceipt: (type?: ReceiptType, receiptIndex?: number) => Promise<void>;
  /** Автодрук — викликати при переході до статусу "всі зібрано" */
  handleAutoPrintIfEnabled: () => Promise<void>;
}

// ────────────────────────────────────────────────────────────────
// Хук
// ────────────────────────────────────────────────────────────────

export function useReceiptPrinting({
  order,
  checklistItems,
  apiCall,
}: UseReceiptPrintingOptions): UseReceiptPrintingResult {
  const [equipmentState] = useEquipmentFromAuth();
  const [isPrinting, setIsPrinting] = useState(false);

  const receiptConfig = equipmentState.config?.receiptPrinter;

  // Ініціалізуємо ReceiptClientService з поточним apiCall
  receiptClientService.setApiCall(apiCall);

  /** Визначає тип чека: з параметра або з конфігурації */
  const resolveReceiptType = (type?: ReceiptType): ReceiptType => {
    if (type) return type;
    const configured = receiptConfig?.defaultReceiptType;
    // 'both' не підходить для одного виклику — вибираємо fiscal як пріоритетний
    if (configured === 'warehouse') return 'warehouse';
    return 'fiscal';
  };

  /** Параметри для виклику фіскального чека */
  const getFiscalParams = (receiptIndex = 0) => ({
    orderId: order?.id,
    orderNumber: order?.orderNumber || order?.externalId || '',
    orderSajt: order?.sajt,
    externalId: order?.externalId || '',
    receiptIndex,
  });

  /** Параметри складського чек-листа */
  const getWarehouseParams = () => ({
    items: checklistItems,
    orderInfo: {
      orderNumber: order?.orderNumber || order?.externalId || '',
      ttn: order?.ttn,
      customerName: order?.customerName,
    },
  });

  // ──────────────────────────────────────────────────
  // ПЕРЕГЛЯД
  // ──────────────────────────────────────────────────

  const handleViewReceipt = useCallback(
    async (type?: ReceiptType, receiptIndex = 0) => {
      const receiptType = resolveReceiptType(type);

      if (receiptType === 'warehouse') {
        const { items, orderInfo } = getWarehouseParams();
        receiptClientService.viewWarehouseChecklist(items, orderInfo);
      } else {
        await receiptClientService.viewFiscalReceipt(getFiscalParams(receiptIndex));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, checklistItems, receiptConfig],
  );

  // ──────────────────────────────────────────────────
  // ДРУК
  // ──────────────────────────────────────────────────

  const handlePrintReceipt = useCallback(
    async (type?: ReceiptType, receiptIndex = 0) => {
      if (!receiptConfig?.enabled || !receiptConfig?.name) {
        // Якщо принтер не налаштований — просто відкриваємо у браузері
        await handleViewReceipt(type, receiptIndex);
        return;
      }

      const receiptType = resolveReceiptType(type);
      setIsPrinting(true);

      try {
        if (receiptType === 'warehouse') {
          const { items, orderInfo } = getWarehouseParams();
          await receiptClientService.printWarehouseChecklist({
            items,
            orderInfo,
            printerName: receiptConfig.name,
          });
        } else {
          await receiptClientService.printFiscalReceipt({
            ...getFiscalParams(receiptIndex),
            printerName: receiptConfig.name,
          });
        }
      } finally {
        setIsPrinting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, checklistItems, receiptConfig, handleViewReceipt],
  );

  // ──────────────────────────────────────────────────
  // АВТОДРУК
  // ──────────────────────────────────────────────────

  const handleAutoPrintIfEnabled = useCallback(async () => {
    if (!receiptConfig?.autoPrintOnComplete || !receiptConfig?.enabled) return;
    const delay = receiptConfig.autoPrintDelayMs ?? 1000;

    setTimeout(() => {
      const type = receiptConfig.defaultReceiptType === 'warehouse' ? 'warehouse' : 'fiscal';
      handlePrintReceipt(type as ReceiptType);
    }, delay);
  }, [receiptConfig, handlePrintReceipt]);

  return {
    isPrinting,
    receiptConfig,
    handlePrintReceipt,
    handleViewReceipt,
    handleAutoPrintIfEnabled,
  };
}
