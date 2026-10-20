import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import type { WarehouseDocumentEditOpenParams } from '../types';
import { resolveWarehouseDocumentKind } from '../resolveWarehouseDocumentKind';
import { canEditWarehouseDocumentKind } from '../warehouseDocumentEditPermissions';
import { WarehouseDocumentEditDrawerContext } from './warehouseDocumentEditDrawerContext.shared';

const WarehouseDocumentEditDrawer = lazy(() => import('../components/WarehouseDocumentEditDrawer'));

export function WarehouseDocumentEditDrawerProvider({ children }: { children: ReactNode }) {
  const { hasPermission } = useRoleAccess();
  const [isOpen, setIsOpen] = useState(false);
  const [params, setParams] = useState<WarehouseDocumentEditOpenParams | null>(null);

  const open = useCallback(
    (next: WarehouseDocumentEditOpenParams) => {
      const id = next.dilovodDocumentId?.trim();
      if (!id) {
        ToastService.show({ title: 'Немає ідентифікатора документа', color: 'warning' });
        return;
      }
      const kind = resolveWarehouseDocumentKind(next.documentLabel, next.documentTypeId);
      if (canEditWarehouseDocumentKind(kind, hasPermission) === false && kind === 'goodMoving') {
        ToastService.show({ title: 'Немає прав на редагування переміщень', color: 'warning' });
        return;
      }
      setParams({ ...next, dilovodDocumentId: id });
      setIsOpen(true);
    },
    [hasPermission],
  );

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <WarehouseDocumentEditDrawerContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <WarehouseDocumentEditDrawer isOpen={isOpen} params={params} onClose={close} />
      </Suspense>
    </WarehouseDocumentEditDrawerContext.Provider>
  );
}

export { useWarehouseDocumentEditDrawer } from './warehouseDocumentEditDrawerContext.shared';
