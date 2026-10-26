import { useEffect, useMemo, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import type { WarehouseDocumentEditOpenParams } from '../types';
import { resolveWarehouseDocumentKind } from '../resolveWarehouseDocumentKind';
import { fetchWarehouseDocumentEditContext } from '../api/fetchWarehouseDocumentEditContext';
import type { WarehouseDocumentEditContextResponse } from '@shared/types/warehouseDocumentEdit';
import MovementV2DilovodEditDrawer from './MovementV2DilovodEditDrawer';
import GoodDocumentDilovodEditDrawer from './GoodDocumentDilovodEditDrawer';
import ReleaseDilovodEditDrawer from './ReleaseDilovodEditDrawer';
import SaleReturnDilovodEditDrawer from './SaleReturnDilovodEditDrawer';
import ShipmentDocumentViewPanel from './ShipmentDocumentViewPanel';
import DilovodDocumentViewSections from './DilovodDocumentViewSections';

const WIDTH_STORAGE_KEY = 'warehouse-document-edit-drawer-width-v1';
const DEFAULT_WIDTH = 920;
const MIN_WIDTH = 640;
const MAX_WIDTH = 1200;
const STACK_LEVEL = 1;

interface WarehouseDocumentEditDrawerProps {
  isOpen: boolean;
  params: WarehouseDocumentEditOpenParams | null;
  onClose: () => void;
}

function ShipmentReadOnlyDrawer({
  isOpen,
  title,
  context,
  loading,
  error,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  context: WarehouseDocumentEditContextResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  let body: React.ReactNode;
  if (loading) {
    body = <Spinner label="Завантаження відвантаження..." className="py-16" />;
  } else if (error) {
    body = <p className="text-sm text-danger">{error}</p>;
  } else if (context) {
    body = <ShipmentDocumentViewPanel context={context} />;
  } else {
    body = null;
  }

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement="right"
      stackLevel={STACK_LEVEL}
      widthStorageKey={WIDTH_STORAGE_KEY}
      defaultWidth={DEFAULT_WIDTH}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      resizeAriaLabel="Змінити ширину панелі документа"
      footer={<Button variant="light" onPress={onClose}>Закрити</Button>}
    >
      {body}
    </ResizableAppDrawer>
  );
}

export default function WarehouseDocumentEditDrawer({
  isOpen,
  params,
  onClose,
}: WarehouseDocumentEditDrawerProps) {
  const [context, setContext] = useState<WarehouseDocumentEditContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = params?.documentLabel?.trim() || 'Документ';

  const kind = useMemo(
    () => (params
      ? resolveWarehouseDocumentKind(params.documentLabel, params.documentTypeId)
      : 'unknown'),
    [params],
  );

  useEffect(() => {
    if (!isOpen || !params?.dilovodDocumentId) {
      setContext(null);
      setError(null);
      return;
    }

    if (kind === 'goodMoving') {
      setContext(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchWarehouseDocumentEditContext(
      params.dilovodDocumentId,
      params.documentLabel,
      params.documentTypeId,
    )
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не вдалося завантажити документ');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, params?.dilovodDocumentId, params?.documentLabel, params?.documentTypeId, kind]);

  if (kind === 'goodMoving' && params) {
    return (
      <MovementV2DilovodEditDrawer
        isOpen={isOpen}
        title={title}
        dilovodDocumentId={params.dilovodDocumentId}
        onClose={onClose}
      />
    );
  }

  if (kind === 'writeOff') {
    return (
      <GoodDocumentDilovodEditDrawer
        isOpen={isOpen}
        title={title}
        variant="writeOff"
        context={context}
        loading={loading}
        error={error}
        onClose={onClose}
      />
    );
  }

  if (kind === 'surplus') {
    return (
      <GoodDocumentDilovodEditDrawer
        isOpen={isOpen}
        title={title}
        variant="surplus"
        context={context}
        loading={loading}
        error={error}
        onClose={onClose}
      />
    );
  }

  if (kind === 'release') {
    return (
      <ReleaseDilovodEditDrawer
        isOpen={isOpen}
        title={title}
        context={context}
        loading={loading}
        error={error}
        onClose={onClose}
      />
    );
  }

  if (kind === 'saleReturn') {
    return (
      <SaleReturnDilovodEditDrawer
        isOpen={isOpen}
        title={title}
        context={context}
        loading={loading}
        error={error}
        onClose={onClose}
      />
    );
  }

  if (kind === 'shipment') {
    const shipmentTitle = context?.shipmentOrder?.orderNumber
      ? `Деталі замовлення ${context.shipmentOrder.orderNumber}`
      : title;
    return (
      <ShipmentReadOnlyDrawer
        isOpen={isOpen}
        title={shipmentTitle}
        context={context}
        loading={loading}
        error={error}
        onClose={onClose}
      />
    );
  }

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement="right"
      stackLevel={STACK_LEVEL}
      widthStorageKey={WIDTH_STORAGE_KEY}
      defaultWidth={DEFAULT_WIDTH}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      resizeAriaLabel="Змінити ширину панелі документа"
      footer={<Button variant="light" onPress={onClose}>Закрити</Button>}
    >
      {loading ? (
        <Spinner label="Завантаження..." className="py-16" />
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <DilovodDocumentViewSections dilovod={context?.dilovod ?? null} />
      )}
    </ResizableAppDrawer>
  );
}
