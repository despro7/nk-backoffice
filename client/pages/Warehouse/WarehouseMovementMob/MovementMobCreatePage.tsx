import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import MovementMobEditorPage from './MovementMobEditorPage';

export default function MovementMobCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-3 md:px-0 mb-3">
        <Button
          isIconOnly
          variant="flat"
          size="md"
          aria-label="Назад до списку"
          onPress={() => navigate('/warehouse/movement-mob')}
        >
          <DynamicIcon name="arrow-left" size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-semibold text-default-900 truncate">Нове переміщення</h1>
          <p className="text-xs text-default-400 truncate">Створення документа між складами</p>
        </div>
      </div>

      <MovementMobEditorPage documentId={null} />
    </div>
  );
}
