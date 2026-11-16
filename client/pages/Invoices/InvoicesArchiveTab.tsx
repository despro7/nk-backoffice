import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';
import { ToastService } from '@/services/ToastService';
import { invoicesApi } from '@/services/InvoicesService';
import type { InvoiceRecord } from '@shared/types/invoices';
import { formatDateUa, formatMoneyUa } from '@shared/utils/invoiceCalc';
import { downloadInvoicePdf, openInvoicePdf } from './invoicePdfExport';

export default function InvoicesArchiveTab({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<InvoiceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceRecord | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await invoicesApi.listInvoices());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося завантажити архів');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const runPdf = async (invoice: InvoiceRecord, mode: 'open' | 'download') => {
    setBusyId(invoice.id);
    try {
      await (mode === 'open' ? openInvoicePdf(invoice) : downloadInvoicePdf(invoice));
    } catch (e) {
      ToastService.show({ title: 'Не вдалося сформувати PDF', description: e instanceof Error ? e.message : undefined, color: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await invoicesApi.deleteInvoice(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      ToastService.show({ title: 'Не вдалося видалити', description: e instanceof Error ? e.message : undefined, color: 'danger' });
    }
  };

  return (
    <Card>
      <CardHeader className="px-4 border-b border-default-200 flex items-center gap-2">
        <DynamicIcon name="archive" size={20} className="text-default-600" />
        <h2 className="text-lg font-semibold">Архів рахунків</h2>
        <span className="text-xs text-default-500">{items ? `${items.length} шт.` : ''}</span>
      </CardHeader>
      <CardBody className="p-4 gap-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Table aria-label="Архів рахунків" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
          <TableHeader>
            <TableColumn>№</TableColumn>
            <TableColumn>Дата</TableColumn>
            <TableColumn>Платник</TableColumn>
            <TableColumn>Період</TableColumn>
            <TableColumn align="end">Порції</TableColumn>
            <TableColumn align="end">Сума, грн</TableColumn>
            <TableColumn align="end">Дії</TableColumn>
          </TableHeader>
          <TableBody emptyContent={items ? 'Рахунків ще немає. Сформуйте перший на вкладці «Новий рахунок».' : 'Завантаження…'}>
            {(items ?? []).map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                <TableCell className="text-sm">{formatDateUa(inv.date)}</TableCell>
                <TableCell className="text-sm">
                  {inv.payer.name}
                  <div className="text-xs text-default-500">{inv.payer.taxId}</div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDateUa(inv.periodStart)} – {formatDateUa(inv.periodEnd)}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {inv.snapshot.portions.toLocaleString('uk-UA')}
                  <div className="text-xs text-default-500">× {inv.snapshot.tariff.toString().replace('.', ',')} грн</div>
                </TableCell>
                <TableCell className="text-sm text-right font-medium">
                  {formatMoneyUa(inv.totalUah)}
                  {inv.adjustmentUah ? (
                    <Tooltip content={`Внутрішня корекція ${formatMoneyUa(inv.adjustmentUah)} грн${inv.adjustmentNote ? `: ${inv.adjustmentNote}` : ''}`} placement="top">
                      <span className="text-warning-600 text-xs"> *</span>
                    </Tooltip>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Tooltip content="Відкрити PDF" placement="top">
                      <Button isIconOnly size="sm" variant="light" aria-label="Відкрити PDF" isDisabled={busyId === inv.id} onPress={() => void runPdf(inv, 'open')}>
                        <DynamicIcon name={busyId === inv.id ? 'loader-2' : 'eye'} size={16} className={busyId === inv.id ? 'animate-spin' : ''} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Завантажити PDF" placement="top">
                      <Button isIconOnly size="sm" variant="light" aria-label="Завантажити PDF" isDisabled={busyId === inv.id} onPress={() => void runPdf(inv, 'download')}>
                        <DynamicIcon name="download" size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Видалити" placement="top">
                      <Button isIconOnly size="sm" variant="light" color="danger" aria-label="Видалити рахунок" onPress={() => setDeleteTarget(inv)}>
                        <DynamicIcon name="trash-2" size={16} />
                      </Button>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-default-500">
          PDF не зберігається файлом: його збирають із запису архіву разом із реквізитами на момент створення, тож старі рахунки не змінюються після правок налаштувань.
        </p>
      </CardBody>

      <ConfirmModal
        isOpen={deleteTarget != null}
        title="Видалити рахунок?"
        message={
          deleteTarget ? (
            <p className="text-sm">
              Рахунок №{deleteTarget.number} на {formatMoneyUa(deleteTarget.totalUah)} грн буде видалено з архіву. Якщо він останній, його номер стане вільним.
            </p>
          ) : null
        }
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
