import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// MovementStartScreen — початковий екран коли немає активної чернетки
// ---------------------------------------------------------------------------

interface MovementStartScreenProps {
  onLoadProducts?: () => void;
  isLoadingProducts?: boolean;
}

export const MovementStartScreen = ({ onLoadProducts, isLoadingProducts = false }: MovementStartScreenProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
    <div className="text-center py-12 px-6">
      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <DynamicIcon name="arrow-right-left" className="w-8 h-8 text-green-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        Немає активного переміщення
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Розпочніть нове переміщення товарів зі складів, щоб зафіксувати кількість товарів для перевезення
      </p>
      <div className="flex gap-3 justify-center">
        {onLoadProducts && (
          <Button
            color="primary"
            // variant="bordered"
            onPress={onLoadProducts}
            isLoading={isLoadingProducts}
            startContent={!isLoadingProducts && <DynamicIcon name="plus" className="w-4 h-4" />}
          >
            Розпочати переміщення
          </Button>
        )}
        {/* <Button
          color="primary"
          onPress={onStart}
          startContent={<DynamicIcon name="plus" className="w-4 h-4" />}
        >
          Розпочати переміщення
        </Button> */}
      </div>
    </div>
  </div>
);
