import React from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDebug } from '@/contexts/DebugContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@shared/constants/roles';
import type { CashInRow, CashInConfirmedRow } from '@shared/types/cashIn';

interface CashInSummaryProps {
  rows: CashInRow[];
  isExporting: boolean;
  onExport: (confirmedRows: CashInConfirmedRow[]) => void;
  onShowPayload: (confirmedRows: CashInConfirmedRow[]) => void;
  onReset: () => void;
}

export default function CashInSummary({
  rows,
  isExporting,
  onExport,
  onShowPayload,
  onReset,
}: CashInSummaryProps) {
  const { isDebugMode } = useDebug();
  const { user } = useAuth();

  const isAdmin = user?.role === ROLES.ADMIN;
  const showPayloadButton = isAdmin && isDebugMode;

  // Рядки зі статусом ok або duplicate_cash_in+allowDuplicate підуть в Діловод
  const confirmedRows: CashInConfirmedRow[] = rows
    .filter((r) => {
      const orderNum = r.resolvedOrderNumber ?? r.orderNumber;
      if (!orderNum) return false;
      if (r.status === 'ok') return true;
      if (r.status === 'duplicate_cash_in' && r.allowDuplicate) return true;
      return false;
    })
    .map((r) => ({
      rowIndex: r.rowIndex,
      transferDate: r.transferDate,
      amountReceived: r.amountReceived,
      commissionAmount: r.commissionAmount,
      orderNumber: (r.resolvedOrderNumber ?? r.orderNumber)!,
      dilovodDocId: r.dilovodDocId ?? null,
    }));

  const okCount = confirmedRows.length;
  const skippedCount = rows.filter(
    (r) => r.status !== 'ok' && !(r.status === 'duplicate_cash_in' && r.allowDuplicate)
  ).length;
  const mismatchCount = rows.filter((r) => r.status === 'amount_mismatch').length;
  const notFoundCount = rows.filter((r) => r.status === 'not_found').length;
  const ambiguousCount = rows.filter((r) => r.status === 'ambiguous').length;
  const duplicateCount = rows.filter((r) => r.status === 'duplicate_cash_in').length;
  const duplicateAllowedCount = rows.filter((r) => r.status === 'duplicate_cash_in' && r.allowDuplicate).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Статистика */}
      <div className="flex flex-wrap gap-3">
        <Chip color="success" variant="flat" startContent={<DynamicIcon name="circle-check" size={14} className="ml-1 shrink-0" />}>
          До відправки: {okCount}
        </Chip>
        {mismatchCount > 0 && (
          <Chip color="warning" variant="flat" startContent={<DynamicIcon name="circle-alert" size={14} className="ml-1 shrink-0" />}>
            Розбіжність суми: {mismatchCount}
          </Chip>
        )}
        {ambiguousCount > 0 && (
          <Chip color="warning" variant="flat" startContent={<DynamicIcon name="git-branch" size={14} className="ml-1 shrink-0" />}>
            Не вибрано замовлення: {ambiguousCount}
          </Chip>
        )}
        {duplicateCount > 0 && (
          <Chip
            color={duplicateAllowedCount > 0 ? 'warning' : 'default'}
            variant="flat"
            startContent={<DynamicIcon name="copy-x" size={14} className="ml-1 shrink-0" />}
          >
            Дублікати: {duplicateAllowedCount > 0 ? `${duplicateAllowedCount} з ${duplicateCount} дозволено` : duplicateCount}
          </Chip>
        )}
        {notFoundCount > 0 && (
          <Chip color="danger" variant="flat" startContent={<DynamicIcon name="search-x" size={14} className="ml-1 shrink-0" />}>
            Не знайдено: {notFoundCount}
          </Chip>
        )}
        {skippedCount > 0 && (
          <Chip color="default" variant="flat" startContent={<DynamicIcon name="minus-circle" size={14} className="ml-1 shrink-0" />}>
            Буде пропущено: {skippedCount}
          </Chip>
        )}
      </div>

      {okCount === 0 && (
        <p className="text-sm text-warning-600 flex items-center gap-1.5">
          <DynamicIcon name="triangle-alert" size={15} />
          Немає жодного готового рядка для відправки. Виправте помилки або скасуйте імпорт.
        </p>
      )}

      {/* Кнопки дій */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          color="primary"
          isDisabled={okCount === 0 || isExporting}
          isLoading={isExporting}
          onPress={() => onExport(confirmedRows)}
          startContent={!isExporting && <DynamicIcon name="send" size={16} />}
        >
          Відправити в Діловод ({okCount})
        </Button>

        {showPayloadButton && (
          <Button
            variant="bordered"
            color="default"
            isDisabled={okCount === 0}
            onPress={() => onShowPayload(confirmedRows)}
            startContent={<DynamicIcon name="code-2" size={15} />}
          >
            Payload
          </Button>
        )}

        <Button
          variant="light"
          color="danger"
          isDisabled={isExporting}
          onPress={onReset}
          startContent={<DynamicIcon name="rotate-ccw" size={15} />}
        >
          Скасувати
        </Button>
      </div>
    </div>
  );
}
