import { Button, Input } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// InventoryStartScreen — початковий екран коли немає активної сесії
// ---------------------------------------------------------------------------

interface InventoryStartScreenProps {
  comment: string;
  onCommentChange: (value: string) => void;
  onStart: () => void;
}

export const InventoryStartScreen = ({ comment, onCommentChange, onStart }: InventoryStartScreenProps) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
    <div className="text-center py-12 px-6">
      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <DynamicIcon name="clipboard-list" className="w-8 h-8 text-blue-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        Немає активної інвентаризації
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Розпочніть нову інвентаризацію, щоб зафіксувати фактичні залишки малого складу
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center max-w-md mx-auto">
        <Input
          placeholder="Коментар (необов'язково)"
          value={comment}
          onValueChange={onCommentChange}
          size="md"
          className="flex-1"
          startContent={<DynamicIcon name="message-square" className="w-4 h-4 text-gray-400" />}
        />
        <Button
          color="primary"
          onPress={onStart}
          startContent={<DynamicIcon name="play" className="w-4 h-4" />}
        >
          Розпочати
        </Button>
      </div>
    </div>
  </div>
);
