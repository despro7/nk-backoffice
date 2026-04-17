import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { authenticateToken } from '../../middleware/auth.js';
import { WarehouseService } from './WarehouseService.js';
import { MovementHistoryService } from './MovementHistoryService.js';
import { WarehousePayloadBuilder } from './WarehousePayloadBuilder.js';

const router = Router();

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
function buildBatchCacheKey(sku: string, firmId: string | undefined, asOfDate: Date | undefined): string {
  const firmPart = firmId ?? 'default';
  if (!asOfDate) {
    return `${sku}:${firmPart}:now`;
  }
  const pad = (n: number) => n.toString().padStart(2, '0');
  const datePart = `${asOfDate.getFullYear()}-${pad(asOfDate.getMonth() + 1)}-${pad(asOfDate.getDate())}_${pad(asOfDate.getHours())}:${pad(asOfDate.getMinutes())}`;
  return `${sku}:${firmPart}:${datePart}`;
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
    const { status, warehouse, page = 1, limit = 20 } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (warehouse) {
      where.OR = [
        { sourceWarehouse: warehouse },
        { destinationWarehouse: warehouse }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [movements, total] = await Promise.all([
      prisma.warehouseMovement.findMany({
        where,
        orderBy: { draftCreatedAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.warehouseMovement.count({ where })
    ]);

    res.json({
      movements,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
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

    const rawDrafts = await prisma.warehouseMovement.findMany({
      where: {
        createdBy: userId,
        status: { in: ['draft', 'active'] }, // 'finalized' — вже завершені, у чернетках не показуємо
      },
      orderBy: {
        draftCreatedAt: 'desc'
      }
    });

    // Резолвимо імена авторів через окремий запит (JOIN не підтримується для warehouseMovement)
    const authorIds = [...new Set(rawDrafts.map(d => d.createdBy).filter(Boolean))] as number[];
    const authors = authorIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const authorsMap = Object.fromEntries(authors.map(u => [u.id, u.name]));

    const drafts = rawDrafts.map(d => ({
      ...d,
      createdByName: d.createdBy ? (authorsMap[d.createdBy] ?? null) : null,
    }));

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
    const result = await WarehouseService.getProductsForMovement();
    res.json(result);
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при отриманні товарів для переміщення:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// Отримати доступні партії (batch numbers) по SKU
router.get('/batch-numbers/:sku', authenticateToken, async (req, res) => {
  try {
    const { sku } = req.params;
    const { firmId, asOfDate, force } = req.query;
    const forceRefresh = force === 'true';

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
    const cacheKey = buildBatchCacheKey(sku, finalFirmId, parsedDate);
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

    // Фільтруємо малий склад — переміщення завжди йдуть з основного до малого
    const filteredBatches = batches.filter(b => b.storage !== dilovodConfig.smallStorageId);

    console.log(`✅ [Warehouse] Отримано ${batches.length} партій для SKU: ${sku}, після фільтрації малого складу: ${filteredBatches.length}. Кешуємо на ${ttlLabel}`);

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
    const { skus: skusRaw, asOfDate: asOfDateRaw } = req.query;

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

    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodService = new DilovodService();

    const label = parsedDate ? parsedDate.toLocaleString('uk-UA') : 'поточна';
    console.log(`📊 [Warehouse] GET /stock-snapshot — ${skus.length} SKU на дату: ${label}`);

    const balances = await dilovodService.getStockBalanceForSkus(skus, parsedDate);

    // Перетворюємо на словник { [sku]: { mainStock, smallStock } } для зручності на клієнті
    const result: Record<string, { mainStock: number; smallStock: number }> = {};
    for (const item of balances) {
      result[item.sku] = {
        mainStock: item.mainStorage,
        smallStock: item.smallStorage,
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

// Отримати деталі переміщення за ID
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

    // Перевіряємо що документ існує, належить юзеру і ще не завершений
    const existing = await prisma.warehouseMovement.findFirst({
      where: {
        id: Number(id),
        createdBy: userId,
        status: { in: ['draft', 'active'] },
      },
      select: { id: true, status: true },
    });

    if (!existing) {
      const anyDoc = await prisma.warehouseMovement.findFirst({
        where: { id: Number(id), createdBy: userId },
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

// Отримати документ за ID
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

    res.json(movement);
  } catch (error) {
    console.error('❌ [Warehouse] Error fetching warehouse movement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:id - оновити чернетку
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] PUT /:id - оновлення чернетки...');
    const { id } = req.params;
    const { items, deviations, notes, movementDate } = req.body;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Перевіряємо що документ належить користувачу і не є фіналізованим
    const existingDraft = await prisma.warehouseMovement.findFirst({
      where: {
        id: Number(id),
        createdBy: userId,
        status: { in: ['draft', 'active'] }, // 'finalized' — не редагується
      }
    });

    if (!existingDraft) {
      // Перевіряємо чи документ існує взагалі (щоб дати точне повідомлення)
      const anyDoc = await prisma.warehouseMovement.findFirst({
        where: { id: Number(id), createdBy: userId },
        select: { status: true },
      });
      if (anyDoc?.status === 'finalized') {
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
      deviations,
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

// Створити новий документ
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('🏪 [Warehouse] POST / - створення нового документа...');
    console.log('🏪 [Warehouse] Request body:', JSON.stringify(req.body, null, 2));

    const { items, deviations, sourceWarehouse, destinationWarehouse, notes, movementDate, docNumber, dilovodDocId } = req.body;
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
        where: { OR: orConditions, createdBy: userId },
      });

      if (existingDraft) {
        console.log(`♻️ [Warehouse] Знайдено існуючу чернетку #${existingDraft.id} для dilovodDocId=${dilovodDocId ?? '—'} / docNumber=${docNumber ?? '—'}. Повертаємо її.`);
        return res.status(200).json({ ...existingDraft, _existing: true });
      }
    }

    // Генеруємо унікальний номер документа
    // Використовуємо MAX(id)+1 замість COUNT+1 — щоб уникнути колізій при видаленні записів
    const maxRecord = await prisma.warehouseMovement.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    const nextInternalDocNumber = ((maxRecord?.id ?? 0) + 1).toString().padStart(5, '0');

    const movement = await WarehouseService.createMovement({
      internalDocNumber: nextInternalDocNumber,
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
  } catch (error) {
    console.error('🚨 [Warehouse] Error creating warehouse movement:', error);
    console.error('🚨 [Warehouse] Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /movements/send — формування payload та/або відправка до Діловода
// dryRun=true (default) — тільки повернути payload без відправки
// dryRun=false — реальна відправка до Діловода
// isFinal=false (default) — проміжна відправка, статус → 'active', документ редагується далі
// isFinal=true — фінальна відправка, статус → 'finalized', документ заблоковано
router.post('/movements/send', authenticateToken, async (req, res) => {
  try {
    const { draftId, summaryItems, movementDate, overrides, dryRun = true, isFinal = false } = req.body;
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

    // Валідуємо що всі товари мають dilovodId
    const idValidation = WarehousePayloadBuilder.validateDilovodIds(summaryItems);
    if (!idValidation.valid) {
      return res.status(422).json({
        success: false,
        error: 'Деякі товари не мають ID Діловода',
        details: idValidation.errors,
      });
    }

    // Валідуємо що всі партії мають batchId (Діловод очікує число, порожній batchId = 0 = помилка)
    const missingBatchIds: string[] = [];
    for (const item of summaryItems) {
      for (const batch of item.details.batches) {
        const qty = batch.boxes * item.portionsPerBox + batch.portions;
        if (qty <= 0) continue;
        if (!batch.batchId) {
          missingBatchIds.push(`"${item.name}" (SKU: ${item.sku}, партія: ${batch.batchNumber}) — відсутній ID партії в Діловоді`);
        }
      }
    }
    if (missingBatchIds.length > 0) {
      return res.status(422).json({
        success: false,
        error: 'Деякі партії не мають ID в Діловоді (goodPart)',
        details: missingBatchIds,
      });
    }

    // Завантажуємо налаштування
    const settings = await WarehousePayloadBuilder.loadSettings();

    // Отримуємо dilovodUserId автора
    const authorDilovodId = await WarehousePayloadBuilder.getAuthorDilovodId(userId);

    // Визначаємо дату документа
    const docDate = movementDate ? new Date(movementDate) : (draft.movementDate ?? new Date());

    // Будуємо payload
    const payload = await WarehousePayloadBuilder.buildPayload({
      draft: {
        id: draft.id,
        internalDocNumber: draft.internalDocNumber,
        dilovodDocId: draft.dilovodDocId,
        docNumber: draft.docNumber,
        notes: draft.notes,
      },
      summaryItems,
      settings,
      movementDate: docDate,
      authorDilovodId,
      overrides,
    });

    // Валідуємо payload
    const validation = WarehousePayloadBuilder.validatePayload(payload);
    if (!validation.valid) {
      return res.status(422).json({
        success: false,
        error: 'Помилка валідації payload',
        details: validation.errors,
        warnings: validation.warnings,
      });
    }

    // Dry-run — повертаємо payload без відправки
    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        payload,
        validation,
      });
    }

    // Фактична відправка до Діловода
    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodService = new DilovodService();

    const dilovodResult = await dilovodService.exportToDilovod({
      ...(payload.saveType !== undefined && { saveType: payload.saveType }),
      header: payload.header,
      tableParts: payload.tableParts,
    });

    console.log(`📬 [Warehouse] Відповідь Діловода:`, JSON.stringify(dilovodResult, null, 2));

    // Діловод може повернути 200 OK, але з помилкою в тілі
    if (dilovodResult?.error || dilovodResult?.errorMessage) {
      const rawErrMsg = dilovodResult.error ?? dilovodResult.errorMessage ?? 'Невідома помилка від Діловода';
      const { translateDilovodError, cleanDilovodErrorMessageShort, cleanDilovodErrorMessageFull } = await import('../../services/dilovod/DilovodUtils.js');
      const { title: errorTitle, message: errorMessage } = translateDilovodError(rawErrMsg);
      // Детальне повідомлення для Toast: очищаємо HTML, витягуємо назви товарів, артикули, залишки
      const detailedMessage = cleanDilovodErrorMessageShort(rawErrMsg);
      console.error(`🚨 [Warehouse] Діловод повернув помилку:`, rawErrMsg);

      // Логуємо помилку в meta_logs (аналогічно до DilovodAutoExportService)
      try {
        const { dilovodService } = await import('../../services/dilovod/DilovodService.js');
        await dilovodService.logMetaDilovodExport({
          title: errorTitle,
          status: 'error',
          message: `[Мануал] Помилка відправки переміщення #${draft.internalDocNumber ?? draftId}: ${detailedMessage || errorMessage}`,
          initiatedBy: String(userId),
          data: {
            draftId,
            internalDocNumber: draft.internalDocNumber,
            dilovodDocId: draft.dilovodDocId,
            isFinal,
            error: cleanDilovodErrorMessageFull(rawErrMsg),
            dilovodResponse: dilovodResult,
          },
        });
      } catch (logErr) {
        console.error('🚨 [Warehouse] Помилка запису в meta_logs:', logErr);
      }

      return res.status(422).json({
        success: false,
        errorTitle,
        error: detailedMessage || errorMessage,
        errorFallback: errorMessage,
        dilovodResponse: dilovodResult,
      });
    }

    // Отримуємо ID документа з відповіді Діловода
    const dilovodDocId: string | undefined =
      dilovodResult?.id ??
      dilovodResult?.header?.id ??
      dilovodResult?.header?.id?.id ??
      undefined;

    // Визначаємо номер документа:
    // - якщо це перша відправка (раніше не було dilovodDocId) і Діловод повернув id —
    //   робимо getObject щоб отримати реальний number (Діловод не повертає його в saveObject)
    // - інакше — беремо з payload або з відповіді
    let docNumber: string | undefined =
      dilovodResult?.number ??
      dilovodResult?.header?.number ??
      payload.header.number ??
      undefined;

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
        console.warn(`⚠️ [Warehouse] Не вдалось отримати номер документа з Діловода:`, err);
      }
    }

    // Визначаємо новий статус:
    // isFinal=true → 'finalized' (документ заблоковано)
    // isFinal=false → 'active' (можна продовжувати редагувати)
    const newStatus = isFinal ? 'finalized' : 'active';
    const now = new Date();

    // Оновлюємо запис у БД
    await prisma.warehouseMovement.update({
      where: { id: draft.id },
      data: {
        status: newStatus,
        lastSentToDilovodAt: now,
        // Час першої відправки фіксуємо лише один раз
        ...(isFirstSend && { sentToDilovodAt: now }),
        ...(dilovodDocId != null && { dilovodDocId }),
        ...(docNumber != null && { docNumber }),
      },
    });

    console.log(`✅ [Warehouse] Документ ${draft.id} відправлено до Діловода. ID: ${dilovodDocId}, Номер: ${docNumber}, Статус: ${newStatus}`);

    return res.json({
      success: true,
      dryRun: false,
      isFinal,
      status: newStatus,
      lastSentToDilovodAt: now.toISOString(),
      payload,
      validation,
      dilovodDocId,
      docNumber,
      dilovodResponse: dilovodResult,
    });
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при відправці до Діловода:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера',
    });
  }
});

// Відправити в Dilovod (оновлює статус і фіксує залишки)
router.post('/:id/send', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log(`🏪 [Warehouse] Відправлення документа ${id} в Dilovod...`);

    // Отримуємо документ
    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) }
    });

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    if (movement.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft movements can be sent' });
    }

    // Якщо залишки ще не були оновлені (наприклад, якщо документ був створений до додавання цієї логіки),
    // оновлюємо їх зараз
    if (movement.items && Array.isArray(movement.items) && movement.items.length > 0) {
      for (const item of movement.items) {
        const portionsQuantity = item.boxQuantity * item.portionQuantity; // Розрахунок порцій

        try {
          const stockUpdateResult = await WarehouseService.updateProductStock(
            item.sku,
            movement.sourceWarehouse,
            movement.destinationWarehouse,
            portionsQuantity
          );

          await WarehouseService.createStockMovementHistory({
            sku: item.sku,
            sourceWarehouse: movement.sourceWarehouse,
            destinationWarehouse: movement.destinationWarehouse,
            movedPortions: portionsQuantity,
            boxQuantity: item.boxQuantity,
            portionQuantity: item.portionQuantity,
            batchNumber: item.batchNumber,
            movementId: movement.id,
            userId: userId,
            stockUpdateResult
          });
        } catch (error) {
          console.error(`🚨 [Warehouse] Error processing item ${item.sku}:`, error);
          // Продовжуємо з іншими товарами, але логгуємо помилку
        }
      }
    }

    // Оновлюємо статус документа
    const updatedMovement = await WarehouseService.sendToDilovod(movement.id, 'Dilovod Doc Number'); // Тут треба передати реальний номер

    console.log(`✅ [Warehouse] Документ ${id} відправлено в Dilovod`);
    res.json(updatedMovement);
  } catch (error) {
    console.error('🚨 [Warehouse] Помилка при відправці документа складу:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});


// DELETE /:id - видалити чернетку та скасувати переміщення залишків
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || (req as any).user?.id;

    console.log(`🗑️ [Warehouse] Видалення чернетки ${id}...`);

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: 'Invalid movement ID' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Отримуємо документ
    const movement = await prisma.warehouseMovement.findUnique({
      where: { id: Number(id) }
    });

    if (!movement) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    // Перевіряємо, що документ належить користувачу і має статус draft
    if (movement.createdBy !== userId || movement.status !== 'draft') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Якщо залишки були оновлені, скасовуємо переміщення
    if (movement.items && Array.isArray(movement.items) && movement.items.length > 0) {
      for (const item of movement.items) {
        const portionsQuantity = item.boxQuantity * item.portionQuantity;

        try {
          await WarehouseService.revertStockMovement({
            sku: item.sku,
            sourceWarehouse: movement.sourceWarehouse,
            destinationWarehouse: movement.destinationWarehouse,
            portionsToReturn: portionsQuantity,
            movementId: movement.id,
            userId: userId
          });
        } catch (error) {
          console.error(`🚨 [Warehouse] Error reverting item ${item.sku}:`, error);
          // Продовжуємо з іншими товарами
        }
      }
    }

    // Видаляємо документ
    await prisma.warehouseMovement.delete({
      where: { id: Number(id) }
    });

    console.log(`✅ [Warehouse] Чернетку ${id} видалено`);
    res.json({ message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('🚨 [Warehouse] Error deleting draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ІНВЕНТАРИЗАЦІЯ
// ============================================================================

// GET /api/warehouse/inventory/products
// Повертає список товарів з ненульовим залишком на малому складі ("2")
// Використовується сторінкою інвентаризації малого складу
router.get('/inventory/products', authenticateToken, async (req, res) => {
  try {
    console.log('📦 [Warehouse] GET /inventory/products — завантаження товарів малого складу...');

    const products = await prisma.product.findMany({
      where: {
        stockBalanceByStock: { not: null },
        isOutdated: false,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        portionsPerBox: true,
        categoryName: true,
        stockBalanceByStock: true,
      },
      orderBy: [
        { manualOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    // Фільтруємо: тільки ті, у кого є залишок на малому складі ("2")
    const result = products
      .map(product => {
        try {
          const stockBalance = product.stockBalanceByStock
            ? JSON.parse(product.stockBalanceByStock)
            : {};
          const smallStockPortions = stockBalance["2"] || 0;

          if (smallStockPortions > 0) {
            return {
              id: product.id,
              sku: product.sku,
              name: product.name,
              portionsPerBox: product.portionsPerBox,
              categoryName: product.categoryName,
              currentStock: smallStockPortions,
              expectedBoxes: Math.floor(smallStockPortions / product.portionsPerBox),
              expectedRemainder: smallStockPortions % product.portionsPerBox
            };
          }
          return null;
        } catch (error) {
          console.warn(`Failed to parse stock for product ${product.sku}:`, error);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`✅ [Warehouse] Знайдено ${result.length} товарів на малому складі`);
    res.json({ products: result, total: result.length });
  } catch (error) {
    console.error('🚨 [Warehouse] Error fetching inventory products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/warehouse/inventory/materials
// Повертає список матеріалів з ненульовим залишком на малому складі ("2")
// Використовується сторінкою інвентаризації малого складу
router.get('/inventory/materials', authenticateToken, async (req, res) => {
  try {
    console.log('📦 [Warehouse] GET /inventory/materials — завантаження матеріалів малого складу...');

    const materials = await prisma.material.findMany({
      where: {
        stockBalanceByStock: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        stockBalanceByStock: true,
      },
      orderBy: [
        { manualOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    // Фільтруємо: тільки ті, у кого є залишок на малому складі ("2")
    const result = materials
      .map(material => {
        try {
          const stockBalance = material.stockBalanceByStock
            ? JSON.parse(material.stockBalanceByStock)
            : {};
          const smallStockPortions = stockBalance["2"] || 0;

          if (smallStockPortions > 0) {
            return {
              id: material.id,
              sku: material.sku,
              name: material.name,
              currentStock: smallStockPortions
            };
          }
          return null;
        } catch (error) {
          console.warn(`Failed to parse stock for material ${material.sku}:`, error);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`✅ [Warehouse] Знайдено ${result.length} матеріалів на малому складі`);
    res.json({ materials: result, total: result.length });
  } catch (error) {
    console.error('🚨 [Warehouse] Error fetching inventory materials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// ІСТОРІЯ ТА ЗАЛИШКИ
// ============================================================================

// Отримати історію руху залишків
router.get('/stock/history', authenticateToken, async (req, res) => {
  try {
    const { sku, warehouse, movementType, startDate, endDate, page = 1, limit = 50 } = req.query;

    const where: any = {};
    if (sku) where.productSku = sku;
    if (warehouse) where.warehouse = warehouse;
    if (movementType) where.movementType = movementType;
    if (startDate || endDate) {
      where.movementDate = {};
      if (startDate) where.movementDate.gte = new Date(startDate as string);
      if (endDate) where.movementDate.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [history, total] = await Promise.all([
      prisma.stockMovementHistory.findMany({
        where,
        orderBy: { movementDate: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.stockMovementHistory.count({ where })
    ]);

    res.json({
      history,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching stock history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати поточні залишки по складах
router.get('/stock/current', authenticateToken, async (req, res) => {
  try {
    const { warehouse } = req.query;

    const where: any = {};
    if (warehouse) where.warehouse = warehouse;

    const currentStock = await prisma.stockMovementHistory.groupBy({
      by: ['productSku', 'warehouse'],
      _max: {
        movementDate: true
      }
    });

    // Отримуємо останні записи для кожного SKU і складу
    const stockData = await Promise.all(
      currentStock.map(async (item) => {
        const lastRecord = await prisma.stockMovementHistory.findFirst({
          where: {
            productSku: item.productSku,
            warehouse: item.warehouse,
            movementDate: item._max.movementDate
          }
        });
        return lastRecord;
      })
    );

    res.json(stockData.filter(Boolean));
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;