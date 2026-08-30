import { Input, Switch } from '@heroui/react';

export const MOVEMENT_MOB_MOCK_STORAGE_KEY = 'movement-mob-mock-barcode';

export interface MovementMobMockSettings {
  enabled: boolean;
  code: string;
}

export function readMovementMobMock(): MovementMobMockSettings {
  try {
    const raw = localStorage.getItem(MOVEMENT_MOB_MOCK_STORAGE_KEY);
    if (!raw) return { enabled: false, code: '' };
    const parsed = JSON.parse(raw) as Partial<MovementMobMockSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      code: String(parsed.code ?? ''),
    };
  } catch {
    return { enabled: false, code: '' };
  }
}

export function writeMovementMobMock(settings: MovementMobMockSettings): void {
  localStorage.setItem(MOVEMENT_MOB_MOCK_STORAGE_KEY, JSON.stringify(settings));
}

interface MovementMobMockBarcodeBarProps {
  enabled: boolean;
  code: string;
  onEnabledChange: (enabled: boolean) => void;
  onCodeChange: (code: string) => void;
}

export default function MovementMobMockBarcodeBar({
  enabled,
  code,
  onEnabledChange,
  onCodeChange,
}: MovementMobMockBarcodeBarProps) {
  return (
    <div className="rounded-xl border border-dashed border-warning-300 bg-warning-50 px-3 py-2.5 flex flex-col gap-2">
      <Switch
        size="sm"
        isSelected={enabled}
        onValueChange={onEnabledChange}
      >
        Використовувати мок-дані
      </Switch>
      <Input
        size="sm"
        label="mock-barcode"
        placeholder="Наприклад 4820000000000"
        value={code}
        onValueChange={onCodeChange}
        isDisabled={!enabled}
        aria-label="Мок штрих-код"
      />
      <p className="text-[11px] leading-tight text-default-500">
        Камера і «Додати ще» одразу підставлять цей ШК. Лише для відладки.
      </p>
    </div>
  );
}
