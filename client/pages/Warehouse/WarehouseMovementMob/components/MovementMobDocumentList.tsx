import { Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobListCardViewModel } from '../WarehouseMovementMobTypes';
import MovementMobDocumentCard from './MovementMobDocumentCard';

interface MovementMobDocumentListProps {
  cards: MovementMobListCardViewModel[];
  loading: boolean;
  error: string | null;
  onCardPress: (id: number) => void;
}

export default function MovementMobDocumentList({
  cards,
  loading,
  error,
  onCardPress,
}: MovementMobDocumentListProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-default-500">
        <Spinner size="lg" color="primary" />
        <p className="text-sm">Завантаження переміщень…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-danger px-4 text-center">
        <DynamicIcon name="circle-alert" size={28} />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-default-400 px-4 text-center">
        <DynamicIcon name="package-open" size={32} className="opacity-50" />
        <p className="text-sm">Немає переміщень за обраний період</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <MovementMobDocumentCard key={card.id} card={card} onPress={onCardPress} />
      ))}
    </div>
  );
}
