import React, { useEffect, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useDebug } from '@/contexts/DebugContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import type { BankStatementConfirmedRow, BankStatementRow } from '@shared/types/bankStatement';
import { toBankStatementConfirmed } from '@shared/types/bankStatement';

export interface BankStatementSummaryProps {
  rows: BankStatementRow[];
  totalParsed?: number;
  isExporting: boolean;
  onExport: (confirmedRows: BankStatementConfirmedRow[]) => void;
  onShowPayload: (confirmedRows: BankStatementConfirmedRow[]) => void;
  onReset: () => void;
  fileCashAccount?: string;
  firm?: string;
}

function toConfirmed(rows: BankStatementRow[]): BankStatementConfirmedRow[] {
  return rows.filter((r) => r.amount > 0).map(toBankStatementConfirmed);
}

export default function BankStatementSummary({
  rows,
  totalParsed,
  isExporting,
  onExport,
  onShowPayload,
  onReset,
  fileCashAccount,
  firm,
}: BankStatementSummaryProps) {
  const { isDebugMode } = useDebug();
  const { isAdminView: isAdmin } = useRolePreview();
  const showPayloadButton = isAdmin && isDebugMode;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmedRows = toConfirmed(rows);
  const expenseCount = confirmedRows.filter((r) => r.direction === 'expense').length;
  const incomeCount = confirmedRows.filter((r) => r.direction === 'income').length;
  const totalAmount = confirmedRows.reduce((sum, r) => sum + r.amount, 0);
  const totalFormatted = totalAmount.toLocaleString('uk-UA', { minimumFractionDigits: 2 });

  useEffect(() => {
    if (firm) {
      console.info(`[BankStatement] Summary firm: ${firm} (fileCashAccount: ${fileCashAccount})`);
    }
  }, [firm, fileCashAccount]);

  // Після завершення експорту (успіх/помилка) закриваємо confirm
  useEffect(() => {
    if (!isExporting && confirmOpen) {
      // залишаємо відкритим лише під час isExporting; закриття після старту — через success unmount
    }
  }, [isExporting, confirmOpen]);

  return (
    <div className="flex flex-col gap-5">
      {(firm || fileCashAccount) && (
        <div className="text-sm text-gray-600">
          {firm ? (
            <span className="font-medium"><strong>Фірма:</strong> {firm}</span>
          ) : (
            <span className="font-medium"><strong>Рахунок виписки:</strong> {fileCashAccount}</span>
          )}
          {firm && fileCashAccount && (
            <span className="ml-3 text-gray-500">IBAN: {fileCashAccount}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Chip color="danger" variant="flat" startContent={<DynamicIcon name="trending-down" size={14} className="ml-1 shrink-0" />}>
          Витрати: {expenseCount}
        </Chip>
        <Chip color="success" variant="flat" startContent={<DynamicIcon name="trending-up" size={14} className="ml-1 shrink-0" />}>
          Надходження: {incomeCount}
        </Chip>
        <Chip color="default" variant="flat" startContent={<DynamicIcon name="wallet" size={14} className="ml-1 shrink-0" />}>
          У реєстрі документів: <b>{confirmedRows.length}</b>
          {totalParsed != null ? <> з <span className="font-bold">{totalParsed}</span></> : ''}
          {' '}({totalFormatted} грн)
        </Chip>
      </div>

      {confirmedRows.length === 0 && (
        <p className="text-sm text-warning-600 flex items-center gap-1.5">
          <DynamicIcon name="triangle-alert" size={15} />
          Немає позначених рядків для payload.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          color="primary"
          isDisabled={confirmedRows.length === 0 || isExporting}
          isLoading={isExporting}
          onPress={() => setConfirmOpen(true)}
          startContent={!isExporting && <DynamicIcon name="send" size={16} />}
        >
          Відправити в Діловод ({confirmedRows.length})
        </Button>

        {showPayloadButton && (
          <Button
            variant="bordered"
            color="default"
            isDisabled={confirmedRows.length === 0}
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

      <ConfirmModal
        isOpen={confirmOpen}
        title="Відправити документи в Діловод?"
        message={
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Буде створено <strong>{confirmedRows.length}</strong>{' '}
              {confirmedRows.length === 1 ? 'документ' : 'документів'}.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-default-600">
              {firm ? <li>Фірма: {firm}</li> : null}
              {fileCashAccount ? <li>Рахунок виписки: {fileCashAccount}</li> : null}
              <li>Витрати: {expenseCount}</li>
              <li>Надходження: {incomeCount}</li>
              <li>Сума: {totalFormatted} грн</li>
            </ul>
            <p className="text-default-500">
              Перевірте суми, рахунки та напрямки — після підтвердження зміни в Діловод скасувати звідси не вийде.
            </p>
          </div>
        }
        confirmText={`Відправити (${confirmedRows.length})`}
        cancelText="Скасувати"
        confirmColor="primary"
        confirmLoading={isExporting}
        onConfirm={() => {
          onExport(confirmedRows);
        }}
        onCancel={() => {
          if (!isExporting) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
