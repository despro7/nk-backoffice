// SalesDriveCacheService: кешування довідників SalesDrive (канали, методи оплати, доставки)
import { PrismaClient } from '@prisma/client';
import { logServer } from '../../lib/utils.js';
import type { SalesDriveCacheType, SalesDriveCacheStatus } from './SalesDriveTypes.js';

const prisma = new PrismaClient();

const TTL_CACHE_HOURS = 24;

function getCacheKey(type: SalesDriveCacheType) {
  return `salesdrive.cache.${type}`;
}

export class SalesDriveCacheService {
  async getFromCache<T>(type: SalesDriveCacheType): Promise<T | null> {
    const key = getCacheKey(type);
    const record = await prisma.settingsBase.findUnique({ where: { key } });
    if (!record || !record.value) return null;
    // Перевірка TTL
    const lastUpdate = record.updatedAt || record.createdAt;
    if (!lastUpdate) return null;
    const hoursAgo = (Date.now() - new Date(lastUpdate).getTime()) / 1000 / 3600;
    if (hoursAgo > TTL_CACHE_HOURS) return null;
    try {
      return JSON.parse(record.value);
    } catch {
      return null;
    }
  }

  /**
   * Отримати дані з DB незалежно від TTL (для user-managed довідників як канали)
   */
  async getRawFromDB<T>(type: SalesDriveCacheType): Promise<T | null> {
    const key = getCacheKey(type);
    const record = await prisma.settingsBase.findUnique({ where: { key } });
    if (!record || !record.value) return null;
    try {
      return JSON.parse(record.value);
    } catch {
      return null;
    }
  }

  async updateCache<T>(type: SalesDriveCacheType, data: T): Promise<void> {
    const key = getCacheKey(type);
    await prisma.settingsBase.upsert({
      where: { key },
      update: {
        value: JSON.stringify(data),
        category: 'salesdrive',
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        key,
        value: JSON.stringify(data),
        category: 'salesdrive',
        isActive: true,
        description: `Кеш довідника SalesDrive: ${type}`
      }
    });
  }

  async isCacheValid(type: SalesDriveCacheType): Promise<boolean> {
    const key = getCacheKey(type);
    const record = await prisma.settingsBase.findUnique({ where: { key } });
    if (!record || !record.value) return false;
    const lastUpdate = record.updatedAt || record.createdAt;
    if (!lastUpdate) return false;
    const hoursAgo = (Date.now() - new Date(lastUpdate).getTime()) / 1000 / 3600;
    return hoursAgo <= TTL_CACHE_HOURS;
  }

  async getCacheMetadata(type: SalesDriveCacheType) {
    const key = getCacheKey(type);
    const record = await prisma.settingsBase.findUnique({ where: { key } });
    const lastUpdate = record?.updatedAt || record?.createdAt;
    let recordsCount = 0;
    let dataSource: 'none' | 'api' | 'static' | 'expired' = 'none';
    
    try {
      const arr = record?.value ? JSON.parse(record.value) : [];
      recordsCount = Array.isArray(arr) ? arr.length : Object.keys(arr).length;
      
      // Визначаємо джерело даних на основі TTL
      if (lastUpdate) {
        const hoursAgo = (Date.now() - new Date(lastUpdate).getTime()) / 1000 / 3600;
        if (hoursAgo <= 1) {
          dataSource = 'api'; // Дані з API (кеш на 1 годину)
        } else if (hoursAgo <= 24) {
          dataSource = 'static'; // Статичні дані (кеш на 24 години)
        } else {
          dataSource = 'expired'; // Застарілі дані
        }
      }
    } catch {}
    
    return {
      lastUpdate,
      recordsCount,
      dataSource,
      isValid: lastUpdate ? ((Date.now() - new Date(lastUpdate).getTime()) / 1000 / 3600 <= TTL_CACHE_HOURS) : false
    };
  }

  async getAllCacheStatus(): Promise<SalesDriveCacheStatus> {
    return {
      channels: await this.getCacheMetadata('channels'),
      paymentMethods: await this.getCacheMetadata('paymentMethods'),
      shippingMethods: await this.getCacheMetadata('shippingMethods'),
      statuses: await this.getCacheMetadata('statuses')
    };
  }

  /**
   * Очищає всі кеші довідників SalesDrive
   */
  async clearAllCache(): Promise<void> {
    const keys = ['channels', 'paymentMethods', 'shippingMethods', 'statuses'].map(type => getCacheKey(type as SalesDriveCacheType));
    await prisma.settingsBase.deleteMany({
      where: {
        key: {
          in: keys
        }
      }
    });
    logServer('🗑️ [SalesDrive] Cleared all cache entries');
  }

  /**
   * Перевіряє чи всі кеші актуальні
   */
  async areAllCachesValid(): Promise<boolean> {
    const status = await this.getAllCacheStatus();
    return status.channels.isValid && status.paymentMethods.isValid && status.shippingMethods.isValid && status.statuses.isValid;
  }
}

export const salesDriveCacheService = new SalesDriveCacheService();
