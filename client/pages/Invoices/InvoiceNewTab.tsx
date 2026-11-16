import { useCallback, useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionItem, Button, Card, CardBody, CardHeader, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { DynamicIcon } from 'lucide-react/dynamic';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import { ToastService } from '@/services/ToastService';
import { invoicesApi } from '@/services/InvoicesService';
import { BTN_PRIMARY_BLUE } from '@/lib/buttonStyles';
import type { InvoiceCreateInput, InvoicePayer, InvoicePreview, InvoiceRecord, InvoiceSettings } from '@shared/types/invoices';
import { amountInWordsUa, formatDateUa, formatMoneyUa, portionsAmount, roundMoney } from '@shared/utils/invoiceCalc';
import { downloadInvoicePdf } from './invoicePdfExport';

type CustomLineDraft = { key: number; title: string; quantity: string; unit: string; price: string };

const toNumber = (value: string): number => Number(value.replace(/\s/g, '').replace(',', '.'));

function rangeOf(preview: Pick<InvoicePreview, 'periodStart' | 'periodEnd'>): DateRange {
  return { start: parseDate(preview.periodStart), end: parseDate(preview.periodEnd) };
}

export default function InvoiceNewTab({ onCreated }: { onCreated: (invoice: InvoiceRecord) => void }) {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [payers, setPayers] = useState<InvoicePayer[]>([]);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [period, setPeriod] = useState<DateRange | null>(null);
  const [tariff, setTariff] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerTaxId, setPayerTaxId] = useState('');
  const [payerAddress, setPayerAddress] = useState('');
  const [selectedPayerId, setSelectedPayerId] = useState<string>('');
  const [purpose, setPurpose] = useState('');
  const [serviceTitle, setServiceTitle] = useState('');
  const [customLines, setCustomLines] = useState<CustomLineDraft[]>([]);
  const [adjustment, setAdjustment] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (next: { periodStart?: string; periodEnd?: string; tariff?: number }) => {
    setPreviewLoading(true);
    setError(null);
    try {
      const data = await invoicesApi.preview(next);
      setPreview(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося порахувати порції');
      return null;
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [s, p] = await Promise.all([invoicesApi.getSettings(), invoicesApi.listPayers()]);
        setSettings(s);
        setPayers(p);
        setPurpose(s.paymentPurpose);
        setServiceTitle(s.serviceName);
        setTariff(String(s.defaultTariff).replace('.', ','));
        const first = p[0];
        if (first) {
          setSelectedPayerId(String(first.id));
          setPayerName(first.name);
          setPayerTaxId(first.taxId);
          setPayerAddress(first.address);
        }
        const data = await loadPreview({});
        if (data) setPeriod(rangeOf(data));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося завантажити налаштування');
      }
    })();
  }, [loadPreview]);

  const onPeriodChange = (range: DateRange | null) => {
    setPeriod(range);
    if (!range) return;
    void loadPreview({ periodStart: range.start.toString(), periodEnd: range.end.toString(), tariff: toNumber(tariff) || undefined });
  };

  const onTariffBlur = () => {
    if (!period) return;
    void loadPreview({ periodStart: period.start.toString(), periodEnd: period.end.toString(), tariff: toNumber(tariff) || undefined });
  };

  const onPayerSelect = (id: string) => {
    setSelectedPayerId(id);
    const payer = payers.find((p) => String(p.id) === id);
    if (payer) {
      setPayerName(payer.name);
      setPayerTaxId(payer.taxId);
      setPayerAddress(payer.address);
    }
  };

  const isNewPayer = useMemo(() => !payers.some((p) => p.taxId === payerTaxId.trim()), [payers, payerTaxId]);

  const tariffNumber = toNumber(tariff);
  const roundWhole = settings?.roundToHryvnia ?? true;
  const gross = preview && tariffNumber > 0 ? portionsAmount(preview.portions, tariffNumber, roundWhole) : 0;
  const adjustmentNumber = adjustment.trim() ? toNumber(adjustment) : 0;
  const mainAmount = roundMoney(gross + (Number.isFinite(adjustmentNumber) ? adjustmentNumber : 0), roundWhole);
  const customTotal = customLines.reduce((sum, l) => {
    const q = toNumber(l.quantity);
    const p = toNumber(l.price);
    return sum + (q > 0 && p >= 0 ? roundMoney(q * p, roundWhole) : 0);
  }, 0);
  const total = mainAmount + customTotal;

  const addLine = () =>
    setCustomLines((lines) => [...lines, { key: Date.now(), title: '', quantity: '1', unit: 'посл.', price: '' }]);
  const patchLine = (key: number, patch: Partial<CustomLineDraft>) =>
    setCustomLines((lines) => lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const canCreate =
    !!preview && !!period && tariffNumber > 0 && payerName.trim() && /^\d{8,10}$/.test(payerTaxId.trim()) && payerAddress.trim() && !previewLoading;

  const create = async () => {
    if (!period) return;
    setCreating(true);
    setError(null);
    try {
      const input: InvoiceCreateInput = {
        periodStart: period.start.toString(),
        periodEnd: period.end.toString(),
        payer: { id: isNewPayer ? undefined : payers.find((p) => p.taxId === payerTaxId.trim())?.id, name: payerName, taxId: payerTaxId, address: payerAddress },
        paymentPurpose: purpose,
        tariff: tariffNumber,
        serviceTitle,
        customLines: customLines
          .filter((l) => l.title.trim())
          .map((l) => ({ title: l.title, quantity: toNumber(l.quantity), unit: l.unit, price: toNumber(l.price) })),
        adjustmentUah: adjustmentNumber || 0,
        adjustmentNote,
      };
      const record = await invoicesApi.createInvoice(input);
      ToastService.show({ title: `Рахунок №${record.number} створено`, description: `${formatMoneyUa(record.totalUah)} грн`, color: 'success' });
      try {
        await downloadInvoicePdf(record);
      } catch {
        ToastService.show({ title: 'Рахунок збережено, але PDF не вдалося сформувати', description: 'Завантажте його з архіву', color: 'warning' });
      }
      onCreated(record);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося створити рахунок');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <Card>
          <CardHeader className="px-4 border-b border-default-200">
            <h2 className="text-lg font-semibold">Період і тариф</h2>
          </CardHeader>
          <CardBody className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-default-500 mb-1">Період (за замовчуванням за днем створення)</p>
              <ReportDateRangeFilter value={period} onChange={onPeriodChange} ariaLabel="Період рахунку" />
            </div>
            <Input
              label="Тариф, грн за порцію"
              size="sm"
              value={tariff}
              onValueChange={setTariff}
              onBlur={onTariffBlur}
              description="Фіксується в цьому рахунку окремо"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="px-4 border-b border-default-200">
            <h2 className="text-lg font-semibold">Платник</h2>
          </CardHeader>
          <CardBody className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Збережені платники"
              size="sm"
              className="md:col-span-2"
              selectedKeys={selectedPayerId ? [selectedPayerId] : []}
              onSelectionChange={(keys) => {
                const id = Array.from(keys)[0];
                if (id != null) onPayerSelect(String(id));
              }}
            >
              {payers.map((p) => (
                <SelectItem key={String(p.id)} textValue={p.name}>
                  {p.name} · {p.taxId}
                </SelectItem>
              ))}
            </Select>
            <Input label="Назва (ФОП, ПІБ)" size="sm" value={payerName} onValueChange={setPayerName} />
            <Input label="ІПН / код ЄДРПОУ" size="sm" value={payerTaxId} onValueChange={setPayerTaxId} />
            <Input label="Адреса" size="sm" className="md:col-span-2" value={payerAddress} onValueChange={setPayerAddress} />
            {isNewPayer && payerTaxId.trim() ? (
              <p className="md:col-span-2 text-xs text-default-500">Нового платника буде додано до збережених при створенні рахунку.</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="px-4 border-b border-default-200">
            <h2 className="text-lg font-semibold">Послуги</h2>
          </CardHeader>
          <CardBody className="p-4 space-y-4">
            <Textarea label="Призначення платежу" size="sm" minRows={2} value={purpose} onValueChange={setPurpose} />
            <Input label="Найменування основної послуги" size="sm" value={serviceTitle} onValueChange={setServiceTitle} />
            {customLines.map((l) => (
              <div key={l.key} className="grid grid-cols-12 gap-2 items-end">
                <Input className="col-span-12 md:col-span-5" size="sm" label="Найменування" value={l.title} onValueChange={(v) => patchLine(l.key, { title: v })} />
                <Input className="col-span-4 md:col-span-2" size="sm" label="К-ть" value={l.quantity} onValueChange={(v) => patchLine(l.key, { quantity: v })} />
                <Input className="col-span-4 md:col-span-2" size="sm" label="Од." value={l.unit} onValueChange={(v) => patchLine(l.key, { unit: v })} />
                <Input className="col-span-4 md:col-span-2" size="sm" label="Ціна, грн" value={l.price} onValueChange={(v) => patchLine(l.key, { price: v })} />
                <Button isIconOnly size="sm" variant="light" aria-label="Видалити рядок" onPress={() => setCustomLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <DynamicIcon name="trash-2" size={16} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="flat" startContent={<DynamicIcon name="plus" size={16} />} onPress={addLine}>
              Додати довільну послугу
            </Button>

            <Accordion variant="bordered" isCompact>
              <AccordionItem key="adj" aria-label="Внутрішня корекція" title="Внутрішня корекція (не друкується окремим рядком)">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-2">
                  <Input size="sm" label="Сума, грн (мінус зменшує рахунок)" value={adjustment} onValueChange={setAdjustment} />
                  <Input size="sm" className="md:col-span-2" label="Примітка (лише для дашборда й архіву)" value={adjustmentNote} onValueChange={setAdjustmentNote} />
                </div>
              </AccordionItem>
            </Accordion>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="px-4 border-b border-default-200 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Підсумок</h2>
            {previewLoading ? <DynamicIcon name="loader-2" size={16} className="animate-spin text-default-500" /> : null}
          </CardHeader>
          <CardBody className="p-4 space-y-2 text-sm">
            {preview ? (
              <>
                <Row label="Рахунок №" value={String(preview.number)} />
                <Row label="Дата" value={formatDateUa(preview.date)} />
                <Row label="Продано порцій" value={preview.portions.toLocaleString('uk-UA')} />
                <Row label="Початок звітного дня" value={`${String(preview.dayStartHour).padStart(2, '0')}:00`} />
                <Row label="Порції × тариф" value={`${formatMoneyUa(gross)} грн`} />
                {adjustmentNumber ? <Row label="Внутрішня корекція" value={`${formatMoneyUa(adjustmentNumber)} грн`} /> : null}
                {customTotal > 0 ? <Row label="Додаткові послуги" value={`${formatMoneyUa(customTotal)} грн`} /> : null}
                <div className="border-t border-default-200 pt-2">
                  <Row label="Всього до сплати" value={`${formatMoneyUa(total)} грн`} strong />
                  <p className="text-xs text-default-500 mt-1">{amountInWordsUa(total)}</p>
                </div>
                <Accordion isCompact className="px-0">
                  <AccordionItem key="days" aria-label="Порції по днях" title="Порції по днях">
                    <ul className="text-xs text-default-600 space-y-0.5 pb-2">
                      {preview.byDay.map((d) => (
                        <li key={d.date} className="flex justify-between">
                          <span>{formatDateUa(d.date)}</span>
                          <span className="font-mono">{d.portions}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionItem>
                </Accordion>
              </>
            ) : (
              <p className="text-default-500">Рахуємо порції…</p>
            )}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button
              className={BTN_PRIMARY_BLUE}
              isDisabled={!canCreate}
              isLoading={creating}
              onPress={() => void create()}
              startContent={!creating ? <DynamicIcon name="file-text" size={16} /> : undefined}
            >
              Сформувати рахунок і акт
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-default-500">{label}</span>
      <span className={strong ? 'font-semibold text-default-900' : 'text-default-900'}>{value}</span>
    </div>
  );
}
