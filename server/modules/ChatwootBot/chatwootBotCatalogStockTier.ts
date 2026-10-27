import type { ChatwootBotCatalogStockTier } from '../../../shared/types/chatwootBotTools.js';

export function stockTierFromEffective(effective: number): ChatwootBotCatalogStockTier {
  if (effective <= 0) return 'out_of_stock';
  if (effective <= 50) return 'exact';
  if (effective <= 100) return 'low';
  return 'enough';
}

export function stockTierLabel(tier: ChatwootBotCatalogStockTier, effective?: number): string {
  switch (tier) {
    case 'out_of_stock':
      return 'немає в наявності';
    case 'exact':
      return effective != null ? `приблизно ${effective} порцій` : 'обмежена наявність';
    case 'low':
      return 'закінчується';
    case 'enough':
      return 'достатньо';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}
