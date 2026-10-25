import { describe, expect, it } from 'vitest';
import {
  isMobMovementStoredItems,
  mergeIncomingPutItemsPreservingMobScan,
} from './warehouseMovementMobItems.js';

describe('warehouseMovementMobItems', () => {
  it('detects mob items by barcode field', () => {
    expect(isMobMovementStoredItems([{ sku: '1', batchId: 'x' }])).toBe(false);
    expect(isMobMovementStoredItems([{ sku: '1', barcode: '' }])).toBe(true);
  });

  it('merge preserves barcode when v2 put strips scan fields', () => {
    const existing = [{
      sku: '01008',
      batchId: '1112200000002209',
      batchNumber: '60917',
      barcode: '2200000001177',
      barcodeKind: 'portion',
      totalPortions: 48,
      receivedTotalPortions: 48,
    }];
    const incoming = [{
      sku: '01008',
      batchId: '1112200000002209',
      batchNumber: '',
      boxQuantity: 2,
      portionQuantity: 0,
      totalPortions: 48,
    }];
    const merged = mergeIncomingPutItemsPreservingMobScan(existing, incoming);
    expect(merged[0].barcode).toBe('2200000001177');
    expect(merged[0].batchNumber).toBe('60917');
    expect(merged[0].totalPortions).toBe(48);
  });
});
