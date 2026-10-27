import { StockBadge, type StockBadgeVariant } from '@/components/StockBadge';

function badgeToVariant(badge: string): StockBadgeVariant | null {
  if (badge === 'МС') return 'ms';
  if (badge === 'ГП') return 'gp';
  return null;
}

/** Короткий бейдж складу (10px) для рядка історії. */
export function HistoryStorageBadge({ badge }: { badge: string }) {
  const variant = badgeToVariant(badge);
  if (!variant) return null;
  return <StockBadge variant={variant} size="9px" className="leading-tight" />;
}
