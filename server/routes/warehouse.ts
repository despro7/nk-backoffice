import { Router } from 'express';
import warehouseRouter from '../modules/Warehouse/WarehouseController.js';
import returnsHistoryRouter from '../modules/Warehouse/ReturnsHistoryController.js';
import writeOffRouter from '../modules/Warehouse/WriteOffController.js';
import setReleasesRouter from '../modules/Warehouse/SetReleaseController.js';

const router = Router();

// Маршрути для випуску наборів
router.use('/releases', setReleasesRouter);

// Додаткові маршрути для повернень
router.use('/returns', returnsHistoryRouter);

// Маршрути для списань
router.use('/writeoff', writeOffRouter);

// Використовуємо роутер з WarehouseController останнім, щоб його `/:id` не перехоплював підмаршрути
router.use('/', warehouseRouter);

export default router;
