import { dilovodService } from './DilovodService.js';
import {
  getDilovodExportErrorMessage,
  isDilovodExportError,
  translateDilovodError,
} from './DilovodUtils.js';
import { dilovodRefId, parseContractPersonMismatch } from './dilovodContractPerson.js';

export interface DilovodExportFlowOptions<TPayload = any> {
  payload: TPayload;
  dryRun?: boolean;
  warnings?: string[];
  initiatedBy?: string;
  label?: string;
}

export interface DilovodExportFlowResult<TPayload = any> {
  success: boolean;
  dryRun: boolean;
  payload: TPayload;
  warnings: string[];
  dilovodResponse?: any;
  dilovodDocId?: string | null;
  error?: string;
  translatedError?: ReturnType<typeof translateDilovodError>;
}

export interface DilovodSaleSendOptions<TPayload = any> extends DilovodExportFlowOptions<TPayload> {
  /** documents.saleOrder (договір) замовлення */
  saleOrderId: string;
  orderNumber: string;
}

export interface DilovodSalePersonFix {
  fromPersonId: string;
  toPersonId: string;
  updatedDocs: Array<{ id: string; type: string; presentation: string }>;
  error?: string;
}

export interface DilovodSaleSendResult<TPayload = any> extends DilovodExportFlowResult<TPayload> {
  personFix?: DilovodSalePersonFix;
}

export class DilovodExportFlowService {
  private normalizeWarnings(warnings?: string[]): string[] {
    return Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  }

  async preview<TPayload = any>(options: DilovodExportFlowOptions<TPayload>): Promise<DilovodExportFlowResult<TPayload>> {
    return {
      success: true,
      dryRun: true,
      payload: options.payload,
      warnings: this.normalizeWarnings(options.warnings),
    };
  }

  async send<TPayload = any>(options: DilovodExportFlowOptions<TPayload>): Promise<DilovodExportFlowResult<TPayload>> {
    const warnings = this.normalizeWarnings(options.warnings);

    if (options.dryRun) {
      return this.preview({ ...options, warnings });
    }

    try {
      const dilovodResponse = await dilovodService.exportToDilovod(options.payload);

      if (isDilovodExportError(dilovodResponse)) {
        const rawError = String(dilovodResponse?.error || dilovodResponse?.message || getDilovodExportErrorMessage(dilovodResponse));
        return {
          success: false,
          dryRun: false,
          payload: options.payload,
          warnings,
          dilovodResponse,
          error: rawError,
          translatedError: translateDilovodError(rawError),
        };
      }

      return {
        success: true,
        dryRun: false,
        payload: options.payload,
        warnings,
        dilovodResponse,
        dilovodDocId: dilovodResponse?.id != null ? String(dilovodResponse.id) : null,
      };
    } catch (error) {
      const rawError = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        dryRun: false,
        payload: options.payload,
        warnings,
        error: rawError,
        translatedError: translateDilovodError(rawError),
      };
    }
  }

  /**
   * Відправка documents.sale з виправленням контрагента договору.
   * Якщо Dilovod відхиляє sale, бо договір (saleOrder) зареєстровано на іншого контрагента
   * (типово: менеджер виправив телефон клієнта в SalesDrive після створення замовлення),
   * перепривʼязуємо saleOrder і його документи на контрагента з актуального телефону та повторюємо один раз.
   */
  async sendSale<TPayload = any>(options: DilovodSaleSendOptions<TPayload>): Promise<DilovodSaleSendResult<TPayload>> {
    const first = await this.send(options);
    if (first.success || first.dryRun) return first;

    const mismatch = parseContractPersonMismatch(first.error ?? first.dilovodResponse);
    const toPersonId = dilovodRefId((options.payload as any)?.header?.person);
    if (!mismatch || mismatch.contractId !== options.saleOrderId || !toPersonId || toPersonId === mismatch.personId) {
      return first;
    }

    const fix: DilovodSalePersonFix = { fromPersonId: mismatch.personId, toPersonId, updatedDocs: [] };
    console.log(
      `🔁 ${options.label ?? '[Dilovod/sale]'} ${options.orderNumber}: договір зареєстровано на ${mismatch.personId}, контрагент за телефоном ${toPersonId}. Виправляємо контрагента в замовленні`
    );

    try {
      fix.updatedDocs = await dilovodService.reassignOrderDocumentsPerson(options.saleOrderId, mismatch.personId, toPersonId);
    } catch (error) {
      fix.error = error instanceof Error ? error.message : String(error);
    }

    await dilovodService.logMetaDilovodExport({
      title: 'Contract person fixed (saleOrder)',
      status: fix.error ? 'error' : 'success',
      message: fix.error
        ? `Не вдалося змінити контрагента в замовленні ${options.orderNumber} (${mismatch.personId} → ${toPersonId}): ${fix.error}`
        : `Контрагента в замовленні ${options.orderNumber} змінено: ${mismatch.personId} → ${toPersonId} (документів: ${fix.updatedDocs.length})`,
      initiatedBy: options.initiatedBy,
      data: { orderNumber: options.orderNumber, saleOrderId: options.saleOrderId, ...fix },
    });

    if (fix.error) return { ...first, personFix: fix };

    const retry = await this.send(options);
    return { ...retry, personFix: fix };
  }
}

export const dilovodExportFlowService = new DilovodExportFlowService();
