import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobChronologyEvent } from '../WarehouseMovementMobTypes';

interface MovementMobChronologyProps {
  events: MovementMobChronologyEvent[];
}

export default function MovementMobChronology({ events }: MovementMobChronologyProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-default-700">Хронологія подій</h3>

      <ol className="relative flex flex-col gap-0 pl-1">
        {events.map((event, index) => {
          const isDone = event.state === 'done';
          const isLast = index === events.length - 1;

          return (
            <li key={event.key} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && (
                <span
                  className={`absolute left-3.5 top-7 bottom-0 w-0.5 -translate-x-1/2 ${
                    isDone ? 'bg-success/50' : 'bg-default-200'
                  }`}
                />
              )}

              <div
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isDone ? 'bg-success text-white' : 'bg-default-200 text-default-500'
                }`}
              >
                <DynamicIcon name={isDone ? 'check' : 'clock'} size={14} />
              </div>

              <div className="flex flex-col gap-0.5 min-w-0 pt-0.5">
                <span className="text-xs text-default-400">{event.occurredAt}</span>
                <span className={`text-sm font-medium ${isDone ? 'text-default-800' : 'text-default-500'}`}>
                  {event.title}
                </span>
                {event.userName && (
                  <span className="text-xs text-default-400">{event.userName}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
