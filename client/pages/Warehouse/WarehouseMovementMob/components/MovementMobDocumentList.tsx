import { Button, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import MovementMobDocumentCard from './MovementMobDocumentCard';
import type { MovementMobListCardViewModel } from '../WarehouseMovementMobTypes';

interface MovementMobDocumentListProps {
  cards: MovementMobListCardViewModel[];
  loading: boolean;
  error: string | null;
  onCardPress: (id: number) => void;
}

export default function MovementMobDocumentList({cards, loading, error, onCardPress}: MovementMobDocumentListProps) {
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

  const navigate = useNavigate();

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-10 min-h-[28rem]">
        <DynamicIcon
          name="package-open"
          size={120}
          strokeWidth={1}
          className="text-neutral-400"
        />
        <p className="text-center text-lg leading-tight text-neutral-400/75 max-w-68">
          Немає переміщень за обраний період
        </p>
        <Button
          size="lg"
          className="bg-gradient-to-b from-yellow-500 to-orange-500 px-6 py-8 mt-6 text-xl font-bold text-white rounded-xl"
          startContent={<DynamicIcon name="plus" size={24} />}
          onPress={() => navigate('/warehouse/movement-mob/new')}
        >
          Створити переміщення
        </Button>
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
