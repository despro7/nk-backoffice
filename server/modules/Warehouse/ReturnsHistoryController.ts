import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { resolveAuthorNames } from '../../lib/utils.js';
import { authenticateToken, requireMinRole } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';

const router = Router();

// ============================================================================
// ІСТОРІЯ ПОВЕРНЕНЬ (Warehouse Return History)
// ============================================================================

/**
 * GET /api/warehouse/returns/prepare
 * Підготувати повернення для замовлення
 */
router.get('/prepare', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const orderId = req.query.orderId as string;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId is required' });
    }

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        ttn: true,
        orderDate: true,
        dilovodSaleExportDate: true,
        dilovodDocId: true,
        dilovodReturnDate: true,
        dilovodReturnDocsCount: true,
        items: true,
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Замовлення не знайдено' });
    }

    if (order.dilovodReturnDate || (order.dilovodReturnDocsCount ?? 0) > 0) {
      const countLabel = order.dilovodReturnDocsCount && order.dilovodReturnDocsCount > 1
        ? ` (${order.dilovodReturnDocsCount} документи)`
        : '';
      return res.status(400).json({
        success: false,
        error: 'already_returned_in_dilovod',
        message: `Замовлення вже має документ повернення${countLabel}`,
      });
    }

    const baseDocId = order.dilovodDocId;
    if (!baseDocId) {
      return res.status(400).json({ success: false, error: 'Замовлення ще не має повʼязаного документа в Dilovod' });
    }

    const { dilovodExportBuilder } = await import('../../services/dilovod/DilovodExportBuilder.js');
    const prepareData = await dilovodExportBuilder.prepareReturn(String(order.id));

    const orderDate = order.dilovodSaleExportDate ?? order.orderDate ?? null;
    res.json({
      success: true,
      data: {
        ...prepareData,
        ttn: order.ttn || null,
        orderDate: orderDate ? orderDate.toISOString() : null,
        dilovodSaleExportDate: order.dilovodSaleExportDate ? order.dilovodSaleExportDate.toISOString() : null,
      },
    });
  } catch (error) {
    console.log('🚨 [Warehouse] Помилка підготовки повернення:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/warehouse/returns/send
 * Оприбуткування повернення від покупця в Діловод
 */
router.post('/send', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { orderId, items, comment, reason, dryRun } = req.body;

    if (!orderId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'orderId та items обовʼязкові' });
    }

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      select: { id: true, dilovodDocId: true, dilovodReturnDate: true, dilovodReturnDocsCount: true },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Замовлення не знайдено' });
    }

    // Перевірка на дублювання оприбуткування
    if (order.dilovodReturnDate || (order.dilovodReturnDocsCount ?? 0) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Це замовлення вже було оприбутковано в Діловод (дублювання повернення)' 
      });
    }

    const baseDocId = order.dilovodDocId;
    if (!baseDocId) {
      return res.status(400).json({ success: false, error: 'Замовлення ще не відправлено в Діловод (немає baseDoc)' });
    }

    const userId = (req as any).user?.userId || (req as any).user?.id;

    const { dilovodExportBuilder } = await import('../../services/dilovod/DilovodExportBuilder.js');
    const { payload, warnings } = await dilovodExportBuilder.buildReturnPayload(
      userId,
      String(orderId),
      baseDocId,
      comment,
      reason,
      items.map((item: any) => ({
        sku: item.sku,
        batchId: item.batchId,
        quantity: Number(item.quantity),
        price: Number(item.price),
      }))
    );

    if (dryRun === true) {
      return res.json({ success: true, payload, warnings });
    }

    // Перевірка в Dilovod API: чи вже існує documents.saleReturn (захист від дублів)
    console.log(`🔍 [Returns] Перевіряємо в Dilovod API наявність документа повернення для замовлення ${orderId} (baseDoc: ${baseDocId}) перед відправкою...`);
    try {
      const { DilovodService: DilovodServiceCheck } = await import('../../services/dilovod/DilovodService.js');
      const dilovodServiceCheck = new DilovodServiceCheck();
      const existingReturnDocs = await dilovodServiceCheck.getDocuments([baseDocId], 'saleReturn');
      if (existingReturnDocs.length > 0) {
        const returnDoc = existingReturnDocs[0];
        const returnCount = existingReturnDocs.length;
        console.log(`⚠️ [Returns] В Dilovod вже існує ${returnCount} документ(ів) повернення для замовлення ${orderId} (return id: ${returnDoc.id}) — синхронізуємо та блокуємо`);
        
        // Синхронізуємо локальну БД
        await prisma.order.update({
          where: { id: Number(orderId) },
          data: {
            dilovodReturnDate: new Date(returnDoc.date || new Date()).toISOString(),
            dilovodReturnDocsCount: returnCount,
          },
        });
        
        return res.status(409).json({
          success: false,
          error: 'already_returned_in_dilovod',
          message: `В Dilovod вже існує ${returnCount} документ(ів) повернення для цього замовлення ${returnCount > 1 ? ' (ПЕРЕВІРТЕ НА ДУБЛІКАТИ!)' : ''}. Локальну БД синхронізовано. Повторне оприбуткування заблоковано.`,
          data: {
            returnDocId: returnDoc.id,
            returnDocDate: returnDoc.date,
            returnDocsCount: returnCount,
          },
        });
      }
    } catch (checkError) {
      // Якщо перевірка не вдалася — логуємо, але не блокуємо
      console.log(`⚠️ [Returns] Не вдалося перевірити наявність documents.saleReturn для замовлення ${orderId} в Dilovod API: ${checkError instanceof Error ? checkError.message : checkError}. Продовжуємо оприбуткування.`);
    }

    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodService = new DilovodService();
    const result = await dilovodService.exportToDilovod(payload);

    if (result) {
      console.log(`✅ [Returns] Dilovod API response:`, JSON.stringify(result).substring(0, 500));
    }

    if (result?.error) {
      console.log(`❌ [Returns] Помилка відправки в Dilovod: ${result.error}`);
      return res.status(422).json({ success: false, error: result.error, warnings });
    }

    // Витягуємо ID документа з відповіді Dilovod
    const dilovodDocId = result?.id || null;
    if (dilovodDocId) {
      console.log(`✅ [Returns] Dilovod document ID: ${dilovodDocId}`);
    }

    // Оновити дату та лічильник оприбуткування в БД
    const updateResult = await prisma.order.update({
      where: { id: Number(orderId) },
      data: {
        dilovodReturnDate: new Date(),
        dilovodReturnDocsCount: { increment: 1 },
      },
    });

    // Створити запис в історії повернень
    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      const userName = (req as any).user?.name;
      
      // Отримати додаткові дані замовлення
      const orderDetails = await prisma.order.findUnique({
        where: { id: Number(orderId) },
        select: { orderNumber: true, ttn: true, orderDate: true }
      });

      const historyRecord = await prisma.warehouseReturnHistory.create({
        data: {
          orderId: Number(orderId),
          orderNumber: orderDetails?.orderNumber || `order_${orderId}`,
          ttn: orderDetails?.ttn || null,
          firmId: null,
          firmName: null,
          orderDate: orderDetails?.orderDate || null,
          items: JSON.stringify(items),
          returnReason: reason || '',
          customReason: null,
          comment: comment || null,
          payload: JSON.stringify(payload),
          returnNumber: dilovodDocId, // Зберігаємо ID документа Dilovod
          createdBy: userId,
          createdByName: userName || null,
        },
      });
      
      console.log(`✅ [Returns] Created history record ${historyRecord.id} with returnNumber: ${dilovodDocId}`);
    } catch (historyError) {
      console.log(`⚠️ [Returns] Failed to create history record:`, historyError);
      // Не блокуємо основний процес, якщо історія не створилася
    }

    console.log(`✅ Повернення для замовлення ${orderId} успішно відправлено в Діловод`);
    res.json({ 
      success: true, 
      payload, 
      dilovodResponse: result, 
      returnNumber: dilovodDocId, // Повертаємо ID документа Dilovod
      warnings 
    });
  } catch (error) {
    console.log('🚨 [Returns] Помилка відправки повернення:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/warehouse/returns/history
 * Отримати історію повернень (всі користувачі)
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const userRole = (req as any).user?.role;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const history = await prisma.warehouseReturnHistory.findMany({
      where: {
        // Всі записи (читання для всіх, видалення тільки для адміна)
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Розшифрувати імена авторів
    const enrichedHistory = await resolveAuthorNames(history);

    res.json({
      success: true,
      data: enrichedHistory,
    });
  } catch (error) {
    console.log('Error fetching return history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/warehouse/returns/history
 * Зберегти запис про повернення (викликати після успішної відправки)
 */
router.post('/history', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const userRole = (req as any).user?.role;
    const userName = (req as any).user?.name;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      orderId,
      orderNumber,
      ttn,
      firmId,
      firmName,
      orderDate,
      items,
      returnReason,
      customReason,
      comment,
      payload,
      returnNumber, // ID документа з Dilovod API
    } = req.body;

    if (!orderId || !orderNumber || !items || !returnReason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Перевіряємо, чи вже існує запис для цього замовлення
    const existingRecord = await prisma.warehouseReturnHistory.findFirst({
      where: { orderId: Number(orderId) },
      orderBy: { createdAt: 'desc' },
    });

    let record;
    if (existingRecord) {
      // Оновлюємо існуючий запис
      record = await prisma.warehouseReturnHistory.update({
        where: { id: existingRecord.id },
        data: {
          orderNumber,
          ttn: ttn || null,
          firmId: firmId || null,
          firmName: firmName || null,
          orderDate: orderDate ? new Date(orderDate) : null,
          items: JSON.stringify(items),
          returnReason,
          customReason: customReason || null,
          comment: comment || null,
          payload: JSON.stringify(payload),
          returnNumber: returnNumber || existingRecord.returnNumber, // Зберігаємо ID документа з Dilovod
          createdBy: userId,
          createdByName: userName || null,
        },
      });
      console.log(`✅ [Returns] Updated history record ${record.id} with returnNumber: ${returnNumber}`);
    } else {
      // Створюємо новий запис (fallback, якщо POST /send ще не створив)
      record = await prisma.warehouseReturnHistory.create({
        data: {
          orderId: Number(orderId),
          orderNumber,
          ttn: ttn || null,
          firmId: firmId || null,
          firmName: firmName || null,
          orderDate: orderDate ? new Date(orderDate) : null,
          items: JSON.stringify(items),
          returnReason,
          customReason: customReason || null,
          comment: comment || null,
          payload: JSON.stringify(payload),
          returnNumber: returnNumber || null,
          createdBy: userId,
          createdByName: userName || null,
        },
      });
      console.log(`✅ [Returns] Created new history record ${record.id} with returnNumber: ${returnNumber}`);
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.log('Error saving return history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/warehouse/returns/history/:id
 * Видалити запис про повернення (тільки адміністратор)
 * Фікс: парсити id як Number, отримати orderId із запису повернення,
 * скинути order.dilovodReturnDate = null та dilovodReturnDocsCount = 0 у відповідному замовленні
 */
router.delete('/history/:id', authenticateToken, requireMinRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { dryRun } = req.query; // Параметр для попереднього перегляду
    const returnId = Number(id);

    // Отримати запис повернення
    const returnRecord = await prisma.warehouseReturnHistory.findUnique({
      where: { id: returnId },
    });

    if (!returnRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Отримати відповідне замовлення
    const order = await prisma.order.findUnique({
      where: { id: returnRecord.orderId },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found for this return record' });
    }

    // Отримати baseDocId (dilovodDocId)
    const baseDocId = order.dilovodDocId;
    if (!baseDocId) {
      return res.status(400).json({ error: 'No base document found in Dilovod for this order' });
    }

    // Перевірити, чи є returnNumber для видалення в Dilovod
    if (!returnRecord.returnNumber) {
      console.log(`⚠️ [Returns] No returnNumber found for record ${returnId}, skipping Dilovod deletion`);
      // Просто видаляємо запис локально
      const deleteResult = await prisma.warehouseReturnHistory.delete({
        where: { id: returnId },
      });

      // Скинути статус замовлення
      await prisma.order.update({
        where: { id: returnRecord.orderId },
        data: {
          dilovodReturnDate: null,
          dilovodReturnDocsCount: 0,
        },
      });

      return res.json({
        success: true,
        data: deleteResult,
        message: 'Record deleted locally (no Dilovod ID found)',
      });
    }

    // Побудувати payload для видалення (використовуємо returnNumber як documentId для delMark)
    const payload: any = {
      saveType: 2, // Тип операції для зняття проведення документа в Dilovod
      header: {
        id: returnRecord.returnNumber, // ID документа в Dilovod для видалення
        delMark: 1, // Прапорець для видалення документа в Dilovod
      }
    };
    // Попередження для користувача перед видаленням
    const warnings = [`This will attempt to delete the return document with ID ${returnRecord.returnNumber} in Dilovod`];

    // Якщо dryRun — повертаємо payload без відправки
    if (dryRun === 'true') {
      return res.json({
        success: true,
        dryRun: true,
        payload,
        warnings,
        meta: {
          returnRecordId: returnId,
          orderId: returnRecord.orderId,
          baseDocId,
        },
      });
    }

    // Відправити payload в Dilovod (цей запит не блокується механізмом дублювання)
    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodService = new DilovodService();
    const dilovodResult = await dilovodService.exportToDilovod(payload);

    if (dilovodResult?.error) {
      console.log(`❌ [Returns] Error sending delMark request to Dilovod: ${dilovodResult.error}`);
      return res.status(422).json({
        success: false,
        error: `Failed to send request to Dilovod: ${dilovodResult.error}`,
        warnings,
      });
    }

    // Видалити запис про повернення
    const deleteResult = await prisma.warehouseReturnHistory.delete({
      where: { id: returnId },
    });

    // Скинути статус замовлення
    await prisma.order.update({
      where: { id: returnRecord.orderId },
      data: {
        dilovodReturnDate: null,
        dilovodReturnDocsCount: 0,
      },
    });

    res.json({
      success: true,
      data: deleteResult,
      dilovodResult,
      warnings,
    });
  } catch (error) {
    console.log('Error deleting return history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
