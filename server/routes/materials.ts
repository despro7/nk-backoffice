import { Router } from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken, requireMinRole, ROLES } from '../middleware/auth.js';

const router = Router();

// GET /api/materials — список матеріалів
router.get('/', authenticateToken, async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const parentId = req.query.parentId as string | undefined;
    const includeInactive = req.query.includeInactive === 'true';

    const where: any = {};
    if (!includeInactive) where.isActive = true;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ];
    }

    if (parentId) {
      where.parentId = parentId;
    }

    const materials = await prisma.material.findMany({
      where,
      orderBy: [{ manualOrder: 'asc' }, { name: 'asc' }],
    });

    // Парсимо залишки для клієнта
    const materialWithStock = materials.map(m => ({
      ...m,
      stockBalanceByStock: m.stockBalanceByStock ? (() => {
        try {
          return JSON.parse(m.stockBalanceByStock);
        } catch (e) {
          console.warn(`Ошибка парсинга stockBalanceByStock для материала ${m.sku}:`, e);
          return null;
        }
      })() : null,
    }));

    res.json({ success: true, materials: materialWithStock });
  } catch (error) {
    console.error('[Materials] GET / error:', error);
    res.status(500).json({ error: 'Помилка отримання матеріалів' });
  }
});

// GET /api/materials/parent-ids — список збережених parent IDs папок
// Формат: { folders: Array<{ id: string; name: string }> }
router.get('/parent-ids', authenticateToken, async (req, res) => {
  try {
    const setting = await prisma.settingsBase.findUnique({
      where: { key: 'materials_parent_ids' },
    });
    const raw = setting ? JSON.parse(setting.value) : [];
    // Підтримуємо старий формат (масив рядків) і новий ({ id, name }[])
    const folders: { id: string; name: string }[] = Array.isArray(raw)
      ? raw.map((item: any) =>
          typeof item === 'string' ? { id: item, name: '' } : item
        )
      : [];
    res.json({ folders });
  } catch (error) {
    console.error('[Materials] GET /parent-ids error:', error);
    res.status(500).json({ error: 'Помилка отримання parent IDs' });
  }
});

// PUT /api/materials/parent-ids — зберегти список parent IDs
router.put('/parent-ids', authenticateToken, requireMinRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { folders } = req.body;
    if (!Array.isArray(folders)) {
      return res.status(400).json({ error: 'folders має бути масивом' });
    }
    await prisma.settingsBase.upsert({
      where: { key: 'materials_parent_ids' },
      update: { value: JSON.stringify(folders) },
      create: {
        key: 'materials_parent_ids',
        value: JSON.stringify(folders),
        description: 'ID батьківських папок матеріалів у Dilovod',
        category: 'materials',
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[Materials] PUT /parent-ids error:', error);
    res.status(500).json({ error: 'Помилка збереження parent IDs' });
  }
});

// POST /api/materials/sync — синхронізація матеріалів з Dilovod за parent IDs
router.post('/sync', authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER), async (req, res) => {
  try {
    const setting = await prisma.settingsBase.findUnique({
      where: { key: 'materials_parent_ids' },
    });
    const raw = setting ? JSON.parse(setting.value) : [];
    const folders: { id: string; name: string }[] = Array.isArray(raw)
      ? raw.map((item: any) =>
          typeof item === 'string' ? { id: item, name: '' } : item
        )
      : [];
    const parentIds = folders.map(f => f.id);

    if (parentIds.length === 0) {
      return res.status(400).json({ error: 'Не вказано жодного parent ID. Додайте ID папок у налаштуваннях.' });
    }

    // Швидкий доступ: parentId → categoryName
    const folderNameMap = new Map<string, string>(folders.map(f => [f.id, f.name]));

    const { DilovodApiClient } = await import('../services/dilovod/DilovodApiClient.js');
    const { DilovodDataProcessor } = await import('../services/dilovod/DilovodDataProcessor.js');
    const apiClient = new DilovodApiClient();
    const dataProcessor = new DilovodDataProcessor(apiClient);
    await new Promise(r => setTimeout(r, 100));

    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const seenDilovodIds = new Set<string>();
    const skusForSync = new Set<string>(); // Збираємо SKU для синхронізації залишків

    try {
      const response = await apiClient.makeRequest<any>({
        version: "0.25",
        action: "request",
        key: (apiClient as any).apiKey,
        params: {
          from: "catalogs.goods",
          fields: {
            id: "id",
            productNum: "sku",
            parent: "parent",
            id__pr: "name",
          },
          filters: [
            {
              alias: "parent",
              operator: "IL",
              value: parentIds
            },
          ],
        },
      });

      const goods: any[] = Array.isArray(response)
        ? response
        : Array.isArray(response?.data) ? response.data : [];

      for (const good of goods) {
        try {
          const dilovodId = String(good.id);
          seenDilovodIds.add(dilovodId);
          const sku = good.sku ? String(good.sku).trim() || null : null;
          const name = good.id__pr || 'Без назви';
          const goodParentId = good.parent ? String(good.parent) : null;
          const categoryName = goodParentId ? (folderNameMap.get(goodParentId) || null) : null;

          const data = {
            name,
            sku: sku ?? undefined,
            parentId: goodParentId,
            categoryName,
            isActive: true,
            lastSyncAt: new Date(),
          };

          const existing = await prisma.material.findUnique({ where: { dilovodId } });
          if (existing) {
            await prisma.material.update({ where: { dilovodId }, data });
            updated++;
          } else {
            await prisma.material.create({ data: { ...data, dilovodId } });
            created++;
          }

          // Збираємо SKU для синхронізації залишків
          if (sku) {
            skusForSync.add(sku);
          }
        } catch (itemErr) {
          errors.push(`good ${good.id}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`);
        }
      }
    } catch (folderErr) {
      errors.push(`sync: ${folderErr instanceof Error ? folderErr.message : String(folderErr)}`);
    }

    // Позначаємо як неактивні матеріали з цих папок, яких більше немає в Dilovod
    if (seenDilovodIds.size > 0) {
      await prisma.material.updateMany({
        where: {
          parentId: { in: parentIds },
          dilovodId: { notIn: Array.from(seenDilovodIds) },
          isActive: true,
        },
        data: { isActive: false },
      });
    }

    // Синхронізація залишків для матеріалів
    if (skusForSync.size > 0) {
      try {
        const skuArray = Array.from(skusForSync);
        const stockResponse = await apiClient.getStockBalance(skuArray, (apiClient as any).config.defaultFirmId);
        const processedStock = dataProcessor.processStockBalance(stockResponse);

        for (const stock of processedStock) {
          try {
            const stockBalance = {
              "1": stock.mainStorage,
              "2": stock.smallStorage
            };
            await prisma.material.updateMany({
              where: { sku: stock.sku },
              data: {
                stockBalanceByStock: JSON.stringify(stockBalance),
              }
            });
          } catch (stockErr) {
            errors.push(`stock for ${stock.sku}: ${stockErr instanceof Error ? stockErr.message : String(stockErr)}`);
          }
        }
      } catch (stockFetchErr) {
        errors.push(`stock fetch: ${stockFetchErr instanceof Error ? stockFetchErr.message : String(stockFetchErr)}`);
      }
    }

    res.json({
      success: true,
      message: `Синхронізовано: створено ${created}, оновлено ${updated}`,
      created,
      updated,
      errors,
    });
  } catch (error) {
    console.error('[Materials] POST /sync error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Помилка синхронізації' });
  }
});

// PUT /api/materials/reorder — масове оновлення порядку після DnD
router.put('/reorder', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { items } = req.body; // [{ id: number, manualOrder: number }]
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items має бути масивом' });
    }
    await Promise.all(
      items.map(({ id, manualOrder }: { id: number; manualOrder: number }) =>
        prisma.material.update({ where: { id }, data: { manualOrder } })
      )
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Materials] PUT /reorder error:', error);
    res.status(500).json({ error: 'Помилка оновлення порядку' });
  }
});

// PUT /api/materials/:id/barcode
router.put('/:id/barcode', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { barcode } = req.body;
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некоректний ID' });
    }
    const material = await prisma.material.update({
      where: { id },
      data: { barcode: barcode?.trim() || null },
    });
    res.json({ success: true, material });
  } catch (error) {
    console.error('[Materials] PUT /:id/barcode error:', error);
    res.status(500).json({ error: 'Помилка оновлення штрих-коду' });
  }
});

export default router;
