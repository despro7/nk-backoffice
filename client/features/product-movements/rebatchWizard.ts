/** Параметри запуску wizard коригування (комплектування / releases). */
export interface RebatchWizardLaunchParams {
  sku: string;
  dilovodGoodId?: string | null;
  productName?: string | null;
  storageId?: string | null;
  firmId?: string | null;
  goodPartId?: string | null;
  /** Після вибору товару — «Заповнити всі партії». Default: true. */
  autoFillBatches?: boolean;
}

export const REBATCH_WIZARD_PATH = '/warehouse/releases';

export function buildRebatchWizardHref(params: RebatchWizardLaunchParams): string {
  const search = buildRebatchWizardSearchParams(params);
  return `${REBATCH_WIZARD_PATH}?${search.toString()}`;
}

export function buildRebatchWizardSearchParams(params: RebatchWizardLaunchParams): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('rebatch', '1');
  sp.set('sku', params.sku.trim());
  if (params.dilovodGoodId?.trim()) sp.set('goodId', params.dilovodGoodId.trim());
  if (params.productName?.trim()) sp.set('productName', params.productName.trim());
  if (params.storageId?.trim()) sp.set('storageId', params.storageId.trim());
  if (params.firmId?.trim()) sp.set('firmId', params.firmId.trim());
  if (params.goodPartId?.trim()) sp.set('goodPartId', params.goodPartId.trim());
  if (params.autoFillBatches === false) sp.set('autoFill', '0');
  return sp;
}

export function parseRebatchWizardSearchParams(
  searchParams: URLSearchParams,
): RebatchWizardLaunchParams | null {
  if (searchParams.get('rebatch') !== '1') return null;
  const sku = String(searchParams.get('sku') ?? '').trim();
  if (!sku) return null;

  return {
    sku,
    dilovodGoodId: searchParams.get('goodId'),
    productName: searchParams.get('productName'),
    storageId: searchParams.get('storageId'),
    firmId: searchParams.get('firmId'),
    goodPartId: searchParams.get('goodPartId'),
    autoFillBatches: searchParams.get('autoFill') !== '0',
  };
}

export async function fetchRebatchSourceProduct(sku: string): Promise<Record<string, unknown>> {
  const resp = await fetch(
    `/api/products/batch?skus=${encodeURIComponent(sku)}&fields=name,sku,set,dilovodId,isGroup`,
    { credentials: 'include' },
  );
  const json = await resp.json().catch(() => ({}));
  const product = Array.isArray(json?.products) ? json.products[0] : null;
  if (!resp.ok || !product || typeof product !== 'object') {
    throw new Error('Не вдалося завантажити товар для Rebatch');
  }
  return product as Record<string, unknown>;
}
