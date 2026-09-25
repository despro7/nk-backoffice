import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobChronologyEvent } from '../WarehouseMovementMobTypes';

interface MovementMobChronologyProps {
  events: MovementMobChronologyEvent[];
  onCancelReceipt?: () => void;
  cancelingReceipt?: boolean;
}

export default function MovementMobChronology({
  events,
  onCancelReceipt,
  cancelingReceipt = false,
}: MovementMobChronologyProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3 mt-4">
      <h3 className="text-base font-bold text-default-700">Хронологія подій</h3>

      <ol className="relative flex flex-col overflow-visible pl-1">
        {events.map((event, index) => {
          const isDone = event.state === 'done';
          const isLast = index === events.length - 1;
          const nextDone = !isLast && events[index + 1]?.state === 'done';

          return (
            <li key={event.key} className="relative flex gap-3 overflow-visible pb-5 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-[14px] top-7 -bottom-1 z-0 w-0.5 -translate-x-1/2 rounded-full ${
                    isDone && nextDone
                      ? 'bg-success-500'
                      : isDone
                        ? 'bg-gradient-to-b from-success-500 to-default-300'
                        : 'bg-default-300'
                  }`}
                />
              )}

              <div
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isDone ? 'bg-success-500 text-white' : 'bg-default-300 text-default-400'
                }`}
              >
                <DynamicIcon name={isDone ? 'check' : 'clock'} size={14} />
              </div>

              <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isDone ? 'text-default-800' : 'text-default-400'}`}>
                    {event.title}
                  </span>
                  {event.key === 'received' && isDone && onCancelReceipt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      color="danger"
                      className="shrink-0 text-xs font-medium min-h-0 h-auto min-w-0 px-2 py-1 border-1"
                      isLoading={cancelingReceipt}
                      onPress={onCancelReceipt}
                    >
                      Скасувати
                    </Button>
                  ) : null}
                </div>
                {event.occurredAt ? (
                  <span className={`text-xs ${isDone ? 'text-default-400' : 'text-default-400'}`}>
                    {event.occurredAt}
                  </span>
                ) : null}
                {isDone && event.userName ? (
                  <span className="flex items-center gap-0.5 text-xs text-default-500 pt-0.5">
                    <DynamicIcon name="user" size={12} className="shrink-0 mb-[1px]" />
                    {event.userName}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
