import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDateTime } from '@/lib/formatUtils';

export interface ReserveDraftBannerProps {
  savedAt: string;
  placeLabel?: string | null;
  onContinue: () => void;
  onDismiss: () => void;
  continueText?: string;
  dismissText?: string;
}

export function ReserveDraftBanner({
  savedAt,
  placeLabel,
  onContinue,
  onDismiss,
  continueText = 'Продовжити',
  dismissText = 'Лишити збережене',
}: ReserveDraftBannerProps) {
  const when = formatDateTime(savedAt);

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning-300 bg-warning-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-semibold text-warning-700">
            <DynamicIcon name="history" size={16} className="shrink-0" />
            Є резервна копія змін
          </p>
          <p className="mt-1 text-sm text-warning-700">
            Локальні правки від {when}
            {placeLabel ? <> – зупинились на «{placeLabel}»</> : null}
            . Продовжити з цього місця чи лишити останнє збереження документа?
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Button variant="flat" color="warning" onPress={onDismiss}>
          {dismissText}
        </Button>
        <Button color="warning" onPress={onContinue}>
          {continueText}
        </Button>
      </div>
    </div>
  );
}
