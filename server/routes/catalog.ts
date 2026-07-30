import { Router } from 'express';
import productsRouter from '../modules/Products/ProductsController.js';

const router = Router();
router.use('/', productsRouter);

export default router;
