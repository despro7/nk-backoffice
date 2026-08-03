import { Router } from 'express';
import productsRouter from '../modules/Products/ProductsController.js';

/** Products 2.0 — /api/catalog/* (tree, goods CRUD, archive/restore/trash, move). */
const router = Router();
router.use('/', productsRouter);

export default router;
