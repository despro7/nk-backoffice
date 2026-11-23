import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const resolveBranch = vi.fn();

vi.mock('../../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prisma: { catalogGood: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));
vi.mock('../../modules/Products/catalogFinishedProductsFolder.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveCatalogStockBranch: (...args: unknown[]) => resolveBranch(...args),
}));

const { DilovodService, StockRefreshInputError } = await import('./DilovodService.js');

function makeService() {
  const service = new DilovodService();
  const getBalance = vi.spyOn(service, 'getBalanceBySkuList').mockResolvedValue([
    { sku: '08001', name: '08001', mainStorage: 0, smallStorage: 101, total: 101 },
  ]);
  const fetchIngredient = vi.spyOn(service, 'fetchStockForGoods').mockResolvedValue(new Map());
  const bulk = vi.fn().mockResolvedValue({ success: true, updated: 1, skipped: 0, errors: [] });
  (service as unknown as { syncManager: { updateProductStockBalancesBulk: typeof bulk } }).syncManager = {
    updateProductStockBalancesBulk: bulk,
  };
  return { service, getBalance, fetchIngredient, bulk };
}

describe('DilovodService.refreshStockForGood', () => {
  beforeEach(() => {
    findUnique.mockReset();
    resolveBranch.mockReset();
  });

  it('готова продукція: залишки лише за SKU цього товару', async () => {
    findUnique.mockResolvedValue({ id: 'g1', sku: ' 08001 ', isGroup: false, parentId: 'f1' });
    resolveBranch.mockResolvedValue('finished');
    const { service, getBalance, fetchIngredient, bulk } = makeService();

    await expect(service.refreshStockForGood('g1')).resolves.toEqual({ branch: 'finished', updated: true });
    expect(getBalance).toHaveBeenCalledWith(['08001']);
    expect(bulk).toHaveBeenCalledWith([expect.objectContaining({ sku: '08001', smallStorage: 101 })]);
    expect(fetchIngredient).not.toHaveBeenCalled();
  });

  it('інгредієнт: залишки СП/ВП за id товару', async () => {
    findUnique.mockResolvedValue({ id: 'i1', sku: null, isGroup: false, parentId: 'f2' });
    resolveBranch.mockResolvedValue('ingredient');
    const { service, getBalance, fetchIngredient } = makeService();

    await expect(service.refreshStockForGood('i1')).resolves.toEqual({ branch: 'ingredient', updated: true });
    expect(fetchIngredient).toHaveBeenCalledWith(['i1']);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('готова продукція без SKU, папка або товар поза гілками: помилка вводу', async () => {
    const { service } = makeService();

    findUnique.mockResolvedValue({ id: 'g2', sku: '', isGroup: false, parentId: 'f1' });
    resolveBranch.mockResolvedValue('finished');
    await expect(service.refreshStockForGood('g2')).rejects.toBeInstanceOf(StockRefreshInputError);

    findUnique.mockResolvedValue({ id: 'f1', sku: null, isGroup: true, parentId: null });
    await expect(service.refreshStockForGood('f1')).rejects.toBeInstanceOf(StockRefreshInputError);

    findUnique.mockResolvedValue({ id: 'p1', sku: 'PK1', isGroup: false, parentId: 'other' });
    resolveBranch.mockResolvedValue(null);
    await expect(service.refreshStockForGood('p1')).rejects.toBeInstanceOf(StockRefreshInputError);
  });
});
