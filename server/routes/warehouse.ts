import { Router } from 'express';
import warehouseRouter from '../modules/Warehouse/WarehouseController.js';
import returnsHistoryRouter from '../modules/Warehouse/ReturnsHistoryController.js';

const router = Router();

// Використовуємо роутер з WarehouseController
router.use('/', warehouseRouter);

// Додаткові маршрути для повернень
router.use('/returns', returnsHistoryRouter);

export default router;
