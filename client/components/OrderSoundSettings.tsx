import React from 'react';

export type OrderSoundEvent = 'pending' | 'success' | 'done' | 'error';

export interface OrderSoundSettingsProps {
  value: Record<OrderSoundEvent, string>;
  onChange: (event: OrderSoundEvent, value: string) => void;
}

const SOUND_CHOICES = [
  { value: 'off', label: 'Без звуку' },
  { value: 'default', label: 'Стандартний' },
  { value: 'soft', label: 'М\'який' },
  { value: 'sharp', label: 'Різкий' },
  { value: 'double', label: 'Подвійний' },
  { value: 'beep3', label: 'Потрійний' },
  { value: 'chime', label: 'Дзвоник' },
  { value: 'low', label: 'Низький' },
];

export const OrderSoundSettings: React.FC<OrderSoundSettingsProps> = ({ value, onChange }) => {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Звуки подій збору замовлення</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['pending', 'success', 'done', 'error'] as OrderSoundEvent[]).map(event => (
          <div key={event} className="flex items-center gap-3">
            <label className="w-24 capitalize">{event}</label>
            <select
              className="border rounded px-2 py-1"
              value={value[event]}
              onChange={e => onChange(event, e.target.value)}
            >
              {SOUND_CHOICES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
