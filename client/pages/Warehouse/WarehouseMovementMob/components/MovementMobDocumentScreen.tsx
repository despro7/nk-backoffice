import { useEffect, useMemo, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { ToastService } from '@/services/ToastService';
import type { MovementMobDocumentViewModel } from '../WarehouseMovementMobTypes';
import MovementMobChronology from './MovementMobChronology';
import MovementMobDocumentSummary from './MovementMobDocumentSummary';
import MovementMobProductCard from './MovementMobProductCard';
import MovementMobWarehouseSelectors, {
  type MovementMobStorageOption,
} from './MovementMobWarehouseSelectors';

interface MovementMobDocumentScreenProps {
  document: MovementMobDocumentViewModel;
}

export default function MovementMobDocumentScreen({ document }: MovementMobDocumentScreenProps) {
  const dirsCtx = useDilovodDirectories();
  const isFormation = document.mode === 'formation';

  const storages = useMemo<MovementMobStorageOption[]>(() => {
    const src = Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    return (src || []).map((s: { id: string | number; name?: string }) => ({
      id: String(s.id),
      name: s.name ?? String(s.id),
    }));
  }, [dirsCtx.directories]);

  const [sourceId, setSourceId] = useState(document.sourceStorageId);
  const [destId, setDestId] = useState(document.destStorageId);

  useEffect(() => {
    setSourceId(document.sourceStorageId);
    setDestId(document.destStorageId);
  }, [document.sourceStorageId, document.destStorageId, document.id]);

  const handleSwap = () => {
    setSourceId(destId);
    setDestId(sourceId);
  };

  const handleAddMore = () => {
    ToastService.show({
      title: 'Скоро',
      description: 'Додавання товарів через сканування буде в наступному етапі',
      color: 'primary',
    });
  };

  const handleSend = () => {
    ToastService.show({
      title: 'Скоро',
      description: 'Відправка без Dilovod (підтвердження отримання) буде в наступному етапі',
      color: 'primary',
    });
  };

  return (
    <div className="flex flex-col gap-4 pb-24 px-3 md:px-0">
      <MovementMobWarehouseSelectors
        storages={storages}
        sourceId={sourceId}
        destId={destId}
        onSourceChange={setSourceId}
        onDestChange={setDestId}
        onSwap={handleSwap}
        readOnly={!isFormation}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-default-700">Товари на переміщення</h3>
          {isFormation && (
            <Button
              size="sm"
              color="primary"
              variant="flat"
              startContent={<DynamicIcon name="package-plus" size={16} />}
              onPress={handleAddMore}
            >
              Додати ще
            </Button>
          )}
        </div>

        {document.lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-default-200 bg-white py-10 text-center text-sm text-default-400">
            Немає позицій у документі
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {document.lines.map((line) => (
              <MovementMobProductCard key={line.key} line={line} />
            ))}
          </div>
        )}

        <MovementMobDocumentSummary aggregates={document.aggregates} />
      </section>

      {!isFormation && <MovementMobChronology events={document.chronology} />}

      {isFormation && (
        <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-3 lg:static lg:px-0 lg:z-auto">
          <Button
            fullWidth
            size="lg"
            className="bg-slate-700 text-white h-12 font-medium shadow-lg lg:shadow-none"
            startContent={<DynamicIcon name="send" size={18} />}
            onPress={handleSend}
          >
            Відправити переміщення
          </Button>
        </div>
      )}
    </div>
  );
}

export function MovementMobDocumentScreenLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-500">
      <Spinner size="lg" color="primary" />
      <p className="text-sm">Завантаження документа…</p>
    </div>
  );
}
