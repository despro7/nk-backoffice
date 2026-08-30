import { prisma } from '../../lib/utils.js';
import { isUsableDilovodBatchId } from '../../../shared/utils/dilovodBatchId.js';
import { WarehousePayloadBuilder, type PayloadMovementProduct } from './WarehousePayloadBuilder.js';
import type { WarehouseMovementSettings } from '../../../shared/types/movement.js';

type MovementRow = {
  id: number;
  internalDocNumber: string;
  dilovodDocId: string | null;
  docNumber: string | null;
  notes: string | null;
  sourceWarehouse: string;
  destinationWarehouse: string;
  movementDate: Date | null;
};

export interface ExportWarehouseMovementParams {
  draft: MovementRow;
  summaryItems: PayloadMovementProduct[];
  userId: number;
  movementDate?: Date | string | null;
  overrides?: Partial<Pick<WarehouseMovementSettings, 'firmId' | 'storageFrom' | 'storageTo' | 'docMode'>>;
  dryRun?: boolean;
  isFinal?: boolean;
  sourceWarehouse?: string;
  destinationWarehouse?: string;
  extraUpdate?: Record<string, unknown>;
}

export type ExportWarehouseMovementResult =
  | {
    kind: 'dryRun';
    payload: Awaited<ReturnType<typeof WarehousePayloadBuilder.buildPayload>>;
    validation: ReturnType<typeof WarehousePayloadBuilder.validatePayload>;
  }
  | { kind: 'error'; httpStatus: number; body: Record<string, unknown> }
  | {
    kind: 'success';
    status: string;
    lastSentToDilovodAt: string;
    payload: Awaited<ReturnType<typeof WarehousePayloadBuilder.buildPayload>>;
    validation: ReturnType<typeof WarehousePayloadBuilder.validatePayload>;
    dilovodDocId: string | undefined;
    docNumber: string | undefined;
    dilovodResponse: unknown;
    isFinal: boolean;
  };

function validateBatchIds(summaryItems: PayloadMovementProduct[]): string[] {
  const missingBatchIds: string[] = [];
  for (const item of summaryItems) {
    for (const batch of item.details.batches) {
      const qty = item.isSet
        ? batch.portions
        : batch.boxes * item.portionsPerBox + batch.portions;
      if (qty <= 0) continue;
      if (!isUsableDilovodBatchId(batch.batchId)) {
        missingBatchIds.push(
          `"${item.name}" (SKU: ${item.sku}, партія: ${batch.batchNumber}) — відсутній ID партії в Діловоді`,
        );
      }
    }
  }
  return missingBatchIds;
}

export async function exportWarehouseMovementToDilovod(
  params: ExportWarehouseMovementParams,
): Promise<ExportWarehouseMovementResult> {
  const {
    draft,
    summaryItems,
    userId,
    movementDate,
    overrides,
    dryRun = true,
    isFinal = false,
    extraUpdate,
  } = params;

  const effectiveSourceWarehouse = params.sourceWarehouse ?? draft.sourceWarehouse;
  const effectiveDestinationWarehouse = params.destinationWarehouse ?? draft.destinationWarehouse;

  const idValidation = WarehousePayloadBuilder.validateDilovodIds(summaryItems);
  if (!idValidation.valid) {
    console.error('🚨 [Warehouse] 422: немає ID Діловода', idValidation.errors);
    return {
      kind: 'error',
      httpStatus: 422,
      body: {
        success: false,
        error: 'Деякі товари не мають ID Діловода',
        details: idValidation.errors,
      },
    };
  }

  const missingBatchIds = validateBatchIds(summaryItems);
  if (missingBatchIds.length > 0) {
    console.error('🚨 [Warehouse] 422: немає goodPart', missingBatchIds);
    return {
      kind: 'error',
      httpStatus: 422,
      body: {
        success: false,
        error: 'Деякі партії не мають ID в Діловоді (goodPart)',
        details: missingBatchIds,
      },
    };
  }

  const settings = await WarehousePayloadBuilder.loadSettings();
  const authorDilovodId = await WarehousePayloadBuilder.getAuthorDilovodId(userId);
  const docDate = movementDate
    ? new Date(movementDate)
    : (draft.movementDate ?? new Date());

  const payload = await WarehousePayloadBuilder.buildPayload({
    draft: {
      id: draft.id,
      internalDocNumber: draft.internalDocNumber,
      dilovodDocId: draft.dilovodDocId,
      docNumber: draft.docNumber,
      notes: draft.notes,
      sourceWarehouse: effectiveSourceWarehouse,
      destinationWarehouse: effectiveDestinationWarehouse,
    },
    summaryItems,
    settings,
    movementDate: docDate,
    authorDilovodId,
    overrides,
  });

  const validation = WarehousePayloadBuilder.validatePayload(payload);
  if (!validation.valid) {
    console.error('🚨 [Warehouse] 422: payload', validation.errors, validation.warnings);
    return {
      kind: 'error',
      httpStatus: 422,
      body: {
        success: false,
        error: 'Помилка валідації payload',
        details: validation.errors,
        warnings: validation.warnings,
      },
    };
  }

  const { dilovodExportFlowService, dilovodService } = await import('../../services/dilovod/index.js');
  const exportResult = await dilovodExportFlowService.send({
    payload: {
      ...(payload.saveType !== undefined && { saveType: payload.saveType }),
      header: payload.header,
      tableParts: payload.tableParts,
    },
    dryRun,
    warnings: validation.warnings,
    label: '[Warehouse]',
  });

  if (exportResult.dryRun) {
    return { kind: 'dryRun', payload, validation };
  }

  if (!exportResult.success) {
    const rawErrMsg = exportResult.error ?? 'Невідома помилка від Діловода';
    const {
      cleanDilovodErrorMessageShort,
      cleanDilovodErrorMessageFull,
      translateDilovodError,
    } = await import('../../services/dilovod/DilovodUtils.js');
    const translated = exportResult.translatedError ?? translateDilovodError(rawErrMsg);
    const detailedMessage = cleanDilovodErrorMessageShort(rawErrMsg) || translated.message;

    console.error('🚨 [Warehouse] Діловод повернув помилку:', rawErrMsg);

    try {
      await dilovodService.logMetaDilovodExport({
        title: translated.title,
        status: 'error',
        message: `[Мануал] Помилка відправки переміщення #${draft.internalDocNumber ?? draft.id}: ${detailedMessage}`,
        initiatedBy: String(userId),
        data: {
          draftId: draft.id,
          internalDocNumber: draft.internalDocNumber,
          dilovodDocId: draft.dilovodDocId,
          isFinal,
          error: cleanDilovodErrorMessageFull(rawErrMsg),
          dilovodResponse: exportResult.dilovodResponse,
        },
      });
    } catch (logErr) {
      console.error('🚨 [Warehouse] Помилка запису в meta_logs:', logErr);
    }

    return {
      kind: 'error',
      httpStatus: 422,
      body: {
        success: false,
        errorTitle: translated.title,
        error: detailedMessage,
        errorFallback: translated.message,
        dilovodResponse: exportResult.dilovodResponse,
      },
    };
  }

  const dilovodResult = exportResult.dilovodResponse;
  console.log('📬 [Warehouse] Відповідь Діловода:', JSON.stringify(dilovodResult, null, 2));

  const dilovodDocId: string | undefined =
    exportResult.dilovodDocId
    ?? dilovodResult?.id
    ?? dilovodResult?.header?.id
    ?? dilovodResult?.header?.id?.id
    ?? undefined;

  let docNumber: string | undefined =
    dilovodResult?.number
    ?? dilovodResult?.header?.number
    ?? payload.header.number
    ?? undefined;

  const isFirstSend = !draft.dilovodDocId && !!dilovodDocId;
  if (isFirstSend && !docNumber) {
    try {
      const docDetails = await dilovodService.getMovementDocument(dilovodDocId!);
      const fetchedNumber = docDetails?.header?.number ?? docDetails?.number;
      if (fetchedNumber) {
        docNumber = String(fetchedNumber);
        console.log(`📋 [Warehouse] Отримано номер документа з Діловода: ${docNumber}`);
      }
    } catch (err) {
      console.warn('⚠️ [Warehouse] Не вдалось отримати номер документа з Діловода:', err);
    }
  }

  const newStatus = 'finalized';
  const now = new Date();

  await prisma.warehouseMovement.update({
    where: { id: draft.id },
    data: {
      status: newStatus,
      lastSentToDilovodAt: now,
      ...(isFirstSend && { sentToDilovodAt: now }),
      ...(dilovodDocId != null && { dilovodDocId }),
      ...(docNumber != null && { docNumber }),
      ...(extraUpdate ?? {}),
    },
  });

  console.log(
    `✅ [Warehouse] Документ ${draft.id} відправлено до Діловода. ID: ${dilovodDocId}, Номер: ${docNumber}, Статус: ${newStatus}`,
  );

  void (async () => {
    try {
      const { syncSettingsService } = await import('../../services/syncSettingsService.js');
      const isEnabled = await syncSettingsService.isSyncEnabled('stocks');
      if (!isEnabled) {
        console.log('⏭️ [Warehouse] Stock sync після відправки пропущено — синхронізація залишків вимкнена');
        return;
      }
      console.log(`🔄 [Warehouse] Запускаємо оновлення залишків після відправки документа ${draft.id}...`);
      const { DilovodService: DilovodServiceCls } = await import('../../services/dilovod/DilovodService.js');
      const stockService = new DilovodServiceCls();
      const result = await stockService.updateStockBalancesInDatabase();
      console.log(`✅ [Warehouse] Залишки оновлено після відправки документа ${draft.id}:`, result?.message ?? 'OK');
    } catch (err) {
      console.warn(`⚠️ [Warehouse] Не вдалось оновити залишки після відправки документа ${draft.id}:`, err);
    }
  })();

  return {
    kind: 'success',
    status: newStatus,
    lastSentToDilovodAt: now.toISOString(),
    payload,
    validation,
    dilovodDocId,
    docNumber,
    dilovodResponse: dilovodResult,
    isFinal,
  };
}
