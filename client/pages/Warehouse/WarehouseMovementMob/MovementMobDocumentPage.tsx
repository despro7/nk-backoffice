import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate, useParams } from 'react-router-dom';
import MovementMobEditorPage from './MovementMobEditorPage';
import { useWarehouseMovementMobDocument } from './useWarehouseMovementMobDocument';

export default function MovementMobDocumentPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const numericId = id && !Number.isNaN(Number(id)) ? Number(id) : null;
  const { document } = useWarehouseMovementMobDocument(numericId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-3 md:px-0 mb-3">
        <Button
          isIconOnly
          size="md"
          variant="flat"
          className="bg-neutral-300 text-neutral-500"
          aria-label="Назад до списку"
          onPress={() => navigate('/warehouse/movement-mob')}
        >
          <DynamicIcon name="arrow-left" size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-bold text-default-900 truncate">
            {document?.displayNumber ?? 'Переміщення'}
          </h1>
          <p className="text-xs text-default-400 truncate">Деталі переміщення між складами</p>
        </div>
      </div>

      {numericId == null ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-danger px-4 text-center">
          <DynamicIcon name="circle-alert" size={28} />
          <p className="text-sm">Некоректний ідентифікатор документа</p>
        </div>
      ) : (
        <MovementMobEditorPage documentId={numericId} />
      )}
    </div>
  );
}
