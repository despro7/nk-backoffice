import type { ReactNode } from 'react';
import ResultDrawer from '@/components/ResultDrawer';
import { useOrderDetailsDrawer } from '@/components/notifications/useOrderDetailsDrawer';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { ToastService } from '@/services/ToastService';
import { PERMISSIONS } from '@shared/constants/permissions';
import { deviationForScope } from '@shared/utils/inventoryDeviation';
import type { InventorySession } from '../WarehouseInventoryTypes';
import { resolveSessionWarehouseScope } from '../inventoryHistoryGroups';
import { useDeviationHints } from '../useDeviationHints';
import InventoryDeviationHintsBanner from './InventoryDeviationHintsBanner';

interface InventoryDeviationHintsProps {
  session: InventorySession;
  /** Обгортка навколо банера (рамка, відступи) – різна для панелі й історії. */
  className?: string;
  /** Додаткова мітка в заголовку банера (напр. склад у зведеній МС + ГП). */
  badge?: ReactNode;
}

/** Ймовірні причини відхилень сесії: запит лише коли є відхилення і сесія не видалена. */
export const InventoryDeviationHints = ({ session, className, badge }: InventoryDeviationHintsProps) => {
  const scope = resolveSessionWarehouseScope(session);
  const hasDeviation = (session.items as any[]).some((it) => {
    const dev = deviationForScope(it, scope);
    return dev !== null && dev !== 0;
  });
  const enabled = hasDeviation && session.status !== 'removed';
  const hints = useDeviationHints(session.id, enabled);
  const orderDrawer = useOrderDetailsDrawer();
  const { hasPermission } = useRoleAccess();
  // Той самий API, що й у сповіщеннях: потрібен доступ до експорту Діловода
  const canOpenOrder = hasPermission(PERMISSIONS.ACTION_DILOVOD_EXPORT);

  const openOrder = (orderNumber: string) => {
    void orderDrawer.open(orderNumber).then((ok) => {
      if (!ok) ToastService.show({ title: `Замовлення ${orderNumber} не знайдено`, color: 'warning' });
    });
  };

  if (!enabled) return null;
  if (!hints.isLoading && (hints.isError || !hints.data)) return null;

  const banner = (
    <InventoryDeviationHintsBanner
      data={hints.data}
      isLoading={hints.isLoading}
      isError={hints.isError}
      badge={badge}
      onOpenOrder={canOpenOrder ? openOrder : undefined}
    />
  );
  return (
    <>
      {className ? <div className={className}>{banner}</div> : banner}
      <ResultDrawer
        isOpen={orderDrawer.state.isOpen}
        onOpenChange={(open) => {
          if (!open) orderDrawer.close();
        }}
        result={orderDrawer.state.result}
        title={orderDrawer.state.title}
        type="orderDetails"
        getChannelName={orderDrawer.getChannelName}
      />
    </>
  );
};

export default InventoryDeviationHints;
