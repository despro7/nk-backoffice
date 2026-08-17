import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate, useParams } from 'react-router-dom';
import MovementMobDocumentScreen, {
  MovementMobDocumentScreenLoading,
} from './components/MovementMobDocumentScreen';
import { useWarehouseMovementMobDocument } from './useWarehouseMovementMobDocument';

export default function MovementMobDocumentPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const numericId = id && !Number.isNaN(Number(id)) ? Number(id) : null;
  const { document, loading, error } = useWarehouseMovementMobDocument(numericId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-3 md:px-0">
        <Button
          isIconOnly
          variant="flat"
          size="sm"
          aria-label="Назад до списку"
          onPress={() => navigate('/warehouse/movement-mob')}
        >
          <DynamicIcon name="arrow-left" size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-default-900 truncate">
            {document?.displayNumber ?? 'Переміщення'}
          </h1>
          <p className="text-xs text-default-400 truncate">Деталі переміщення між складами</p>
        </div>
      </div>

      {loading && <MovementMobDocumentScreenLoading />}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-danger px-4 text-center">
          <DynamicIcon name="circle-alert" size={28} />
          <p className="text-sm">{error}</p>
          <Button
            size="sm"
            variant="flat"
            onPress={() => navigate('/warehouse/movement-mob')}
          >
            До списку
          </Button>
        </div>
      )}

      {!loading && !error && document && <MovementMobDocumentScreen document={document} />}
    </div>
  );
}
