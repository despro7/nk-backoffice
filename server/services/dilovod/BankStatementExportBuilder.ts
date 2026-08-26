/**
 * BankStatementExportBuilder — payload documents.cashOut / documents.cashIn
 * без прив'язки до замовлень. Послідовна відправка (Dilovod multithread).
 */

import { PrismaClient } from '@prisma/client';
import { dilovodExportFlowService, dilovodService } from './index.js';
import { getDilovodUserId } from './DilovodUtils.js';
import { logServer } from '../../lib/utils.js';
import type {
  BankStatementConfirmedRow,
  BankStatementExportResponse,
} from '../../../shared/types/bankStatement.js';
import {
  BANK_STATEMENT_DEFAULTS,
  defaultCashItem,
  defaultSettlementsKind,
} from '../../../shared/types/bankStatement.js';

const prisma = new PrismaClient();

/** Dilovod id довідника (каса / фірма), не IBAN. */
const DILOVOD_CATALOG_ID_RE = /^\d{10,}$/;

type DilovodCashAccount = {
  id?: string;
  name?: string;
  code?: string;
  owner?: string;
};

const BANK_STATEMENT_CONSTANTS = {
  CASH_OUT: 'documents.cashOut',
  CASH_IN: 'documents.cashIn',
  CURRENCY: '1101200000001001',
  CASH_ACCOUNT_FALLBACK: '1101100000001022',
  DEPARTMENT: '1101900000000001',
  BUSINESS: '1115000000000001',
  AUTHOR: '1000200000001014',
} as const;

export interface BankStatementPayloadItem {
  rowIndex: number;
  operationNumber: string;
  direction: BankStatementConfirmedRow['direction'];
  payload: Record<string, unknown>;
}

export interface BankStatementBuildResult {
  payloads: BankStatementPayloadItem[];
  cashAccount: string;
  firm: string;
  firmName?: string;
}

export class BankStatementExportBuilder {
  async buildPayloads(
    rows: BankStatementConfirmedRow[],
    userId?: number,
    fileCashAccount?: string,
  ): Promise<BankStatementBuildResult> {
    const { firm, cashAccount: defaultCashAccount, channelPaymentMapping } = await this.loadSettings();
    let firmName: string | undefined;

    try {
      const firms = await dilovodService.getFirms();
      firmName = firms?.find((f: { id: string; name?: string }) => f.id === firm)?.name;
    } catch {
      // назва фірми лише для UI
    }

    const cashAccount = await this.resolveCashAccount(
      firm,
      defaultCashAccount,
      channelPaymentMapping,
      fileCashAccount,
    );

    const authorId = await this.resolveAuthorId(userId);
    const payloads: BankStatementPayloadItem[] = [];
    for (const row of rows) {
      payloads.push(this.buildSinglePayload(row, firm, cashAccount, authorId));
    }

    return { payloads, cashAccount, firm, firmName };
  }

  async exportAll(
    rows: BankStatementConfirmedRow[],
    userId?: number,
    fileCashAccount?: string,
  ): Promise<BankStatementExportResponse> {
    logServer(`🚀 [BankStatement] Відправка ${rows.length} документів...`);

    const { payloads } = await this.buildPayloads(rows, userId, fileCashAccount);
    let exportedCount = 0;
    let cashOutCount = 0;
    let cashInCount = 0;
    const errors: BankStatementExportResponse['errors'] = [];

    for (const item of payloads) {
      try {
        logServer(`  📤 [BankStatement] Рядок ${item.rowIndex} №${item.operationNumber} (${item.direction})`);
        const exportResult = await dilovodExportFlowService.send({
          payload: item.payload,
          dryRun: false,
          label: '[BankStatement]',
        });

        if (!exportResult.success) {
          const errMsg = exportResult.error || exportResult.translatedError?.message || 'Невідома помилка від Dilovod';
          errors.push({ rowIndex: item.rowIndex, operationNumber: item.operationNumber, error: errMsg });
        } else {
          exportedCount++;
          if (item.direction === 'expense') cashOutCount++;
          else cashInCount++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ rowIndex: item.rowIndex, operationNumber: item.operationNumber, error: message });
      }
    }

    logServer(`📊 [BankStatement] Відправлено ${exportedCount}, помилок ${errors.length}`);

    return {
      success: errors.length === 0,
      exportedCount,
      cashOutCount,
      cashInCount,
      errors,
    };
  }

  private buildSinglePayload(
    row: BankStatementConfirmedRow,
    firm: string,
    cashAccount: string,
    authorId: string,
  ): BankStatementPayloadItem {
    const formattedDate = this.formatDateForDilovod(row.operationDate);
    const isExpense = row.direction === 'expense';
    const docType = isExpense ? BANK_STATEMENT_CONSTANTS.CASH_OUT : BANK_STATEMENT_CONSTANTS.CASH_IN;
    const purpose = row.purpose || row.correspondentName || `Операція ${row.operationNumber}`;
    const content = purpose;
    const presentation = `${purpose} від ${formattedDate.slice(0, 10)}`;
    const corAccount = row.corAccount || BANK_STATEMENT_DEFAULTS.corAccount;
    const settlementsKind = row.settlementsKind || defaultSettlementsKind(row.direction);
    const cashItem = row.cashItem || defaultCashItem(row.direction);

    const payload = {
      saveType: 1,
      header: {
        id: docType,
        date: formattedDate,
        firm,
        cashAccount,
        person: '',
        currency: BANK_STATEMENT_CONSTANTS.CURRENCY,
        content,
        presentation,
        cashItem,
        amountCur: row.amount,
        department: BANK_STATEMENT_CONSTANTS.DEPARTMENT,
        business: BANK_STATEMENT_CONSTANTS.BUSINESS,
        account: BANK_STATEMENT_DEFAULTS.account,
        corAccount,
        settlementsKind,
        taxAccount: 1,
        author: authorId,
        remark: `Автоматично додано через Backoffice (виписка №${row.operationNumber}) - ${new Date().toLocaleString('uk-UA')}`,
      },
      tableParts: {
        tpAnalytics: [
          {
            rowNum: 1,
            amountCur: row.amount,
          },
        ],
      },
    };

    return {
      rowIndex: row.rowIndex,
      operationNumber: row.operationNumber,
      direction: row.direction,
      payload,
    };
  }

  private async resolveAuthorId(userId: number | undefined): Promise<string> {
    return getDilovodUserId(userId, {
      fallback: BANK_STATEMENT_CONSTANTS.AUTHOR,
      logPrefix: '[BankStatement] ',
    });
  }

  private async loadSettings(): Promise<{ firm: string; cashAccount: string; channelPaymentMapping?: string }> {
    const settings = await prisma.settingsBase.findMany({
      where: { category: 'dilovod', isActive: true },
      select: { key: true, value: true },
    });

    const map = new Map(settings.map((s) => [s.key, s.value]));
    const firm = map.get('dilovod_default_firm_id') ?? '';
    const mappingJson = map.get('dilovod_channel_payment_mapping');

    if (!firm) {
      throw new Error('dilovod_default_firm_id не налаштовано в settings_base');
    }

    return {
      firm,
      cashAccount: BANK_STATEMENT_CONSTANTS.CASH_ACCOUNT_FALLBACK,
      channelPaymentMapping: mappingJson,
    };
  }

  private async resolveCashAccount(
    firm: string,
    defaultCashAccount: string,
    mappingJson: string | undefined,
    fileCashAccount?: string,
  ): Promise<string> {
    let catalog: DilovodCashAccount[] = [];
    try {
      catalog = (await dilovodService.getCashAccounts()) as DilovodCashAccount[];
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logServer(`⚠️ [BankStatement] Помилка довідників рахунків: ${message}`);
    }

    const pick = (id: string | undefined, reason: string): string | undefined => {
      const catalogId = this.toCatalogCashAccountId(id, catalog);
      if (!catalogId) return undefined;
      logServer(`🔍 [BankStatement] Каса: ${catalogId} (${reason})`);
      return catalogId;
    };

    if (fileCashAccount) {
      const fromFile = pick(
        this.findCashAccountIdByFileRef(catalog, fileCashAccount, firm),
        `IBAN/номер ${fileCashAccount} у довіднику`,
      );
      if (fromFile) return fromFile;

      const fromMapping = pick(
        this.findMappedCashAccountId(mappingJson, fileCashAccount, catalog, firm),
        `мапінг каналів для ${fileCashAccount}`,
      );
      if (fromMapping) return fromMapping;

      logServer(`🔍 [BankStatement] Немає каси для ${fileCashAccount}, шукаємо fallback`);
    }

    const fromDefault = pick(defaultCashAccount, 'дефолт');
    if (fromDefault) return fromDefault;

    const fromFirm = pick(
      catalog.find((acc) => acc.owner === firm && this.isCatalogId(String(acc.id ?? '')))?.id,
      `перша каса фірми ${firm}`,
    );
    if (fromFirm) return fromFirm;

    const fallback = pick(BANK_STATEMENT_CONSTANTS.CASH_ACCOUNT_FALLBACK, 'хардкод fallback');
    if (fallback) return fallback;

    throw new Error(
      'Не вдалося визначити касу Dilovod (банківський рахунок). Перевірте IBAN у шапці файлу та довідник catalogs.cashAccounts.',
    );
  }

  private isCatalogId(value: string): boolean {
    return DILOVOD_CATALOG_ID_RE.test(value.trim());
  }

  private toCatalogCashAccountId(id: string | undefined, catalog: DilovodCashAccount[]): string | undefined {
    if (!id || !this.isCatalogId(id)) return undefined;
    const trimmed = id.trim();
    if (catalog.length === 0) return trimmed;
    return catalog.some((acc) => String(acc.id ?? '').trim() === trimmed) ? trimmed : undefined;
  }

  private findCashAccountIdByFileRef(
    catalog: DilovodCashAccount[],
    fileRef: string,
    firm: string,
  ): string | undefined {
    const normalized = fileRef.replace(/\s+/g, '').toUpperCase();
    if (!normalized) return undefined;

    const matches = catalog.filter((acc) => {
      const id = String(acc.id ?? '').trim();
      const name = String(acc.name ?? '').replace(/\s+/g, '').toUpperCase();
      const code = String(acc.code ?? '').replace(/\s+/g, '').toUpperCase();
      return id === fileRef.trim() || name.includes(normalized) || code.includes(normalized);
    });

    const preferred = matches.find((acc) => acc.owner === firm) ?? matches[0];
    const id = preferred?.id ? String(preferred.id).trim() : undefined;
    return id && this.isCatalogId(id) ? id : undefined;
  }

  private findMappedCashAccountId(
    mappingJson: string | undefined,
    fileRef: string,
    catalog: DilovodCashAccount[],
    firm: string,
  ): string | undefined {
    if (!mappingJson || !fileRef) return undefined;
    const normalized = fileRef.replace(/\s+/g, '').toUpperCase();

    try {
      const channelMap: Record<string, { mappings?: Array<{ cashAccount?: string }> }> = JSON.parse(mappingJson);
      const candidateIds: string[] = [];
      for (const channelSettings of Object.values(channelMap)) {
        for (const mapping of channelSettings?.mappings ?? []) {
          const id = String(mapping?.cashAccount ?? '').trim();
          if (this.isCatalogId(id)) candidateIds.push(id);
        }
      }

      const byIban = candidateIds.find((id) => {
        const acc = catalog.find((item) => String(item.id ?? '').trim() === id);
        if (!acc) return false;
        const name = String(acc.name ?? '').replace(/\s+/g, '').toUpperCase();
        const code = String(acc.code ?? '').replace(/\s+/g, '').toUpperCase();
        return name.includes(normalized) || code.includes(normalized);
      });
      if (byIban) return byIban;

      const firmOwned = candidateIds.find((id) => {
        const acc = catalog.find((item) => String(item.id ?? '').trim() === id);
        return acc?.owner === firm;
      });
      return firmOwned;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logServer(`⚠️ [BankStatement] Помилка парсингу channelPaymentMapping: ${message}`);
      return undefined;
    }
  }

  private formatDateForDilovod(isoDate: string): string {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 00:00:01`;
  }
}

export const bankStatementExportBuilder = new BankStatementExportBuilder();
