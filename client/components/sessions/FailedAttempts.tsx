import { Button } from '@heroui/react';
import { SectionTitle } from '@/components/SectionTitle';
import type { AuthLoginAttemptDto } from '@shared/types/authSessions';
import { DateCell, DeviceCell } from './SessionCells';
import { ATTEMPT_REASON_LABELS, deviceLabel } from './sessionUtils';

interface FailedAttemptsProps {
  attempts: AuthLoginAttemptDto[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export function FailedAttempts({ attempts, hasMore, isLoadingMore, onLoadMore }: FailedAttemptsProps) {
  return (
    <div className="space-y-1 pt-2">
      <SectionTitle icon="shield-alert" level="sub">Невдалі спроби входу</SectionTitle>
      {attempts.length === 0 ? (
        <p className="text-sm text-default-500">Невдалих спроб немає</p>
      ) : (
        <ul className="divide-y divide-default-100">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="flex items-start justify-between gap-3 py-2">
              <DeviceCell
                deviceType={attempt.deviceType}
                label={deviceLabel(attempt.browser, attempt.os)}
                note={`${attempt.reason ? ATTEMPT_REASON_LABELS[attempt.reason] : '–'} · IP: ${attempt.ip ?? '–'}`}
              />
              <DateCell value={attempt.createdAt} />
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <Button size="sm" variant="light" isLoading={isLoadingMore} onPress={onLoadMore}>
          Показати ще
        </Button>
      )}
    </div>
  );
}
