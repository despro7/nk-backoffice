import { prisma } from '../../lib/utils.js';
import { getDilovodUserId } from '../../services/dilovod/DilovodUtils.js';
import type {
  WarehouseMovementSettings,
  DilovodMovementPayload,
  DilovodMovementGoodItem,
} from '../../../shared/types/movement.js';

// Статичні константи (не плануються до зміни)
const STATIC_ACC_GOOD = '1119000000001076'; // Рахунок обліку всіх товарів

// Мінімальний тип товару для побудови payload (сумісний з MovementProduct на клієнті)
export interface PayloadMovementProduct {
  id: string;
  sku: string;
  name: string;
  dilovodId: string | null;
  portionsPerBox: number;
  details: {
    batches: Array<{
      batchNumber: string;
      batchId: string | null;
      boxes: number;
      portions: number;
    }>;
  };
}

// ============================================================================
// WarehousePayloadBuilder — клас для формування та валідації payload переміщення
// ============================================================================

export class WarehousePayloadBuilder {

  // --------------------------------------------------------------------------
  // Завантажити налаштування з settings_base (category='warehouse_movement')
  // + fallback на налаштування Dilovod для firm/storage
  // --------------------------------------------------------------------------
  static async loadSettings(): Promise<WarehouseMovementSettings> {
    const rows = await prisma.settingsBase.findMany({
      where: { category: 'warehouse_movement', isActive: true },
    });

    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }

    // Якщо firmId/storageFrom/storageTo не задані — беремо з налаштувань Dilovod
    let firmId = map['wm_firmId'] || '';
    let storageFrom = map['wm_storageFrom'] || '';
    let storageTo = map['wm_storageTo'] || '';

    if (!firmId || !storageFrom || !storageTo) {
      const dilovodRows = await prisma.settingsBase.findMany({
        where: {
          key: { in: ['dilovod_default_firm_id', 'dilovod_main_storage_id', 'dilovod_small_storage_id'] },
          isActive: true,
        },
      });
      const dilovodMap: Record<string, string> = {};
      for (const row of dilovodRows) {
        dilovodMap[row.key] = row.value;
      }

      if (!firmId) firmId = dilovodMap['dilovod_default_firm_id'] || '';
      if (!storageFrom) storageFrom = dilovodMap['dilovod_main_storage_id'] || '';
      if (!storageTo) storageTo = dilovodMap['dilovod_small_storage_id'] || '';
    }

    return {
      numberGeneration: (map['wm_numberGeneration'] === 'server' ? 'server' : 'dilovod') as 'server' | 'dilovod',
      numberTemplate: map['wm_numberTemplate'] || 'WM-{YYYY}{MM}{DD}-{###}',
      firmId,
      businessId: map['wm_businessId'] || '',
      storageFrom,
      storageTo,
      docMode: map['wm_docMode'] || '1004000000000409',
      unitId: map['wm_unitId'] || '1103600000000001',
      accountId: map['wm_accountId'] || '1119000000001076',
    };
  }

  // --------------------------------------------------------------------------
  // Генерування номера документа за шаблоном
  // Шаблон: WM-{YYYY}{MM}{DD}-{###}
  // --------------------------------------------------------------------------
  static generateDocumentNumber(template: string, internalDocNumber: string): string {
    const now = new Date();
    const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

    return template
      .replace('{YYYY}', String(now.getFullYear()))
      .replace('{MM}', pad(now.getMonth() + 1))
      .replace('{DD}', pad(now.getDate()))
      .replace('{HH}', pad(now.getHours()))
      .replace('{mm}', pad(now.getMinutes()))
      .replace('{###}', internalDocNumber.padStart(3, '0'))
      .replace('{#####}', internalDocNumber.padStart(5, '0'));
  }

  // --------------------------------------------------------------------------
  // Валідація що всі товари мають dilovodId
  // --------------------------------------------------------------------------
  static validateDilovodIds(summaryItems: PayloadMovementProduct[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const item of summaryItems) {
      if (!item.dilovodId) {
        errors.push(`Товар "${item.name}" (SKU: ${item.sku}) не має ID в Діловоді`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // --------------------------------------------------------------------------
  // Валідація готового payload
  // --------------------------------------------------------------------------
  static validatePayload(payload: DilovodMovementPayload): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const h = payload.header;

    if (!h.firm) errors.push('Не вказано підприємство (firm)');
    if (!h.storage) errors.push('Не вказано склад-донор (storage)');
    if (!h.storageTo) errors.push('Не вказано склад-реципієнт (storageTo)');
    if (!h.docMode) errors.push('Не вказано режим документа (docMode)');
    if (!h.date) errors.push('Не вказано дату документа (date)');
    if (!h.author) warnings.push('Не вказано автора документа (author) — рекомендується вказати dilovodUserId для користувача');

    const goods = payload.tableParts.tpGoods;

    if (goods.length === 0) {
      errors.push('Список товарів порожній');
    }

    for (const good of goods) {
      if (!good.good) {
        errors.push(`Рядок ${good.rowNum}: відсутній ID товару (good)`);
      }
      if (!good.qty || good.qty <= 0) {
        errors.push(`Рядок ${good.rowNum}: некоректна кількість (qty: ${good.qty})`);
      }
      if (!good.goodPart) {
        errors.push(`Рядок ${good.rowNum}: відсутній ID партії (goodPart) — товар не має прив'язаної партії в Діловоді`);
      }
      if (!good.unit) {
        errors.push(`Рядок ${good.rowNum}: відсутній ID одиниці виміру (unit)`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // --------------------------------------------------------------------------
  // Основна побудова payload
  // --------------------------------------------------------------------------
  static async buildPayload(params: {
    draft: {
      id: number;
      internalDocNumber: string;
      dilovodDocId?: string | null;
      docNumber?: string | null;
      sourceWarehouse?: string;
      destinationWarehouse?: string;
      notes?: string | null;
    };
    summaryItems: PayloadMovementProduct[];
    settings: WarehouseMovementSettings;
    movementDate: Date;
    authorDilovodId: string;
    overrides?: Partial<Pick<WarehouseMovementSettings, 'firmId' | 'storageFrom' | 'storageTo' | 'docMode'>>;
  }): Promise<DilovodMovementPayload> {
    const { draft, summaryItems, settings, movementDate, authorDilovodId, overrides } = params;

    // Зливаємо override-значення поверх налаштувань
    const firmId = overrides?.firmId || settings.firmId;
    const storageFrom = overrides?.storageFrom || settings.storageFrom;
    const storageTo = overrides?.storageTo || settings.storageTo;
    const docMode = overrides?.docMode || settings.docMode;

    // Форматуємо дату у локальному часі (без UTC-конвертації)
    const pad = (n: number): string => String(n).padStart(2, '0');
    const formattedDate = `${movementDate.getFullYear()}-${pad(movementDate.getMonth() + 1)}-${pad(movementDate.getDate())} ${pad(movementDate.getHours())}:${pad(movementDate.getMinutes())}:${pad(movementDate.getSeconds())}`;

    // Визначаємо номер документа
    let docNumber: string | undefined;
    if (draft.dilovodDocId) {
      // Редагування — використовуємо оригінальний номер
      docNumber = draft.docNumber || undefined;
    } else if (settings.numberGeneration === 'server') {
      docNumber = this.generateDocumentNumber(settings.numberTemplate, draft.internalDocNumber);
    }
    // Якщо numberGeneration === 'dilovod' і новий документ — number не передаємо

    // Формуємо tpGoods з summaryItems
    const tpGoods: DilovodMovementGoodItem[] = [];
    let rowNum = 1;

    for (const item of summaryItems) {
      for (const batch of item.details.batches) {
        const qty = batch.boxes * item.portionsPerBox + batch.portions;
        if (qty <= 0) continue; // Пропускаємо нульові рядки
        if (!batch.batchId) continue; // Пропускаємо партії без ID в Діловоді (валідація підхопить помилку через validatePayload)

        tpGoods.push({
          rowNum,
          good: Number(item.dilovodId!), // Перевірено validateDilovodIds перед викликом; Діловод очікує число
          qty,
          unit: Number(settings.unitId),
          goodPart: Number(batch.batchId), // Діловод очікує число
          accGood: Number(STATIC_ACC_GOOD),
        });
        rowNum++;
      }
    }

    const header: DilovodMovementPayload['header'] = {
      id: draft.dilovodDocId || 'documents.goodMoving', // Для нових — тип документа; для редагування — ID в Діловоді
      ...(docNumber && { number: docNumber }), // Додаємо number лише якщо він визначений
      date: formattedDate,
      firm: firmId,
      storage: storageFrom,
      storageTo,
      docMode,
      ...(settings.businessId && { business: settings.businessId }), // Напрям бізнесу (необов'язково, але Діловод може вимагати)
      taxAccount: 1,
      remark: draft.notes || '',
      author: authorDilovodId,
    };

    return {
      saveType: 1,
      header,
      tableParts: { tpGoods },
    };
  }

  // --------------------------------------------------------------------------
  // Допоміжний метод: отримати dilovodUserId автора з БД
  // Використовує спільну функцію getDilovodUserId з DilovodUtils
  // --------------------------------------------------------------------------
  static async getAuthorDilovodId(userId: number): Promise<string> {
    return getDilovodUserId(userId, { logPrefix: '[Warehouse] ' });
  }
}
