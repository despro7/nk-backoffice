import { Router } from 'express';
import warehouseRouter from '../modules/Warehouse/WarehouseController.js';

const router = Router();

// Використовуємо роутер з WarehouseController
router.use('/', warehouseRouter);

export default router;
