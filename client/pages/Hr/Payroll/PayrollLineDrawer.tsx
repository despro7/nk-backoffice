import { useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import {
  HR_PAY_GROUP_LABELS,
  HR_PAY_TERMS_KIND_LABELS,
  HR_PAYOUT_KIND_LABELS,
  HR_PAYOUT_KINDS,
  HR_PAYROLL_SKIP_REASON_LABELS,
  type HrPayrollLineDto,
  type HrPayoutDto,
  type HrPayoutKind,
  type HrTimesheetWeekDto,
} from '@shared/types/hr';

function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface PayrollLineDrawerProps {
  line: HrPayrollLineDto | null;
  weeks: HrTimesheetWeekDto[];
  payouts: HrPayoutDto[];
  periodId: number | null;
  canEditPayouts: boolean;
  canRevealCard: boolean;
  onClose: () => void;
  onPayoutsChanged: () => void;
}

export function PayrollLineDrawer({
  line,
  weeks,
  payouts,
  periodId,
  canEditPayouts,
  canRevealCard,
  onClose,
  onPayoutsChanged,
}: PayrollLineDrawerProps) {
  const [kind, setKind] = useState<HrPayoutKind>('weekly');
  const [weekId, setWeekId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCard, setShowCard] = useState(false);

  const linePayouts = useMemo(
    () => (line ? payouts.filter((item) => item.employmentId === line.employmentId) : []),
    [line, payouts],
  );

  const addPayout = async () => {
    if (!line || !periodId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/hr/payroll/${periodId}/payouts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employmentId: line.employmentId,
          kind,
          weekId: weekId || null,
          amount: amount.replace(',', '.'),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: json.message || 'Не вдалося записати виплату', color: 'danger' });
        return;
      }
      setAmount('');
      ToastService.show({ title: 'Виплату записано', color: 'success' });
      onPayoutsChanged();
    } finally {
      setSaving(false);
    }
  };

  const removePayout = async (id: number) => {
    const response = await fetch(`/api/hr/payouts/${id}`, { method: 'DELETE', credentials: 'include' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      ToastService.show({ title: json.message || 'Не вдалося видалити виплату', color: 'danger' });
      return;
    }
    onPayoutsChanged();
  };

  return (
    <Drawer isOpen={Boolean(line)} onOpenChange={(open) => { if (!open) onClose(); }} size="md">
      <DrawerContent>
        {() =>
          line ? (
            <>
              <DrawerHeader className="flex flex-col gap-1">
                <span className="capitalize">{line.displayName}</span>
                <span className="text-sm font-normal text-gray-500">
                  {HR_PAY_GROUP_LABELS[line.payGroup]} · {line.legalEntityName}
                </span>
              </DrawerHeader>
              <DrawerBody className="space-y-4">
                <p className="text-xs text-gray-500">
                  Внутрішній розрахунок як у файлі Табель 2026. Години змінюються лише в табелі.
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Chip size="sm" variant="flat">
                    Ставка {formatMoney(line.rate)} ({HR_PAY_TERMS_KIND_LABELS[line.rateKind]})
                  </Chip>
                  <Chip size="sm" variant="flat">
                    Норма {line.normHours} год
                  </Chip>
                  <Chip size="sm" variant="flat">
                    Формула {line.formulaId}
                  </Chip>
                  {line.skipReason ? (
                    <Chip size="sm" color="warning" variant="flat">
                      {HR_PAYROLL_SKIP_REASON_LABELS[line.skipReason]}
                    </Chip>
                  ) : null}
                </div>

                <div className="text-sm">
                  <div className="text-xs uppercase text-gray-500 mb-1">Картка</div>
                  {canRevealCard && line.cardNumber ? (
                    <button
                      type="button"
                      className="font-mono text-sm"
                      onClick={() => setShowCard((v) => !v)}
                    >
                      {showCard ? line.cardNumber : line.cardMasked ?? '••••'}
                    </button>
                  ) : (
                    <span className="font-mono">{line.cardMasked ?? '—'}</span>
                  )}
                </div>

                <div>
                  <div className="text-xs uppercase text-gray-500 mb-2">Розкладка формули</div>
                  <ul className="space-y-1 text-sm">
                    {line.breakdown.map((step) => (
                      <li key={step.id} className="flex justify-between gap-3">
                        <span className="text-gray-600">{step.label}</span>
                        <span className="tabular-nums font-medium">{formatMoney(step.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="text-xs uppercase text-gray-500 mb-2">Тижні</div>
                  <ul className="space-y-1 text-sm">
                    {weeks.map((week) => {
                      const cell = line.weekAmounts.find((item) => item.weekId === week.id);
                      return (
                        <li key={week.id} className="flex justify-between gap-3">
                          <span className="text-gray-600">
                            {week.label}
                            {cell ? ` · ${cell.hours} год` : ''}
                          </span>
                          <span className="tabular-nums">{cell ? formatMoney(cell.toPay) : '—'}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div>
                  <div className="text-xs uppercase text-gray-500 mb-2">Виплати</div>
                  {linePayouts.length === 0 ? (
                    <p className="text-sm text-gray-500">Ще не записано.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {linePayouts.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span>
                            {HR_PAYOUT_KIND_LABELS[item.kind]} · {formatMoney(item.amount)}
                          </span>
                          {canEditPayouts ? (
                            <Button size="sm" variant="light" color="danger" onPress={() => void removePayout(item.id)}>
                              Видалити
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canEditPayouts && periodId ? (
                  <div className="grid grid-cols-1 gap-2">
                    <Select
                      label="Тип"
                      selectedKeys={[kind]}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0];
                        if (typeof value === 'string' && (HR_PAYOUT_KINDS as readonly string[]).includes(value)) {
                          setKind(value as HrPayoutKind);
                        }
                      }}
                    >
                      {HR_PAYOUT_KINDS.map((item) => (
                        <SelectItem key={item}>{HR_PAYOUT_KIND_LABELS[item]}</SelectItem>
                      ))}
                    </Select>
                    <Select
                      label="Тиждень"
                      selectedKeys={weekId ? [weekId] : []}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0];
                        setWeekId(typeof value === 'string' ? value : '');
                      }}
                    >
                      {weeks.map((week) => (
                        <SelectItem key={week.id}>{week.label}</SelectItem>
                      ))}
                    </Select>
                    <Input
                      label="Сума"
                      value={amount}
                      onValueChange={setAmount}
                      placeholder="0.00"
                    />
                    <Button
                      color="primary"
                      onPress={() => void addPayout()}
                      isLoading={saving}
                      isDisabled={!amount.trim()}
                      startContent={!saving ? <DynamicIcon name="plus" size={14} /> : undefined}
                    >
                      Записати виплату
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Щоб записати виплату, спочатку збережіть розрахунок.</p>
                )}
              </DrawerBody>
              <DrawerFooter>
                <Button variant="flat" onPress={onClose}>
                  Закрити
                </Button>
              </DrawerFooter>
            </>
          ) : null
        }
      </DrawerContent>
    </Drawer>
  );
}
