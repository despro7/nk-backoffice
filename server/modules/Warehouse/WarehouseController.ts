import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { resolveAuthorNames } from '../../lib/utils.js';
import { authenticateToken } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { PERMISSIONS } from '../../../shared/constants/permissions.js';
import { roleService } from '../../services/RoleService.js';
import { WarehouseService } from './WarehouseService.js';
import { MovementHistoryService } from './MovementHistoryService.js';
import { WarehousePayloadBuilder } from './WarehousePayloadBuilder.js';
import { exportWarehouseMovementToDilovod } from './WarehouseMovementExport.js';
import {
  collectSkusFromOrders,
  computeShippedQuantityForSku,
  getReportProductDescriptors,
  recomputeSetPortions,
  sumQuantityForSku,
} from '../../services/orderShipmentMetricsService.js';
import { safeParseItems } from './historyNormalize.js';
import type { WarehouseProductByBarcodeResponse } from '../../../shared/types/warehouse.js';
import { productsCatalogService } from '../Products/ProductsCatalogService.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';

const router = Router();

requirePermission('warehouse', 'movement.edit', 'Редагувати чужі та відправлені переміщення');
requirePermission('warehouse', 'movement.delete', 'Видаляти переміщення (у Dilovod — delMark)');

async function canOverrideMovementEdit(role: string | undefined): Promise<boolean> {
  if (!role) return false;
  return roleService.hasPermission(role, PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_EDIT);
}

async function canOverrideMovementDelete(role: string | undefined): Promise<boolean> {
  if (!role) return false;
  return roleService.hasPermission(role, PERMISSIONS.ACTION_WAREHOUSE_MOVEMENT_DELETE);
}

// ============================================================================
// КЕШ ПАРТІЙ (in-memory)
// Зберігає результати запитів до Dilovod API для /batch-numbers/:sku
// ============================================================================

interface BatchCacheEntry {
  data: unknown[];
  timestamp: number;
  ttl: number; // мілісекунди
}

/** Кеш: ключ → { data, timestamp, ttl } */
const batchCache = new Map<string, BatchCacheEntry>();

/** TTL для "старих" дат (> 30 хвилин тому) — 12 годин */
const BATCH_CACHE_TTL_LONG  = 12 * 60 * 60 * 1000;
/** TTL для "свіжих" дат (≤ 30 хвилин тому) або без дати — 5 хвилин */
const BATCH_CACHE_TTL_SHORT = 5 * 60 * 1000;
/** Поріг "старої" дати */
const BATCH_CACHE_OLD_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Генерує ключ кешу: sku:firmId:YYYY-MM-DD_HH:mm (округлення до хвилини)
 * Якщо дата не передана — використовується токен "now"
 */
type BatchStorageMode = 'all' | 'exclude-small' | 'small-only';

function buildBatchCacheKey(sku: string, firmId: string | undefined, asOfDate: Date | undefined, storageMode: BatchStorageMode, storageId?: string): string {
  const firmPart = firmId ?? 'default';
  const storagePart = storageId ?? 'any';
  if (!asOfDate) {
    return `${sku}:${firmPart}:${storageMode}:${storagePart}:now`;
  }
  const pad = (n: number) => n.toString().padStart(2, '0');
  const datePart = `${asOfDate.getFullYear()}-${pad(asOfDate.getMonth() + 1)}-${pad(asOfDate.getDate())}_${pad(asOfDate.getHours())}:${pad(asOfDate.getMinutes())}`;
  return `${sku}:${firmPart}:${storageMode}:${storagePart}:${datePart}`;
}

/**
 * Визначає TTL залежно від того, наскільки дата у минулому
 */
function resolveBatchCacheTtl(asOfDate: Date | undefined): number {
  if (!asOfDate) return BATCH_CACHE_TTL_SHORT;
  const ageMs = Date.now() - asOfDate.getTime();
  return ageMs > BATCH_CACHE_OLD_THRESHOLD_MS ? BATCH_CACHE_TTL_LONG : BATCH_CACHE_TTL_SHORT;
}

/** Перевірка чи запис у кеші ще дійсний */
function isBatchCacheValid(entry: BatchCacheEntry): boolean {
  return Date.now() - entry.timestamp < entry.ttl;
}

// ============================================================================
// ПЕРЕМІЩЕННЯ ТОВАРІВ
// ============================================================================

// Отримати всі документи про переміщення
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, warehouse, page, limit, from, to } = req.query;

    const result = await WarehouseService.getMovements({
      status: status as string | undefined,
      warehouse: warehouse as string | undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      from: typeof from === 'string' && from.trim() ? from.trim() : undefined,
      to: typeof to === 'string' && to.trim() ? to.trim() : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching warehouse movements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /drafts - отримати чернетки користувача
router.get('/drafts', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] GET /drafts - запит чернеток...');
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;

    const rawDrafts = await prisma.warehouseMovement.findMany({
      where: {
        // Адмін бачить всі активні чернетки, інші — тільки свої
        ...(!isAdmin && { createdBy: userId }),
        status: { in: ['draft', 'active'] }, // 'finalized' — вже завершені, у чернетках не показуємо
      },
      orderBy: {
        draftCreatedAt: 'desc'
      }
    });

    // Резолвимо імена авторів через спільний хелпер resolveAuthorNames
    const drafts = await resolveAuthorNames(rawDrafts);

    console.log(`✅ [Warehouse] Знайдено ${drafts.length} чернеток для користувача ${userId}`);
    res.json({ drafts });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні чернеток:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// Отримати товари з залишками для переміщення між складами
router.get('/products-for-movement', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] GET /products-for-movement - запит товарів для переміщення...');
    // Парсимо asOfDate якщо передано в query
    let parsedDate: Date | undefined;
    if (req.query.asOfDate && typeof req.query.asOfDate === 'string') {
      parsedDate = new Date(req.query.asOfDate);
      if (isNaN(parsedDate.getTime())) parsedDate = undefined;
      else console.log(`📅 /products-for-movement requested for date: ${parsedDate.toLocaleString('uk-UA')}`);
    }

    const [result, settings] = await Promise.all([
      WarehouseService.getProductsForMovement(parsedDate),
      WarehousePayloadBuilder.loadSettings(),
    ]);
    res.json({
      ...result,
      warehouseConfig: {
        storageFrom: settings.storageFrom,
        storageTo: settings.storageTo,
      },
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні товарів для переміщення:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// Отримати доступні партії (batch numbers) по SKU
router.get('/batch-numbers/:sku', authenticateToken, async (req, res) => {
  try {
    const { sku } = req.params;
    const { firmId, asOfDate, force, includeSmallStorage, onlySmallStorage, storageId } = req.query;
    const forceRefresh = force === 'true';
    const shouldIncludeSmallStorage = includeSmallStorage === 'true';
    const shouldOnlySmallStorage = onlySmallStorage === 'true';
    // Якщо передано storageId — фільтруємо партії лише по цьому складу (склад-джерело переміщення)
    const targetStorageId = typeof storageId === 'string' && storageId.trim() ? storageId.trim() : undefined;

    if (!sku || sku.trim() === '') {
      return res.status(400).json({ error: 'SKU is required' });
    }

    // Парсимо дату якщо вона передана
    let parsedDate: Date | undefined;
    if (asOfDate && typeof asOfDate === 'string') {
      parsedDate = new Date(asOfDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Expected ISO string (e.g., 2026-04-09T14:30:00Z)' });
      }
      console.log(`📦 [Warehouse] Партії запитуються на дату: ${parsedDate.toLocaleString('uk-UA')}`);
    }

    // Імпортуємо DilovodService і getDilovodConfigFromDB для отримання партій
    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const { getDilovodConfigFromDB } = await import('../../services/dilovod/DilovodUtils.js');
    const dilovodService = new DilovodService();

    // Завантажуємо конфіг асинхронно (з кешем) — щоб мати актуальні defaultFirmId та smallStorageId
    const dilovodConfig = await getDilovodConfigFromDB();

    // Якщо firmId не передана в query, беремо з налаштувань Dilovod
    let finalFirmId = typeof firmId === 'string' ? firmId : undefined;
    if (!finalFirmId) {
      finalFirmId = dilovodConfig.defaultFirmId;
      if (finalFirmId) {
        console.log(`📦 [Warehouse] Використовуємо фірму з налаштувань: ${finalFirmId}`);
      }
    }

    // --- Кеш ---
    const storageMode: BatchStorageMode = shouldOnlySmallStorage
      ? 'small-only'
      : shouldIncludeSmallStorage
        ? 'all'
        : 'exclude-small';
    const cacheKey = buildBatchCacheKey(sku, finalFirmId, parsedDate, storageMode, targetStorageId);
    const ttl = resolveBatchCacheTtl(parsedDate);
    const ttlLabel = ttl === BATCH_CACHE_TTL_LONG ? '12 год' : '5 хв';

    if (!forceRefresh) {
      const cached = batchCache.get(cacheKey);
      if (cached && isBatchCacheValid(cached)) {
        const ageSeconds = Math.round((Date.now() - cached.timestamp) / 1000);
        const ageLabel = ageSeconds < 60 ? `${ageSeconds}с` : (ageSeconds < 3600 ? `${Math.round(ageSeconds / 60)}хв` : `${Math.round(ageSeconds / 3600)}год`);
        const cachedTtlLabel = cached.ttl === BATCH_CACHE_TTL_LONG ? '12 год' : '5 хв';
        console.log(`✅ [Warehouse] Партії для SKU ${sku} отримані з кешу (вік: ${ageLabel}, TTL запису: ${cachedTtlLabel}). Дата переміщення ${parsedDate ? `${parsedDate.toLocaleString('uk-UA')}` : 'не вказана'}.`);
        return res.json({
          success: true,
          sku,
          batches: cached.data,
          count: (cached.data as unknown[]).length,
          asOfDate: parsedDate ? parsedDate.toISOString() : null,
          fromCache: true,
        });
      }
    } else {
      console.log(`🔄 [Warehouse] Примусове оновлення кешу для SKU ${sku} (force=true)`);
      batchCache.delete(cacheKey);
    }

    console.log(`📦 [Warehouse] GET /batch-numbers/:sku - запит партій для SKU: ${sku}${parsedDate ? ` на дату ${parsedDate.toLocaleString('uk-UA')}` : ''}`);

    const batches = await dilovodService.getBatchNumbersBySku(sku, finalFirmId, parsedDate);

    const filteredBatches = targetStorageId
      ? batches.filter(b => b.storage === targetStorageId)
      : shouldOnlySmallStorage
        ? batches.filter(b => b.storage === dilovodConfig.smallStorageId)
        : shouldIncludeSmallStorage
          ? batches
          : batches.filter(b => b.storage !== dilovodConfig.smallStorageId);

    const filterLabel = targetStorageId
      ? `лише склад ${targetStorageId}`
      : shouldOnlySmallStorage
        ? 'лише малий склад'
        : shouldIncludeSmallStorage
          ? 'усі склади'
          : 'без малого складу';

    console.log(`✅ [Warehouse] Отримано ${batches.length} партій для SKU: ${sku}, після фільтрації (${filterLabel}): ${filteredBatches.length}. Кешуємо на ${ttlLabel}`);

    // Зберігаємо в кеш
    batchCache.set(cacheKey, { data: filteredBatches, timestamp: Date.now(), ttl });

    res.json({
      success: true,
      sku,
      batches: filteredBatches,
      count: filteredBatches.length,
      asOfDate: parsedDate ? parsedDate.toISOString() : null,
      fromCache: false,
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні партій:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера'
    });
  }
});


// Отримати зведені залишки для списку SKU на конкретну дату (один запит до Dilovod)
// GET /api/warehouse/stock-snapshot?skus=sku1,sku2,...&asOfDate=2026-04-14T09:00:00Z
router.get('/stock-snapshot', authenticateToken, async (req, res) => {
  try {
    const { skus: skusRaw, asOfDate: asOfDateRaw, firmId: firmIdRaw, storageId: storageIdRaw } = req.query;

    if (!skusRaw || typeof skusRaw !== 'string') {
      return res.status(400).json({ error: 'Parameter "skus" is required (comma-separated list)' });
    }

    const skus = skusRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (skus.length === 0) {
      return res.status(400).json({ error: 'Parameter "skus" must contain at least one SKU' });
    }

    let parsedDate: Date | undefined;
    if (asOfDateRaw && typeof asOfDateRaw === 'string') {
      parsedDate = new Date(asOfDateRaw);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid "asOfDate" format. Expected ISO string.' });
      }
    }

    const firmId = typeof firmIdRaw === 'string' ? firmIdRaw : undefined;
    const storageId = typeof storageIdRaw === 'string' && storageIdRaw.trim() ? storageIdRaw.trim() : undefined;

    const { dilovodService } = await import('../../services/dilovod/DilovodService.js');

    const label = parsedDate ? parsedDate.toLocaleString('uk-UA') : 'поточна';
    console.log(`📊 [Warehouse] GET /stock-snapshot — ${skus.length} SKU на дату: ${label}${firmId ? ` (firmId=${firmId})` : ''}`);

    const balances = await dilovodService.getStockBalanceForSkus(skus, parsedDate, firmId);

    const result: Record<string, { mainStock: number; smallStock: number; selectedStock?: number; storages?: Record<string, number> }> = {};
    for (const item of balances) {
      const selectedStock = storageId
        ? dilovodService.getSelectedStockByStorageId(item, storageId)
        : undefined;

      result[item.sku] = {
        mainStock: item.mainStorage,
        smallStock: item.smallStorage,
        ...(selectedStock !== undefined ? { selectedStock } : {}),
        // Per-storage залишки — дозволяють клієнту обчислити source/dest без додаткових запитів
        ...(item.storages ? { storages: item.storages } : {}),
      };
    }

    console.log(`✅ [Warehouse] stock-snapshot: повернено залишки для ${balances.length} SKU`);
    res.json({ success: true, asOfDate: parsedDate?.toISOString() ?? null, stocks: result });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні stock-snapshot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера',
    });
  }
});

// POST /api/warehouse/stock-snapshot
// Body: { skus: string[] | string, asOfDate?: string, firmId?: string }
router.post('/stock-snapshot', authenticateToken, async (req, res) => {
  try {
    const { skus: skusBody, asOfDate, firmId, storageId } = req.body as any;
    let skus: string[] = [];

    if (Array.isArray(skusBody)) {
      skus = skusBody.map((s: any) => String(s).trim()).filter(Boolean);
    } else if (typeof skusBody === 'string') {
      skus = skusBody.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (skus.length === 0) {
      return res.status(400).json({ error: 'Parameter "skus" is required in body and must contain at least one SKU' });
    }

    let parsedDate: Date | undefined;
    if (asOfDate && typeof asOfDate === 'string') {
      parsedDate = new Date(asOfDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid "asOfDate" format. Expected ISO string.' });
      }
    }

    const storageIdClean = typeof storageId === 'string' && storageId.trim() ? storageId.trim() : undefined;
    const { dilovodService } = await import('../../services/dilovod/DilovodService.js');

    console.log(`📊 [Warehouse] POST /stock-snapshot — ${skus.length} SKU${firmId ? ` (firmId=${firmId})` : ''}${storageIdClean ? ` (storageId=${storageIdClean})` : ''}`);

    const balances = await dilovodService.getStockBalanceForSkus(skus, parsedDate, firmId);

    const result: Record<string, { mainStock: number; smallStock: number; selectedStock?: number }> = {};
    for (const item of balances) {
      const selectedStock = storageIdClean
        ? dilovodService.getSelectedStockByStorageId(item, storageIdClean)
        : undefined;

      result[item.sku] = {
        mainStock: item.mainStorage,
        smallStock: item.smallStorage,
        ...(selectedStock !== undefined ? { selectedStock } : {}),
      };
    }

    res.json({ success: true, asOfDate: parsedDate?.toISOString() ?? null, stocks: result });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при POST stock-snapshot:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Внутрішня помилка сервера' });
  }
});

/**
 * GET /api/warehouse/product-by-barcode?code=…
 *
 * Lookup товару за ШК для мобільного скану.
 * Залишки — GET /stock-snapshot (`storages[storageId]`) або POST з `storageId` → `selectedStock`.
 *
 * ШК коробки ще немає в БД; barcodeKind завжди 'portion'. Коли з’явиться box-код —
 * перевіряти його першим; конфлікт того самого коду на обох рівнях → 'box'.
 */
router.get('/product-by-barcode', authenticateToken, async (req, res) => {
  try {
    const codeRaw = req.query.code;
    if (typeof codeRaw !== 'string' || !codeRaw.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Параметр "code" обовʼязковий',
      });
    }

    const code = codeRaw.trim();
    console.log(`🔍 [Warehouse] GET /product-by-barcode — code=${code}`);

    const product: WarehouseProductByBarcodeResponse | null =
      await WarehouseService.findProductByBarcode(code);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Товар зі штрих-кодом «${code}» не знайдено`,
      });
    }

    console.log(
      `✅ [Warehouse] product-by-barcode: sku=${product.sku} kind=${product.barcodeKind}` +
        (product.batchId ? ` batch=${product.batchNumber ?? product.batchId}` : ''),
    );
    res.json({ success: true, ...product });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при GET /product-by-barcode:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера',
    });
  }
});

// Отримати історію переміщень з Діловода
router.get('/history', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] GET /history - запит історії переміщень...');
    const { storageId, storageToId, fromDate, toDate, remark } = req.query;

    const params = {
      storageId: typeof storageId === 'string' ? storageId : undefined,
      storageToId: typeof storageToId === 'string' ? storageToId : undefined,
      fromDate: typeof fromDate === 'string' ? fromDate : undefined,
      toDate: typeof toDate === 'string' ? toDate : undefined,
      remark: typeof remark === 'string' ? remark : undefined
    };

    const history = await MovementHistoryService.getMovementHistory(params);
    console.log(`✅ [Warehouse] Отримано ${history.documents.length} документів переміщень`);
    
    res.json(history);
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні історії переміщень:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера' 
    });
  }
});

// ---------------------------------------------------------------------------
// Перевіряє чи items не містять "старого багу" — коли sku = назва товару.
// Порожній sku допустимий (товар не синхронізований в products).
// ---------------------------------------------------------------------------
function hasValidSkus(items: Array<{ sku: string; productName: string }>): boolean {
  return items.every((item) => item.sku !== item.productName);
}

// GET /api/warehouse/movements/:id - отримати деталі переміщення за ID
// ?force=true — примусово оновити з Dilovod (ігнорувати кешовані items в БД)
router.get('/details/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    if (!id) {
      return res.status(400).json({ error: 'Movement ID is required' });
    }

    // Якщо не force — перевіряємо чи вже є збережені деталі в БД
    if (!force) {
      const cached = await prisma.warehouseMovement.findUnique({
        where: { dilovodDocId: id },
        select: { items: true },
      });

      if (cached && cached.items && cached.items !== '[]') {
        try {
          const parsedItems = JSON.parse(cached.items);
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            // Перевіряємо коректність sku — старі записи мали sku = назва товару (старий баг)
            if (hasValidSkus(parsedItems)) {
              console.log(`� [Warehouse] GET /details/${id} — повертаємо кешовані деталі з БД (${parsedItems.length} товарів)`);

              // Формуємо відповідь у форматі, очікуваному клієнтом
              const tpGoods = Object.fromEntries(
                parsedItems.map((item: any, idx: number) => [String(idx), {
                  id: String(idx),
                  good__pr: item.productName,
                  sku: item.sku,
                  goodPart__pr: item.batchNumber,
                  goodPart: item.batchId,
                  // unit — одиниця виміру з Діловода; batchStorage у кеші завжди '' (склад невідомий без нового запиту)
                  unit: '',
                  qty: String(item.portionQuantity),
                  amountCost: '0',
                }])
              );
              return res.json({
                header: {},
                tableParts: { tpGoods },
                misc: {},
                fromCache: true,
              });
            }

            // SKU некоректні — скидаємо кеш і йдемо в Dilovod для перезбереження
            console.log(`🔧 [Warehouse] GET /details/${id} — кешовані items мають некоректний sku, оновлюємо з Dilovod`);
          }
        } catch {
          // Некоректний JSON — йдемо в Dilovod
        }
      }
    }

    console.log(`🏪 [Warehouse] GET /details/${id} — завантажуємо з Dilovod${force ? ' (force)' : ''}...`);
    // getMovementDetails також викликає persistDetailsToDB, яка зберігає items з коректним sku
    const details = await MovementHistoryService.getMovementDetails(id);
    console.log(`✅ [Warehouse] Отримані деталі переміщення ID: ${id}`);

    // Підставляємо sku в tpGoods зі щойно збережених items.
    // Маппінг йде по dilovodId (row.good), а не по batchId — batchId може бути порожнім.
    if (details.tableParts?.tpGoods) {
      const saved = await prisma.warehouseMovement.findUnique({
        where: { dilovodDocId: id },
        select: { items: true },
      });

      if (saved?.items && saved.items !== '[]') {
        try {
          const savedItems: Array<{ sku: string; dilovodId: string }> = JSON.parse(saved.items);

          // Map: dilovodId → sku (надійний ключ, завжди присутній у tpGoods як row.good)
          const dilovodIdToSku = new Map<string, string>(
            savedItems.map((item) => [item.dilovodId, item.sku]),
          );

          for (const row of Object.values(details.tableParts.tpGoods) as any[]) {
            const sku = dilovodIdToSku.get(row.good);
            if (sku) row.sku = sku;
          }
        } catch {
          // Не критично — sku залишиться порожнім
        }
      }
    }

    res.json(details);
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні деталей переміщення:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера' 
    });
  }
});

// PATCH /:id/finalize-local — завершити переміщення локально без відправки в Діловод
router.patch('/:id/finalize-local', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;

    // Перевіряємо що документ існує, ще не завершений
    // Адмін може завершувати будь-який документ
    const existing = await prisma.warehouseMovement.findFirst({
      where: {
        id: Number(id),
        ...(!isAdmin && { createdBy: userId }),
        status: { in: ['draft', 'active'] },
      },
      select: { id: true, status: true },
    });

    if (!existing) {
      const anyDoc = await prisma.warehouseMovement.findFirst({
        where: {
          id: Number(id),
          ...(!isAdmin && { createdBy: userId }),
        },
        select: { status: true },
      });
      if (anyDoc?.status === 'finalized') {
        return res.status(409).json({ error: 'Документ вже завершено' });
      }
      return res.status(404).json({ error: 'Документ не знайдено або немає доступу' });
    }

    const updated = await prisma.warehouseMovement.update({
      where: { id: Number(id) },
      data: { status: 'finalized' },
    });

    console.log(`✅ [Warehouse] Документ #${id} завершено локально (без Діловода)`);
    res.json({ success: true, id: updated.id, status: updated.status });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при локальному завершенні:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера',
    });
  }
});

// GET /api/warehouse/:id - отримати документ за ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Перевіряємо наявність та валідність ID
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }

    const movement = await WarehouseService.getMovementById(Number(id));

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    const [withAuthor] = await resolveAuthorNames([movement as { createdBy: number | null }]);
    let receivedByName: string | null = null;
    const receivedBy = (movement as { receivedBy?: number | null }).receivedBy;
    if (receivedBy != null) {
      const receiver = await prisma.user.findUnique({
        where: { id: receivedBy },
        select: { name: true },
      });
      receivedByName = receiver?.name ?? null;
    }
    res.json({ ...withAuthor, receivedByName });
  } catch (error) {
    console.error('❌ [Warehouse] Error fetching warehouse movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/warehouse/:id - оновити чернетку
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] PUT /api/warehouse/:id - оновлення чернетки...');
    const { id } = req.params;
    const { items, notes, movementDate } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userRole = (req as any).user?.role;
    const canOverrideEdit = await canOverrideMovementEdit(userRole);

    // Автор — свої draft/active; з правом movement.edit — будь-який невидалений документ
    const existingDraft = await prisma.warehouseMovement.findFirst({
      where: {
        id: Number(id),
        ...(!canOverrideEdit && { createdBy: userId }),
        status: canOverrideEdit ? { not: 'deleted' } : { in: ['draft', 'active'] },
      }
    });

    if (!existingDraft) {
      // Перевіряємо чи документ існує взагалі (щоб дати точне повідомлення)
      const anyDoc = await prisma.warehouseMovement.findFirst({
        where: {
          id: Number(id),
          ...(!canOverrideEdit && { createdBy: userId }),
        },
        select: { status: true },
      });
      if (anyDoc?.status === 'deleted') {
        return res.status(409).json({ error: 'Документ видалено' });
      }
      if (anyDoc?.status === 'finalized' || anyDoc?.status === 'pending_receipt') {
        return res.status(403).json({ error: 'Документ завершено і не може бути змінений' });
      }
      return res.status(404).json({ error: 'Draft not found or access denied' });
    }

    // Парсимо дату переміщення якщо вона передана
    let parsedMovementDate: Date | undefined;
    if (movementDate) {
      parsedMovementDate = new Date(movementDate);
      if (isNaN(parsedMovementDate.getTime())) {
        return res.status(400).json({ error: 'Invalid movementDate format. Expected ISO string (e.g., 2026-04-09T14:30:00Z)' });
      }
      console.log(`📦 [Warehouse] Дата переміщення: ${parsedMovementDate.toLocaleString('uk-UA')}`);
    }

    const updatedDraft = await WarehouseService.updateMovement(Number(id), {
      items,
      notes,
      movementDate: parsedMovementDate
    });

    console.log(`✅ [Warehouse] Чернетку оновлено (id ${updatedDraft.id})`);
    res.json(updatedDraft);
  } catch (error) {
    console.error('🚨 [Warehouse] Error updating draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/:id/submit — відправка на отримання (без Dilovod)
router.post('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as { user?: { userId?: number; id?: number; role?: string } }).user?.userId
      || (req as { user?: { id?: number } }).user?.id;
    const userRole = (req as { user?: { role?: string } }).user?.role;
    const canOverrideEdit = await canOverrideMovementEdit(userRole);

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) },
    });
    if (!movement) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    if (!canOverrideEdit && movement.createdBy !== userId) {
      return res.status(403).json({ error: 'Відправити може лише автор документа' });
    }
    if (movement.status !== 'draft') {
      return res.status(409).json({ error: 'Документ уже відправлено або завершено' });
    }

    const items = WarehouseService.parseItems(movement.items) as unknown as Record<string, unknown>[];
    const hasQty = items.some((item) => (
      WarehouseService.itemSentPortions(item) > 0
      || (Number(item.boxQuantity) || 0) > 0
    ));
    if (!hasQty) {
      return res.status(400).json({ error: 'Неможливо відправити порожній документ' });
    }

    const now = new Date();
    const updated = await prisma.warehouseMovement.update({
      where: { id: movement.id },
      data: {
        status: 'pending_receipt',
        submittedAt: now,
        items: JSON.stringify(WarehouseService.zeroReceivedFields(items)),
      },
    });

    const [withAuthor] = await resolveAuthorNames([updated as { createdBy: number | null }]);
    res.json({ ...withAuthor, receivedByName: null });
  } catch (error) {
    console.error('🚨 [Warehouse] Error submitting movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/warehouse/:id/receipt — зберегти прийняті кількості
router.put('/:id/receipt', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body as { items?: unknown };
    const userId = (req as { user?: { userId?: number; id?: number } }).user?.userId
      || (req as { user?: { id?: number } }).user?.id;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Очікується масив items' });
    }

    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) },
    });
    if (!movement) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    if (movement.status !== 'pending_receipt') {
      return res.status(409).json({ error: 'Прийом доступний лише для відправлених документів' });
    }
    if (movement.createdBy === userId) {
      return res.status(403).json({ error: 'Автор документа не може прийняти власне відправлення' });
    }

    const stored = WarehouseService.parseItems(movement.items) as unknown as Record<string, unknown>[];
    const clientItems = items as Record<string, unknown>[];
    const merged = WarehouseService.mergeReceivedItems(stored, clientItems);

    const updated = await prisma.warehouseMovement.update({
      where: { id: movement.id },
      data: { items: JSON.stringify(merged) },
    });

    const [withAuthor] = await resolveAuthorNames([updated as { createdBy: number | null }]);
    res.json({ ...withAuthor, receivedByName: null });
  } catch (error) {
    console.error('🚨 [Warehouse] Error saving receipt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

type MovementRow = NonNullable<Awaited<ReturnType<typeof prisma.warehouseMovement.findUnique>>>;

async function exportReceivedQuantitiesToDilovod(params: {
  movement: MovementRow;
  userId: number;
  dryRun: boolean;
  extraUpdate?: Record<string, unknown>;
  logLabel: string;
}) {
  const { movement, userId, dryRun, extraUpdate, logLabel } = params;
  const items = WarehouseService.parseItems(movement.items) as unknown as Record<string, unknown>[];
  const skus = [...new Set(items.map((item) => String(item.sku ?? '').trim()).filter(Boolean))];
  const found = await catalogOpsLookup.getBySkus(skus);
  const products = catalogOpsLookup.listUnique(found).map((p) => ({
    sku: p.sku,
    name: p.name,
    dilovodId: p.dilovodId,
    portionsPerBox: p.portionsPerBox,
    set: p.set,
  }));
  const ppbBySku = new Map(products.map((product) => [product.sku, product.portionsPerBox]));
  const receivedTotal = items.reduce(
    (sum, item) => sum + WarehouseService.itemReceivedPortions(
      item,
      ppbBySku.get(String(item.sku ?? '').trim()) ?? 0,
    ),
    0,
  );
  if (receivedTotal <= 0) {
    return { kind: 'noqty' as const, message: 'Немає прийнятих позицій для відправки в Dilovod' };
  }

  const summaryItems = await WarehouseService.fillMissingBatchIds(
    WarehouseService.buildSummaryItemsFromReceived(items, products),
    movement.sourceWarehouse,
  );
  if (summaryItems.length === 0) {
    return { kind: 'noqty' as const, message: 'Немає прийнятих позицій для відправки в Dilovod' };
  }

  console.log(
    `📦 [Warehouse] ${logLabel} #${movement.id}: ${summaryItems.length} SKU, ` +
      `${summaryItems.reduce((n, item) => n + item.details.batches.length, 0)} партій ` +
      `[${summaryItems.flatMap((item) => item.details.batches.map((b) => `${item.sku}:${b.batchId || '—'}`)).join(', ')}]`,
  );

  const deviations = WarehouseService.buildReceiptDeviations(items);
  const exportResult = await exportWarehouseMovementToDilovod({
    draft: movement,
    summaryItems,
    userId,
    movementDate: movement.movementDate,
    dryRun,
    isFinal: !dryRun,
    extraUpdate: dryRun
      ? undefined
      : {
        deviations: JSON.stringify(deviations),
        ...(extraUpdate ?? {}),
      },
  });

  return { kind: 'done' as const, exportResult, deviations };
}

// POST /api/warehouse/:id/confirm-receipt — фіналізація з фактично прийнятими кількостями
router.post('/:id/confirm-receipt', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as { user?: { userId?: number; id?: number } }).user?.userId
      || (req as { user?: { id?: number } }).user?.id;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) },
    });
    if (!movement) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    if (movement.status !== 'pending_receipt') {
      return res.status(409).json({ error: 'Підтвердити можна лише документ в очікуванні отримання' });
    }
    if (movement.createdBy === userId) {
      return res.status(403).json({ error: 'Автор документа не може підтвердити отримання власного відправлення' });
    }

    const dryRun = req.body?.dryRun === true || req.query.dryRun === 'true';
    const now = new Date();
    const prepared = await exportReceivedQuantitiesToDilovod({
      movement,
      userId,
      dryRun,
      logLabel: 'confirm-receipt',
      extraUpdate: {
        receivedBy: userId,
        receivedAt: now,
      },
    });

    if (prepared.kind === 'noqty') {
      return res.status(400).json({ error: prepared.message });
    }

    const { exportResult, deviations } = prepared;

    if (exportResult.kind === 'error') {
      return res.status(exportResult.httpStatus).json(exportResult.body);
    }
    if (exportResult.kind === 'dryRun') {
      return res.json({
        success: true,
        dryRun: true,
        payload: exportResult.payload,
        validation: exportResult.validation,
      });
    }

    const updated = await prisma.warehouseMovement.findUnique({ where: { id: movement.id } });
    const [withAuthor] = updated
      ? await resolveAuthorNames([updated as { createdBy: number | null }])
      : [];
    const receiver = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    return res.json({
      success: true,
      ...withAuthor,
      receivedByName: receiver?.name ?? null,
      deviations,
      dilovodDocId: exportResult.dilovodDocId,
      docNumber: exportResult.docNumber,
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Error confirming receipt:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// POST /api/warehouse/:id/sync-dilovod — перезапис уже отриманого документа в Dilovod
router.post('/:id/sync-dilovod', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as { user?: { userId?: number; id?: number; role?: string } }).user?.userId
      || (req as { user?: { id?: number } }).user?.id;
    const userRole = (req as { user?: { role?: string } }).user?.role;
    const canOverrideEdit = await canOverrideMovementEdit(userRole);

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!canOverrideEdit) {
      return res.status(403).json({ error: 'Немає права перезаписувати документ у Dilovod' });
    }

    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) },
    });
    if (!movement) {
      return res.status(404).json({ error: 'Документ не знайдено' });
    }
    if (movement.status === 'deleted') {
      return res.status(409).json({ error: 'Документ видалено' });
    }
    if (movement.status !== 'finalized') {
      return res.status(409).json({ error: 'Перезапис у Dilovod доступний лише для отриманих документів' });
    }

    const dryRun = req.body?.dryRun === true || req.query.dryRun === 'true';
    const prepared = await exportReceivedQuantitiesToDilovod({
      movement,
      userId,
      dryRun,
      logLabel: 'sync-dilovod',
    });

    if (prepared.kind === 'noqty') {
      return res.status(400).json({ error: prepared.message });
    }

    const { exportResult, deviations } = prepared;
    if (exportResult.kind === 'error') {
      return res.status(exportResult.httpStatus).json(exportResult.body);
    }
    if (exportResult.kind === 'dryRun') {
      return res.json({
        success: true,
        dryRun: true,
        payload: exportResult.payload,
        validation: exportResult.validation,
      });
    }

    const updated = await prisma.warehouseMovement.findUnique({ where: { id: movement.id } });
    const [withAuthor] = updated
      ? await resolveAuthorNames([updated as { createdBy: number | null }])
      : [];

    return res.json({
      success: true,
      ...withAuthor,
      deviations,
      dilovodDocId: exportResult.dilovodDocId,
      docNumber: exportResult.docNumber,
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Error syncing movement to Dilovod:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

// POST /api/warehouse/ - створити новий документ переміщення
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] POST /api/warehouse/ - створення нового документа...');
    console.log('🏪 [Warehouse] Request body:', JSON.stringify(req.body, null, 2));

    const { items, sourceWarehouse, destinationWarehouse, notes, movementDate, docNumber, dilovodDocId } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log('🏪 [Warehouse] User from token:', (req as any).user);
    console.log('🏪 [Warehouse] Extracted userId:', userId);

    // Валідація обов'язкових полів
    if (!items || !sourceWarehouse || !destinationWarehouse) {
      return res.status(400).json({ error: 'Missing required fields: items, sourceWarehouse, destinationWarehouse' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Парсимо дату переміщення якщо вона передана
    let parsedMovementDate: Date | undefined;
    if (movementDate) {
      parsedMovementDate = new Date(movementDate);
      if (isNaN(parsedMovementDate.getTime())) {
        return res.status(400).json({ error: 'Invalid movementDate format. Expected ISO string (e.g., 2026-04-09T14:30:00Z)' });
      }
      console.log(`📦 [Warehouse] Дата переміщення: ${parsedMovementDate.toISOString()}`);
    }

    // Перевіряємо дублікати: якщо передані dilovodDocId або docNumber — шукаємо існуючу чернетку
    if (dilovodDocId || docNumber) {
      const orConditions: any[] = [];
      if (dilovodDocId) orConditions.push({ dilovodDocId: String(dilovodDocId) });
      if (docNumber) orConditions.push({ docNumber: String(docNumber) });

      const existingDraft = await prisma.warehouseMovement.findFirst({
        where: { OR: orConditions },
      });

      if (existingDraft) {
        console.log(`♻️ [Warehouse] Знайдено існуючу чернетку #${existingDraft.id} для dilovodDocId=${dilovodDocId ?? '—'} / docNumber=${docNumber ?? '—'}. Повертаємо її.`);
        return res.status(200).json({ ...existingDraft, _existing: true });
      }
    }

    const movement = await WarehouseService.createMovement({
      items,
      sourceWarehouse,
      destinationWarehouse,
      notes,
      createdBy: userId,
      movementDate: parsedMovementDate,
      // Якщо документ завантажено з Діловода — зберігаємо його номер і ID
      ...(docNumber != null && { docNumber: String(docNumber) }),
      ...(dilovodDocId != null && { dilovodDocId: String(dilovodDocId) }),
    });

    console.log('✅ [Warehouse] Чернетка переміщення створена:', movement.id);

    res.status(201).json(movement);
  } catch (error: any) {
    // P2002 — порушення унікального обмеження (dilovodDocId вже існує)
    // Може виникнути при race condition, якщо два запити пройшли перевірку одночасно
    if (error?.code === 'P2002' && error?.meta?.target === 'warehouse_movement_dilovodDocId_key') {
      const { dilovodDocId } = req.body;
      const existing = dilovodDocId
        ? await prisma.warehouseMovement.findUnique({ where: { dilovodDocId: String(dilovodDocId) } })
        : null;
      if (existing) {
        console.log(`♻️ [Warehouse] Race condition: повертаємо існуючий запис #${existing.id} для dilovodDocId=${dilovodDocId}`);
        return res.status(200).json({ ...existing, _existing: true });
      }
      return res.status(409).json({ error: 'Документ з таким dilovodDocId вже існує' });
    }
    console.error('🚨 [Warehouse] Error creating warehouse movement:', error);
    console.error('🚨 [Warehouse] Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/warehouse/send — формування payload та/або відправка до Діловода
// dryRun=true (default) — тільки повернути payload без відправки
// dryRun=false — реальна відправка до Діловода
// isFinal=false (default) — проміжна відправка, статус → 'active', документ редагується далі
// isFinal=true — фінальна відправка, статус → 'finalized', документ заблоковано
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { draftId, summaryItems, movementDate, overrides, dryRun = true, isFinal = false, sourceWarehouse, destinationWarehouse } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!draftId || !Array.isArray(summaryItems) || summaryItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Обов\'язкові поля: draftId, summaryItems (непорожній масив)',
      });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Завантажуємо чернетку
    const draft = await prisma.warehouseMovement.findUnique({
      where: { id: Number(draftId) },
    });

    if (!draft) {
      return res.status(404).json({ success: false, error: 'Чернетку не знайдено' });
    }

    const exportResult = await exportWarehouseMovementToDilovod({
      draft,
      summaryItems,
      userId,
      movementDate,
      overrides,
      dryRun,
      isFinal,
      sourceWarehouse,
      destinationWarehouse,
    });

    if (exportResult.kind === 'error') {
      return res.status(exportResult.httpStatus).json(exportResult.body);
    }

    if (exportResult.kind === 'dryRun') {
      return res.json({
        success: true,
        dryRun: true,
        payload: exportResult.payload,
        validation: exportResult.validation,
      });
    }

    return res.json({
      success: true,
      dryRun: false,
      isFinal: exportResult.isFinal,
      status: exportResult.status,
      lastSentToDilovodAt: exportResult.lastSentToDilovodAt,
      payload: exportResult.payload,
      validation: exportResult.validation,
      dilovodDocId: exportResult.dilovodDocId,
      docNumber: exportResult.docNumber,
      dilovodResponse: exportResult.dilovodResponse,
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при відправці до Діловода:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера',
    });
  }
});

// DELETE /api/warehouse/:id — soft-delete (status=deleted). У Dilovod — delMark, якщо є dilovodDocId.
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log(`🗑️ [Warehouse] Видалення документа ${id}...`);

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) },
    });

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    const userRole = (req as any).user?.role;
    const canOverrideDelete = await canOverrideMovementDelete(userRole);

    if (movement.status === 'deleted') {
      return res.status(409).json({ error: 'Документ уже видалено' });
    }

    if (!canOverrideDelete && (movement.status !== 'draft' || movement.createdBy !== userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (movement.dilovodDocId) {
      const mark = await WarehouseService.markDilovodMovementDeleted(movement.dilovodDocId);
      if (!mark.success && !mark.notFound) {
        return res.status(422).json({
          error: mark.error || 'Не вдалося позначити документ у Діловоді',
          errorTitle: 'Dilovod delMark',
        });
      }
      if (mark.notFound) {
        console.warn(`⚠️ [Warehouse] Dilovod id ${movement.dilovodDocId} не знайдено — локальне видалення`);
      }
    }

    await prisma.warehouseMovement.update({
      where: { id: movement.id },
      data: { status: 'deleted' },
    });

    console.log(`✅ [Warehouse] Документ ${id} позначено як deleted`);
    res.json({ success: true, status: 'deleted' });
  } catch (error) {
    console.error('🚨 [Warehouse] Error deleting movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ІНВЕНТАРИЗАЦІЯ — ДОВІДНИКИ
// ============================================================================

// GET /api/warehouse/inventory/products
// catalog_goods у «Готова продукція», без комплектів.
router.get('/inventory/products', authenticateToken, async (req, res) => {
  try {
    console.log('📦 [Inventory] GET /inventory/products — завантаження порцій з каталогу...');
    const products = await productsCatalogService.listInventoryProducts();
    console.log(`✅ [Inventory] Знайдено ${products.length} товарів для інвентаризації`);
    res.json({ products, total: products.length });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching inventory products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/warehouse/inventory/materials
// catalog_goods у папці матеріалів.
router.get('/inventory/materials', authenticateToken, async (req, res) => {
  try {
    console.log('📦 [Inventory] GET /inventory/materials — завантаження матеріалів з каталогу...');
    const materials = await productsCatalogService.listInventoryMaterials();
    console.log(`✅ [Inventory] Знайдено ${materials.length} матеріалів для інвентаризації`);
    res.json({ materials, total: materials.length });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching inventory materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/warehouse/inventory/sets
// catalog_goods у «Готова продукція», accPolicy kit + BOM.
router.get('/inventory/sets', authenticateToken, async (req, res) => {
  try {
    console.log('📦 [Inventory] GET /inventory/sets — завантаження комплектів з каталогу...');
    const sets = await productsCatalogService.listInventorySets();
    console.log(`✅ [Inventory] Знайдено ${sets.length} комплектів для інвентаризації`);
    res.json({ sets, total: sets.length });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching inventory sets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ІНВЕНТАРИЗАЦІЯ — СЕСІЇ (CRUD)
// ============================================================================

// GET /api/warehouse/inventory/draft
// Повертає активну чернетку (статус draft/in_progress) для авторизованого юзера
router.get('/inventory/draft', authenticateToken, async (req, res) => {
  try {
    const userId: number = (req as any).user?.userId ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID not found in token' });

    const draft = await prisma.warehouseInventory.findFirst({
      where: { createdBy: userId, status: { in: ['draft', 'in_progress', 'revising'] } },
      orderBy: { updatedAt: 'desc' },
    });

    // Повертаємо inventoryDate як ISO-рядок для зручності клієнта
    const result = draft ? {
      ...draft,
      inventoryDate: draft.inventoryDate?.toISOString() ?? null,
    } : null;

    res.json({ draft: result });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/inventory/draft
// Створює нову сесію інвентаризації (або повертає незавершену існуючу)
router.post('/inventory/draft', authenticateToken, async (req, res) => {
  try {
    const userId: number = (req as any).user?.userId ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID not found in token' });

    const { comment, items, inventoryDate } = req.body as {
      comment?: string;
      items?: unknown[];
      inventoryDate?: string;
    };

    const parsedInventoryDate = inventoryDate ? new Date(inventoryDate) : null;
    const effectiveInventoryDate = parsedInventoryDate ?? new Date();

    // Якщо є незавершена сесія — оновлюємо її замість створення нової
    const existing = await prisma.warehouseInventory.findFirst({
      where: { createdBy: userId, status: { in: ['draft', 'in_progress'] } },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      const updated = await prisma.warehouseInventory.update({
        where: { id: existing.id },
        data: {
          status: 'in_progress',
          comment: comment !== undefined ? comment : existing.comment,
          items: items !== undefined ? JSON.stringify(items) : existing.items,
          inventoryDate: parsedInventoryDate ?? existing.inventoryDate ?? existing.createdAt,
        },
      });
      console.log(`✅ [Inventory] Відновлено існуючу сесію #${updated.id} для userId=${userId}`);
      return res.json({ session: { ...updated, inventoryDate: updated.inventoryDate?.toISOString() ?? null } });
    }

    const session = await prisma.warehouseInventory.create({
      data: {
        createdBy: userId,
        warehouse: 'small',
        status: 'in_progress',
        comment: comment ?? null,
        items: items !== undefined ? JSON.stringify(items) : '[]',
        inventoryDate: effectiveInventoryDate,
      },
    });
    console.log(`✅ [Inventory] Створено нову сесію #${session.id} для userId=${userId}`);
    res.status(201).json({ session: { ...session, inventoryDate: session.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error creating draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/warehouse/inventory/draft/:id
// Зберігає поточний стан чернетки (items + comment + inventoryDate)
router.put('/inventory/draft/:id', authenticateToken, async (req, res) => {
  try {
    const userId: number = (req as any).user?.userId ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID not found in token' });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const { comment, items, inventoryDate } = req.body as {
      comment?: string;
      items?: unknown[];
      inventoryDate?: string;
    };

    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;

    const existing = await prisma.warehouseInventory.findFirst({
      where: { id: sessionId, ...(!isAdmin && { createdBy: userId }) },
    });
    if (!existing) return res.status(404).json({ error: 'Session not found' });
    if (!isAdmin && existing.status === 'completed') {
      const latestOwnSession = await prisma.warehouseInventory.findFirst({
        where: {
          createdBy: userId,
          status: { in: ['completed', 'in_progress'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latestOwnSession || latestOwnSession.id !== existing.id) {
        return res.status(403).json({ error: 'Only the latest own inventory session can be edited' });
      }
    }

    const updated = await prisma.warehouseInventory.update({
      where: { id: sessionId },
      data: {
        comment: comment !== undefined ? comment : existing.comment,
        items: items !== undefined ? JSON.stringify(items) : existing.items,
        ...(inventoryDate !== undefined && { inventoryDate: new Date(inventoryDate) }),
      },
    });

    console.log(`✅ [Inventory] Збережено чернетку #${sessionId} для userId=${userId}`);
    res.json({ session: { ...updated, inventoryDate: updated.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error updating draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/inventory/complete
// Створює та одразу завершує нову інвентаризацію без проміжної чернетки
router.post('/inventory/complete', authenticateToken, async (req, res) => {
  try {
    const userId: number = (req as any).user?.userId ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID not found in token' });

    const { comment, items, inventoryDate } = req.body as {
      comment?: string;
      items?: unknown[];
      inventoryDate?: string;
    };

    const parsedInventoryDate = inventoryDate ? new Date(inventoryDate) : null;
    const effectiveInventoryDate = parsedInventoryDate ?? new Date();

    const completed = await prisma.warehouseInventory.create({
      data: {
        createdBy: userId,
        warehouse: 'small',
        status: 'completed',
        completedAt: new Date(),
        comment: comment ?? null,
        items: items !== undefined ? JSON.stringify(items) : '[]',
        inventoryDate: effectiveInventoryDate,
      },
    });

    console.log(`✅ [Inventory] Створено та завершено інвентаризацію #${completed.id} для userId=${userId}`);
    res.status(201).json({ session: { ...completed, inventoryDate: completed.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error completing inventory without draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/inventory/draft/:id/complete
// Завершує сесію інвентаризації
router.post('/inventory/draft/:id/complete', authenticateToken, async (req, res) => {
  try {
    const userId: number = (req as any).user?.userId ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID not found in token' });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const { comment, items, inventoryDate } = req.body as {
      comment?: string;
      items?: unknown[];
      inventoryDate?: string;
    };

    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;

    const existing = await prisma.warehouseInventory.findFirst({
      where: { id: sessionId, ...(!isAdmin && { createdBy: userId }) },
    });
    if (!existing) return res.status(404).json({ error: 'Session not found' });
    if (!isAdmin && existing.status === 'completed') {
      const latestOwnSession = await prisma.warehouseInventory.findFirst({
        where: {
          createdBy: userId,
          status: { in: ['completed', 'in_progress'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latestOwnSession || latestOwnSession.id !== existing.id) {
        return res.status(403).json({ error: 'Only the latest own inventory session can be edited' });
      }
    }

    const completed = await prisma.warehouseInventory.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        comment: comment !== undefined ? comment : existing.comment,
        items: items !== undefined ? JSON.stringify(items) : existing.items,
        inventoryDate: inventoryDate !== undefined
          ? new Date(inventoryDate)
          : existing.inventoryDate ?? existing.createdAt,
      },
    });

    console.log(`✅ [Inventory] Завершено інвентаризацію #${sessionId} для userId=${userId}`);
    res.json({ session: { ...completed, inventoryDate: completed.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error completing session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/warehouse/inventory/draft/:id
// Видаляє (скасовує) незавершену чернетку
router.delete('/inventory/draft/:id', authenticateToken, async (req, res) => {
  try {
    const userId: number = (req as any).user?.userId ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'User ID not found in token' });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;

    const existing = await prisma.warehouseInventory.findFirst({
      where: { id: sessionId, ...(!isAdmin && { createdBy: userId }) },
    });
    if (!existing) return res.status(404).json({ error: 'Session not found' });
    if (!isAdmin && existing.status === 'completed') return res.status(400).json({ error: 'Cannot delete completed session' });

    const updated = await prisma.warehouseInventory.update({ where: { id: sessionId }, data: { status: 'removed' } });

    console.log(`✅ [Inventory] Помічено як видалену інвентаризацію #${sessionId} для userId=${userId}`);
    res.json({ message: 'Draft marked removed', session: { ...updated, inventoryDate: updated.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error deleting draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/inventory/:id/revision
// Позначити сесію як таку, що редагується (revising) — використовується адміном
router.post('/inventory/:id/revision', authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;
    if (!isAdmin) return res.status(403).json({ error: 'Only admins can mark sessions as revising' });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const existing = await prisma.warehouseInventory.findUnique({ where: { id: sessionId } });
    if (!existing) return res.status(404).json({ error: 'Session not found' });
    if (existing.status === 'removed') return res.status(400).json({ error: 'Cannot revise removed session' });

    const updated = await prisma.warehouseInventory.update({ where: { id: sessionId }, data: { status: 'revising' } });

    console.log(`✅ [Inventory] Позначено інвентаризацію #${sessionId} як revising`);
    res.json({ session: { ...updated, inventoryDate: updated.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error marking session revising:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/warehouse/inventory/history
// Повертає завершені та активні інвентаризації (пагінація: page, limit)
router.get('/inventory/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    // Include 'revising' so admin-edited sessions appear in history; exclude 'removed'
    const historyStatuses = { in: ['completed', 'in_progress', 'revising'] };

    const [rawSessions, total] = await Promise.all([
      prisma.warehouseInventory.findMany({
        where: { status: historyStatuses },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.warehouseInventory.count({ where: { status: historyStatuses } }),
    ]);

    const sessions = await resolveAuthorNames(rawSessions);

    res.json({
      sessions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/warehouse/inventory/archive
// Повертає інвентаризації зі статусом 'removed' — доступно лише адмінам
router.get('/inventory/archive', authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;
    if (!isAdmin) return res.status(403).json({ error: 'Only admins can view archive' });

    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [rawSessions, total] = await Promise.all([
      prisma.warehouseInventory.findMany({
        where: { status: 'removed' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.warehouseInventory.count({ where: { status: 'removed' } }),
    ]);

    const sessions = await resolveAuthorNames(rawSessions);

    res.json({
      sessions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching archive:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/inventory/:id/restore
// Відновлює помічену як 'removed' інвентаризацію назад у статус 'completed' (admin only)
router.post('/inventory/:id/restore', authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;
    if (!isAdmin) return res.status(403).json({ error: 'Only admins can restore sessions' });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const existing = await prisma.warehouseInventory.findUnique({ where: { id: sessionId } });
    if (!existing) return res.status(404).json({ error: 'Session not found' });
    if (existing.status !== 'removed') return res.status(400).json({ error: 'Session is not removed' });

    const restored = await prisma.warehouseInventory.update({ where: { id: sessionId }, data: { status: 'completed' } });

    console.log(`✅ [Inventory] Відновлено інвентаризацію #${sessionId}`);
    res.json({ session: { ...restored, inventoryDate: restored.inventoryDate?.toISOString() ?? null } });
  } catch (error) {
    console.error('🚨 [Inventory] Error restoring session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/warehouse/inventory/:id/permanent
// Видаляє запис інвентаризації з БД (остаточно) — доступно лише адмінам
router.delete('/inventory/:id/permanent', authenticateToken, async (req, res) => {
  try {
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === ROLES.ADMIN;
    if (!isAdmin) return res.status(403).json({ error: 'Only admins can permanently delete sessions' });

    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const existing = await prisma.warehouseInventory.findUnique({ where: { id: sessionId } });
    if (!existing) return res.status(404).json({ error: 'Session not found' });

    await prisma.warehouseInventory.delete({ where: { id: sessionId } });

    console.log(`✅ [Inventory] Permanently deleted inventory #${sessionId}`);
    res.json({ message: 'Session permanently deleted' });
  } catch (error) {
    console.error('🚨 [Inventory] Error permanently deleting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/warehouse/inventory/:id/refresh-balances
// Оновлює залишки у БД для SKU, що присутні в сесії інвентаризації, на дату інвентаризації
router.post('/inventory/:id/refresh-balances', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });

    const session = await prisma.warehouseInventory.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Використовуємо inventoryDate якщо задано, інакше createdAt
    const asOfDate = session.inventoryDate ?? session.createdAt;

    // Розпарсимо items (якщо помилка парсингу — повертаємо пустий звіт)
    let items: any[] = [];
    try {
      items = session.items ? JSON.parse(session.items) : [];
    } catch (e) {
      console.warn('[Inventory] Failed to parse session.items for refresh-balances:', e);
      items = [];
    }

    const skus = Array.from(new Set(items.map((it: any) => (it && it.sku) ? String(it.sku).trim() : '').filter(Boolean)));
    if (skus.length === 0) {
      return res.json({ success: true, asOfDate: asOfDate?.toISOString() ?? null, items: [] });
    }

    // Отримуємо залишки з Dilovod на потрібну дату
    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodService = new DilovodService();

    const balances = await dilovodService.getStockBalanceForSkus(skus, asOfDate);

    const report: Array<any> = [];

    // Map SKU -> serialized item from session (warehouse_inventory.items)
    const sessionItemsBySku = new Map<string, any>();
    for (const it of items) {
      if (it && it.sku) sessionItemsBySku.set(String(it.sku).trim(), it);
    }

    // Для кожного балансу формуємо звіт: "before" беремо з session.items (systemBalance),
    // "after" беремо з Dilovod (smallStorage). Кеш products не чіпаємо.
    for (const b of balances) {
      const sku = b.sku;
      const newSmall = Number(b.smallStorage ?? 0);
      const sessionItem = sessionItemsBySku.get(sku);

      if (sessionItem) {
        const before = typeof sessionItem.systemBalance === 'number' ? Number(sessionItem.systemBalance) : (sessionItem.systemBalance ? Number(sessionItem.systemBalance) : null);
        report.push({ sku, name: sessionItem.name ?? null, type: sessionItem.type ?? 'product', before, after: newSmall });
      } else {
        // Якщо SKU відсутній у сесії — віддаємо у звіт з before = null
        report.push({ sku, name: null, type: 'missing', before: null, after: newSmall });
      }
    }

    console.log(`✅ [Inventory] Refreshed balances for session #${sessionId} — ${report.length} items processed`);

    // Якщо в query передано apply=true — застосовуємо оновлення синхронно (чекаємо завершення)
    const shouldApply = req.query.apply === 'true';
    let applyScheduled = false;
    let applyCompleted = false;
    if (shouldApply) {
      try {
        // Розпарсимо ще раз session.items (початковий стан)
        let originalItems: any[] = [];
        try {
          originalItems = session.items ? JSON.parse(session.items) : [];
        } catch (e) {
          console.warn('[Inventory][Apply] Failed to parse original session.items during apply:', e);
          originalItems = [];
        }

        // Map SKU -> after value
        const afterBySku = new Map<string, number>();
        for (const r of report) {
          if (r && r.sku) afterBySku.set(String(r.sku), Number(r.after ?? 0));
        }

        // Build updated items array (only update systemBalance for matching SKUs)
        const updatedItems = originalItems.map((it: any) => {
          if (it && it.sku && afterBySku.has(String(it.sku))) {
            const newVal = afterBySku.get(String(it.sku));
            return { ...it, systemBalance: typeof newVal === 'number' ? newVal : it.systemBalance };
          }
          return it;
        });

        // Write back to DB (synchronously)
        await prisma.warehouseInventory.update({ where: { id: sessionId }, data: { items: JSON.stringify(updatedItems) } });
        console.log(`✅ [Inventory][Apply] Applied balances to warehouse_inventory #${sessionId} (items updated: ${report.length})`);
        applyCompleted = true;
      } catch (e) {
        console.error('🚨 [Inventory][Apply] Error applying balances:', e);
        // if apply fails, we do not schedule background job here
      }
    }

    res.json({ success: true, asOfDate: asOfDate?.toISOString() ?? null, items: report, applyScheduled, applyCompleted });
  } catch (error) {
    console.error('🚨 [Inventory] Error in refresh-balances:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// GET /api/warehouse/inventory/product-history?sku=:sku&days=21
// Повертає статистику інвентаризацій для конкретного SKU за останні N днів
router.get('/inventory/product-history', authenticateToken, async (req, res) => {
  try {
    const { sku, days = '21' } = req.query;
    if (!sku || typeof sku !== 'string') {
      return res.status(400).json({ error: 'sku is required' });
    }

    const normalizedSku = String(sku).trim();

    const daysNum = Math.min(Math.max(parseInt(String(days), 10) || 21, 1), 365);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNum);

    const sessions = await prisma.warehouseInventory.findMany({
      where: {
        status: { in: ['completed', 'in_progress'] },
        createdAt: { gte: fromDate },
      },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, createdAt: true, items: true },
    });

    const entries: Array<{
      sessionId: number;
      date: string;
      systemBalance: number | null;
      actual: number | null;
      deviation: number | null;
      systemBalanceGp: number | null;
      actualGp: number | null;
      deviationGp: number | null;
      // Додаткові поля для Tooltip
      systemBalanceGpBoxCount: number | null;
      systemBalanceGpActualCount: number | null;
      actualGpBoxCount: number | null;
      actualGpActualCount: number | null;
    }> = [];

    for (const session of sessions) {
      let items: any[] = [];
      try {
        items = session.items ? JSON.parse(session.items) : [];
      } catch {
        continue;
      }

      const item = items.find((it: any) => it && String(it.sku).trim() === normalizedSku);
      if (!item) continue;

      const systemBalance: number | null = typeof item.systemBalance === 'number' ? item.systemBalance : null;

      // Обчислення фактичного залишку (аналог totalPortions на фронтенді)
      let actual: number | null = null;
      if (item.unit === 'portions' && item.portionsPerBox != null && Number(item.portionsPerBox) > 0) {
        const bc = typeof item.boxCount === 'number' ? item.boxCount : null;
        const ac = typeof item.actualCount === 'number' ? item.actualCount : null;
        if (bc !== null || ac !== null) {
          actual = (bc ?? 0) * Number(item.portionsPerBox) + (ac ?? 0);
        }
      } else if (typeof item.actualCount === 'number') {
        actual = item.actualCount;
      }

      const deviation = actual !== null && systemBalance !== null ? actual - systemBalance : null;

      // === ГП (склад готової продукції) обчислення ===
      const systemBalanceGp: number | null = typeof item.systemBalanceGp === 'number' ? item.systemBalanceGp : null;

      let actualGp: number | null = null;
      let boxCountGp: number | null = null;
      let actualCountGp: number | null = null;

      if (item.unit === 'portions' && item.portionsPerBox != null && Number(item.portionsPerBox) > 0) {
        const bcGp = typeof item.boxCountGp === 'number' ? item.boxCountGp : null;
        const acGp = typeof item.actualCountGp === 'number' ? item.actualCountGp : null;
        if (bcGp !== null || acGp !== null) {
          boxCountGp = bcGp;
          actualCountGp = acGp;
          actualGp = (bcGp ?? 0) * Number(item.portionsPerBox) + (acGp ?? 0);
        }
      } else if (typeof item.actualCountGp === 'number') {
        actualGp = item.actualCountGp;
      }

      const deviationGp = actualGp !== null && systemBalanceGp !== null ? actualGp - systemBalanceGp : null;
      // === кінець ГП обчислення ===

      entries.push({
        sessionId: session.id,
        date: (session.inventoryDate ?? session.createdAt).toISOString(),
        systemBalance,
        actual,
        deviation,
        systemBalanceGp,
        actualGp,
        deviationGp,
        // Tooltip дані: для системного балансу ГП
        systemBalanceGpBoxCount: boxCountGp,
        systemBalanceGpActualCount: actualCountGp,
        // Tooltip дані: для фактичного залишку ГП
        actualGpBoxCount: boxCountGp,
        actualGpActualCount: actualCountGp,
      });
    }

    // For each entry, compute movement totals (kit / shipped / returned / writtenOff) within the same inventory day.
    // Monolithic sets may be present only in payloadData.shipment.bySku, so we keep that as a fallback source.
    const enrichedEntries = await Promise.all(entries.map(async (e) => {
      try {
        const asOf = new Date(e.date);
        // define day window [startOfDay, endOfDay)
        const startOfDay = new Date(asOf);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        // Shipments: aggregate from orders with dilovodSaleExportDate in the same day.
        // We prefer cached processedItems in orders_cache (contains orderedQuantity per SKU),
        // fallback to parsing order.items when cache missing.
        const orders = await prisma.order.findMany({
          where: { dilovodSaleExportDate: { gte: startOfDay, lt: endOfDay } },
          select: { externalId: true, payloadData: true, items: true },
        });

        const orderExternalIds = orders.map(o => o.externalId).filter(Boolean);
        let shipped = 0;
        if (orderExternalIds.length > 0) {
          const caches = await prisma.ordersCache.findMany({
            where: { externalId: { in: orderExternalIds } },
            select: { externalId: true, processedItems: true },
          });

          const cachedItemsByExternalId = new Map<string, Array<{ sku?: string; name?: string; orderedQuantity?: number; quantity?: number }>>();
          for (const cache of caches) {
            if (!cache.processedItems) continue;
            try {
              const parsed = JSON.parse(cache.processedItems);
              if (Array.isArray(parsed)) {
                cachedItemsByExternalId.set(cache.externalId, parsed);
              }
            } catch {
              // ignore malformed cache
            }
          }

          // Same mono/regular split as shipment reports: leaf SKUs exclude monolithic components.
          const allSkus = collectSkusFromOrders(orders, cachedItemsByExternalId, true);
          const productDescriptors = await getReportProductDescriptors(allSkus);
          recomputeSetPortions(productDescriptors);

          for (const order of orders) {
            const cachedItems = cachedItemsByExternalId.get(order.externalId) ?? null;
            shipped += computeShippedQuantityForSku(order, cachedItems, normalizedSku, productDescriptors);
          }
        }

        const [smallStorageSetting, mainStorageSetting] = await Promise.all([
          prisma.settingsBase.findUnique({ where: { key: 'dilovod_small_storage_id' } }),
          prisma.settingsBase.findUnique({ where: { key: 'dilovod_main_storage_id' } }),
        ]);
        const smallStorageId = smallStorageSetting?.value || '1100700000001019';
        const mainStorageId = mainStorageSetting?.value || '1100700000001005';

        // Комплектування / розкомплектація:
        // - для набору (setSku): +kit / -unkit
        // - для компонента: -kit / +unkit (порції, що пішли в комплект або повернулись)
        // Розподіл по складах через release.storageId (null → ГП).
        const kitReleases = await prisma.warehouseReleaseSet.findMany({
          where: {
            status: { not: 'deleted' },
            operationType: { in: ['kit', 'unkit'] },
            OR: [
              { operDate: { gte: startOfDay, lt: endOfDay } },
              { createdAt: { gte: startOfDay, lt: endOfDay } },
            ],
          },
          select: {
            quantity: true,
            operationType: true,
            createdAt: true,
            operDate: true,
            items: true,
            setSku: true,
            storageId: true,
          },
        });

        const getReleaseOperationDate = (release: {
          operDate: Date | null;
          createdAt: Date;
          items: unknown;
        }): Date => {
          const items = Array.isArray(release.items) ? release.items : safeParseItems(release.items);
          const first = items[0] as { operationDate?: string; operation_date?: string } | undefined;
          const operationDateRaw = release.operDate || first?.operationDate || first?.operation_date || null;
          return operationDateRaw ? new Date(operationDateRaw) : release.createdAt;
        };

        const getSetNameFromRelease = (releaseItems: unknown): string | null => {
          const items = Array.isArray(releaseItems) ? releaseItems : safeParseItems(releaseItems);
          const first = items[0] as { name?: string; title?: string; setName?: string } | undefined;
          const name = first?.name ?? first?.title ?? first?.setName ?? null;
          return name ? String(name).trim() || null : null;
        };

        const getComponentQtyFromRelease = (releaseItems: unknown, sku: string, setQuantity: number): number => {
          const items = Array.isArray(releaseItems) ? releaseItems : safeParseItems(releaseItems);
          let total = 0;
          for (const setItem of items) {
            if (!setItem || typeof setItem !== 'object') continue;
            const quantityMode =
              String((setItem as { components_quantity_mode?: unknown }).components_quantity_mode ?? '')
                .toLowerCase() === 'total'
                ? 'total'
                : 'per_set';
            const itemSetQty = Number((setItem as { quantity?: unknown }).quantity ?? setQuantity) || setQuantity || 0;
            const compsRaw =
              (setItem as { components_snapshot?: unknown; componentsSnapshot?: unknown }).components_snapshot ??
              (setItem as { componentsSnapshot?: unknown }).componentsSnapshot ??
              [];
            if (!Array.isArray(compsRaw)) continue;
            for (const component of compsRaw) {
              if (!component || typeof component !== 'object') continue;
              const componentSku = String(
                (component as { sku?: unknown; id?: unknown }).sku ??
                  (component as { id?: unknown }).id ??
                  '',
              ).trim();
              if (componentSku !== sku) continue;
              const rawQty = Number(
                (component as { quantity?: unknown; qty?: unknown }).quantity ??
                  (component as { qty?: unknown }).qty ??
                  0,
              );
              if (!Number.isFinite(rawQty) || rawQty === 0) continue;
              total += quantityMode === 'total' ? rawQty : rawQty * itemSetQty;
            }
          }
          return total;
        };

        let kit = 0;
        let kitGp = 0;
        const kitDetails: Array<{
          setSku: string;
          setName: string | null;
          operationType: 'kit' | 'unkit';
          quantity: number;
          signedQuantity: number;
          storage: 'ms' | 'gp';
        }> = [];

        const resolveKitStorage = (storageId: string | null | undefined): 'ms' | 'gp' => {
          const resolved = storageId || mainStorageId;
          return resolved === smallStorageId ? 'ms' : 'gp';
        };

        const addKitToStorage = (storageId: string | null | undefined, signedQty: number) => {
          if (!signedQty) return;
          if (resolveKitStorage(storageId) === 'ms') kit += signedQty;
          else kitGp += signedQty;
        };

        for (const release of kitReleases) {
          const operationDate = getReleaseOperationDate(release);
          if (operationDate < startOfDay || operationDate >= endOfDay) continue;

          const isUnkit = release.operationType === 'unkit';
          const releaseSetSku = String(release.setSku ?? '').trim();

          if (releaseSetSku === normalizedSku) {
            const quantity = Number(release.quantity) || 0;
            addKitToStorage(release.storageId, isUnkit ? -quantity : quantity);
            continue;
          }

          const componentQty = getComponentQtyFromRelease(
            release.items,
            normalizedSku,
            Number(release.quantity) || 0,
          );
          if (componentQty === 0) continue;
          // kit споживає компоненти (−), unkit повертає (+)
          const signedQuantity = isUnkit ? componentQty : -componentQty;
          addKitToStorage(release.storageId, signedQuantity);
          kitDetails.push({
            setSku: releaseSetSku || '—',
            setName: getSetNameFromRelease(release.items),
            operationType: isUnkit ? 'unkit' : 'kit',
            quantity: componentQty,
            signedQuantity,
            storage: resolveKitStorage(release.storageId),
          });
        }

        // Fetch return records.
        // Повернення завжди йдуть на малий склад (МС).
        // Фолбек на createdAt, якщо returnDate === null (історичні записи без дати повернення).
        const returns = await prisma.warehouseReturnHistory.findMany({
          where: {
            OR: [
              { returnDate: { gte: startOfDay, lt: endOfDay } },
              { AND: [{ returnDate: null }, { createdAt: { gte: startOfDay, lt: endOfDay } }] },
            ],
          },
          select: { items: true },
        });

        // Fetch write-off records.
        // Списання можуть йти з МС або ГП — ділимо за storageId.
        // Фолбек на createdAt, якщо writeOffDate === null.
        const writeoffs = await prisma.warehouseWriteOffHistory.findMany({
          where: {
            OR: [
              { writeOffDate: { gte: startOfDay, lt: endOfDay } },
              { AND: [{ writeOffDate: null }, { createdAt: { gte: startOfDay, lt: endOfDay } }] },
            ],
          },
          select: { items: true, storageId: true },
        });

        const returned = sumQuantityForSku(returns, sku);

        let writtenOff = 0;
        let writtenOffGp = 0;
        for (const row of writeoffs) {
          const qty = sumQuantityForSku([row], sku);
          if (qty <= 0) continue;
          const resolvedStorage = row.storageId || smallStorageId;
          if (resolvedStorage === mainStorageId) writtenOffGp += qty;
          else writtenOff += qty;
        }

        // Переміщення: окремо для МС і ГП.
        // + якщо товар прийшов НА склад, − якщо пішов Зі складу.
        let moved = 0;
        let movedGp = 0;
        try {
          const movements = await prisma.warehouseMovement.findMany({
            where: {
              status: { not: 'deleted' },
              movementDate: { gte: startOfDay, lt: endOfDay },
              OR: [
                { sourceWarehouse: { in: [smallStorageId, mainStorageId] } },
                { destinationWarehouse: { in: [smallStorageId, mainStorageId] } },
              ],
            },
            select: { sourceWarehouse: true, destinationWarehouse: true, items: true },
          });

          // Збираємо всі SKU з переміщень, щоб одним запитом підтягнути portionsPerBox
          const movementSkus = new Set<string>();
          for (const movement of movements) {
            const items = safeParseItems(movement.items);
            for (const it of items) {
              const s = String((it as any)?.sku ?? '').trim();
              if (s) movementSkus.add(s);
            }
          }
          let portionsPerBoxBySku = new Map<string, number>();
          if (movementSkus.size > 0) {
            const found = await catalogOpsLookup.getBySkus([...movementSkus]);
            portionsPerBoxBySku = new Map(
              catalogOpsLookup.listUnique(found).map((p) => [p.sku, Number(p.portionsPerBox) || 1]),
            );
          }

          // Обчислює кількість позиції переміщення у порціях.
          // Пріоритет: totalPortions (готове поле) → portionQuantity + boxQuantity * portionsPerBox.
          // Враховуємо, що portionQuantity може бути 0 (коли товар йде лише коробками).
          const calcMovementQty = (item: any): number => {
            if (item == null || typeof item !== 'object') return 0;
            const itemSku = String(item.sku ?? '').trim();
            if (itemSku !== normalizedSku) return 0;
            if (typeof item.totalPortions === 'number' && item.totalPortions !== 0) {
              return item.totalPortions;
            }
            const ppb = portionsPerBoxBySku.get(itemSku) ?? 1;
            const portions = Number(item.portionQuantity) || 0;
            const boxes = Number(item.boxQuantity) || 0;
            return portions + boxes * ppb;
          };

          for (const movement of movements) {
            const items = safeParseItems(movement.items);
            let qty = 0;
            for (const it of items) {
              qty += calcMovementQty(it);
            }
            if (qty === 0) continue;

            if (movement.destinationWarehouse === smallStorageId) moved += qty;
            if (movement.sourceWarehouse === smallStorageId) moved -= qty;
            if (movement.destinationWarehouse === mainStorageId) movedGp += qty;
            if (movement.sourceWarehouse === mainStorageId) movedGp -= qty;
          }
        } catch {
          // ігноруємо помилки переміщень — не ламаємо решту історії
        }

        return {
          ...e,
          kit,
          kitGp,
          kitDetails,
          shipped,
          moved,
          movedGp,
          returned,
          writtenOff,
          writtenOffGp,
        };
      } catch (err) {
        return {
          ...e,
          kit: 0,
          kitGp: 0,
          kitDetails: [],
          shipped: 0,
          moved: 0,
          movedGp: 0,
          returned: 0,
          writtenOff: 0,
          writtenOffGp: 0,
        };
      }
    }));

    res.json({ sku, entries: enrichedEntries });
  } catch (error) {
    console.error('🚨 [Inventory] Error fetching product history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
