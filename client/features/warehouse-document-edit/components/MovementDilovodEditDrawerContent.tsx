import { useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { useWarehouseMovement } from '@/pages/Warehouse/WarehouseMovement/useWarehouseMovement';
import { MovementEditorView } from '@/pages/Warehouse/WarehouseMovement/components/MovementEditorView';
import { fetchGoodMovingDetailsForEdit } from '../api/fetchGoodMovingDetailsForEdit';
import { goodMovingDocumentFromDetails } from '../utils/goodMovingDocumentFromDetails';

interface MovementDilovodEditDrawerContentProps {
  dilovodDocumentId: string;
  onClose: () => void;
}

const MODAL_OVERLAY_Z = 'z-[2000]';

export default function MovementDilovodEditDrawerContent({
  dilovodDocumentId,
  onClose,
}: MovementDilovodEditDrawerContentProps) {
  const mov = useWarehouseMovement({ initMode: 'embedded' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dilovodDocumentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const details = await fetchGoodMovingDetailsForEdit(dilovodDocumentId);
        if (cancelled) return;
        const doc = goodMovingDocumentFromDetails(dilovodDocumentId, details);
        await mov.loadProducts();
        if (cancelled) return;
        if (doc.storage && doc.storageTo) {
          mov.setStorage(doc.storage);
          mov.setStorageTo(doc.storageTo);
        }
        await mov.loadMovementFromHistory(doc);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не вдалося завантажити документ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dilovodDocumentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-default-500">
        <Spinner label="Завантаження документа з Діловода..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger">
        {error}
      </div>
    );
  }

  return (
    <MovementEditorView
      mov={mov}
      showStartScreen={false}
      modalOverlayZClassName={MODAL_OVERLAY_Z}
      onFinalized={onClose}
    />
  );
}
