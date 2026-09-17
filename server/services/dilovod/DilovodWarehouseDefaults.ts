import { prisma } from '../../lib/utils.js';
import {
  DILOVOD_WAREHOUSE_DEFAULTS,
  DILOVOD_SETTINGS_KEYS,
  type DilovodWarehouseDefaults,
} from '../../../shared/types/dilovod.js';

/** Legacy wm_* keys (fallback після міграції в dilovod_warehouse_*) */
const LEGACY_WM_KEYS = {
  businessId: 'wm_businessId',
  unitId: 'wm_unitId',
  accountId: 'wm_accountId',
  setAccountId: 'wm_setAccountId',
} as const;

const ALL_KEYS = [
  DILOVOD_SETTINGS_KEYS.WAREHOUSE_BUSINESS_ID,
  DILOVOD_SETTINGS_KEYS.WAREHOUSE_UNIT_ID,
  DILOVOD_SETTINGS_KEYS.WAREHOUSE_ACCOUNT_ID,
  DILOVOD_SETTINGS_KEYS.WAREHOUSE_SET_ACCOUNT_ID,
  LEGACY_WM_KEYS.businessId,
  LEGACY_WM_KEYS.unitId,
  LEGACY_WM_KEYS.accountId,
  LEGACY_WM_KEYS.setAccountId,
];

/**
 * Складські дефолти Діловода з settings_base.
 * Пріоритет: dilovod_warehouse_* → legacy wm_* → константи DILOVOD_WAREHOUSE_DEFAULTS.
 */
export async function loadDilovodWarehouseDefaults(): Promise<DilovodWarehouseDefaults> {
  const rows = await prisma.settingsBase.findMany({
    where: { key: { in: ALL_KEYS }, isActive: true },
  });

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    businessId:
      map[DILOVOD_SETTINGS_KEYS.WAREHOUSE_BUSINESS_ID]
      || map[LEGACY_WM_KEYS.businessId]
      || DILOVOD_WAREHOUSE_DEFAULTS.businessId,
    unitId:
      map[DILOVOD_SETTINGS_KEYS.WAREHOUSE_UNIT_ID]
      || map[LEGACY_WM_KEYS.unitId]
      || DILOVOD_WAREHOUSE_DEFAULTS.unitId,
    accountId:
      map[DILOVOD_SETTINGS_KEYS.WAREHOUSE_ACCOUNT_ID]
      || map[LEGACY_WM_KEYS.accountId]
      || DILOVOD_WAREHOUSE_DEFAULTS.accountId,
    setAccountId:
      map[DILOVOD_SETTINGS_KEYS.WAREHOUSE_SET_ACCOUNT_ID]
      || map[LEGACY_WM_KEYS.setAccountId]
      || DILOVOD_WAREHOUSE_DEFAULTS.setAccountId,
  };
}
