import { useEffect, useRef, useState } from 'react';
import { Button, Chip, DatePicker, Divider, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Switch, Textarea } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { invoicesApi } from '@/services/InvoicesService';
import { BTN_PRIMARY_BLUE } from '@/lib/buttonStyles';
import { INVOICE_ORDER_STATUS_OPTIONS, type InvoicePayer, type InvoiceSettings } from '@shared/types/invoices';
import { todayKyivYmd } from '@shared/utils/kyivDateTime';

const SIGNATURE_MAX_BYTES = 400 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    reader.readAsDataURL(file);
  });
}

export default function InvoiceSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [payers, setPayers] = useState<InvoicePayer[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    void (async () => {
      try {
        const [s, p, sig] = await Promise.all([invoicesApi.getSettings(), invoicesApi.listPayers(), invoicesApi.getSignature()]);
        setSettings(s);
        setPayers(p);
        setSignature(sig.dataUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося завантажити налаштування');
      }
    })();
  }, [isOpen]);

  const patch = (next: Partial<InvoiceSettings>) => setSettings((s) => (s ? { ...s, ...next } : s));
  const patchPayee = (next: Partial<InvoiceSettings['payee']>) => setSettings((s) => (s ? { ...s, payee: { ...s.payee, ...next } } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await invoicesApi.saveSettings(settings);
      ToastService.show({ title: 'Налаштування рахунків збережено', color: 'success' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося зберегти');
    } finally {
      setSaving(false);
    }
  };

  const onSignatureFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > SIGNATURE_MAX_BYTES) {
      setError('Підпис: потрібен PNG або JPEG до 400 КБ');
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      const saved = await invoicesApi.saveSignature(dataUrl);
      setSignature(saved.dataUrl);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося зберегти підпис');
    }
  };

  const removePayer = async (id: number) => {
    try {
      await invoicesApi.deletePayer(id);
      setPayers((list) => list.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося видалити платника');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="settings-2" size={20} />
          Реквізити й налаштування рахунків
        </ModalHeader>
        <ModalBody className="gap-4">
          {!settings ? (
            <p className="text-sm text-default-500">{error ?? 'Завантаження…'}</p>
          ) : (
            <>
              <h3 className="text-sm font-semibold">Отримувач (виконавець)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input size="sm" label="Назва (ФОП, ПІБ)" value={settings.payee.fullName} onValueChange={(v) => patchPayee({ fullName: v })} />
                <Input size="sm" label="ІПН" value={settings.payee.taxId} onValueChange={(v) => patchPayee({ taxId: v })} />
                <Input size="sm" className="md:col-span-2" label="Адреса" value={settings.payee.address} onValueChange={(v) => patchPayee({ address: v })} />
                <Input size="sm" label="Телефон" value={settings.payee.phone} onValueChange={(v) => patchPayee({ phone: v })} />
                <Input size="sm" label="Банк" value={settings.payee.bank} onValueChange={(v) => patchPayee({ bank: v })} />
                <Input size="sm" label="IBAN" value={settings.payee.iban} onValueChange={(v) => patchPayee({ iban: v })} />
                <Input size="sm" label="Підпис у дужках (Прізвище І.Б.)" value={settings.payee.signatureName} onValueChange={(v) => patchPayee({ signatureName: v })} />
              </div>

              <Divider />
              <h3 className="text-sm font-semibold">Рахунок за замовчуванням</h3>
              <Input size="sm" label="Найменування послуги" value={settings.serviceName} onValueChange={(v) => patch({ serviceName: v })} />
              <Textarea size="sm" label="Призначення платежу" minRows={2} value={settings.paymentPurpose} onValueChange={(v) => patch({ paymentPurpose: v })} />
              <Textarea size="sm" label="Примітка про оподаткування" minRows={2} value={settings.taxNote} onValueChange={(v) => patch({ taxNote: v })} />
              <Input size="sm" label="Умови оплати" value={settings.paymentTerms} onValueChange={(v) => patch({ paymentTerms: v })} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                <Input
                  size="sm"
                  label="Тариф, грн за порцію"
                  value={String(settings.defaultTariff).replace('.', ',')}
                  onValueChange={(v) => {
                    const n = Number(v.replace(',', '.'));
                    if (Number.isFinite(n)) patch({ defaultTariff: n });
                  }}
                />
                <Input
                  size="sm"
                  label="Наступний номер не менше"
                  value={String(settings.nextNumberFloor)}
                  onValueChange={(v) => {
                    const n = Number.parseInt(v, 10);
                    if (Number.isFinite(n)) patch({ nextNumberFloor: n });
                  }}
                />
                <Switch size="sm" isSelected={settings.roundToHryvnia} onValueChange={(v) => patch({ roundToHryvnia: v })}>
                  Округляти суму до гривні
                </Switch>
              </div>
              <Select
                size="sm"
                classNames={{
                  trigger: 'h-auto min-h-14 py-2',
                  // The label is vertically centred by default; pin it to the top like in the other fields.
                  label: 'group-data-[filled=true]:!top-1.5 group-data-[filled=true]:!translate-y-0',
                  innerWrapper: 'pt-5',
                  value: 'whitespace-normal',
                }}
                label="Статуси замовлень, що рахуються як продані"
                description="За замовчуванням 1–5, як у звіті продажів; скасовані (6, 7, 8) не рахуються"
                selectionMode="multiple"
                disallowEmptySelection
                selectedKeys={new Set(settings.countedStatuses)}
                onSelectionChange={(keys) => {
                  const codes = Array.from(keys).map(String).sort();
                  if (codes.length > 0) patch({ countedStatuses: codes });
                }}
                renderValue={(items) => (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {items.map((item) => (
                      <Chip key={item.key} size="sm" variant="flat">
                        {item.textValue}
                      </Chip>
                    ))}
                  </div>
                )}
              >
                {INVOICE_ORDER_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.code} textValue={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </Select>

              <Divider />
              <h3 className="text-sm font-semibold">Ставка години, $ (з історією змін)</h3>
              <div className="space-y-2">
                {settings.hourlyRates.map((step, idx) => (
                  <div key={`${step.from}-${idx}`} className="flex items-center gap-2">
                    <I18nProvider locale="uk-UA">
                      <DatePicker
                        size="sm"
                        label="Діє з"
                        className="max-w-48"
                        classNames={{ label: 'mt-1', input: '-mt-1.5' }}
                        value={parseDate(step.from)}
                        onChange={(d) => {
                          if (!d) return;
                          patch({ hourlyRates: settings.hourlyRates.map((s, i) => (i === idx ? { ...s, from: d.toString() } : s)) });
                        }}
                      />
                    </I18nProvider>
                    <Input
                      size="sm"
                      label="Ставка, $/год"
                      className="max-w-36"
                      value={String(step.usd).replace('.', ',')}
                      onValueChange={(v) => {
                        const n = Number(v.replace(',', '.'));
                        if (Number.isFinite(n)) patch({ hourlyRates: settings.hourlyRates.map((s, i) => (i === idx ? { ...s, usd: n } : s)) });
                      }}
                    />
                    <Button isIconOnly size="sm" variant="light" aria-label="Видалити ставку" isDisabled={settings.hourlyRates.length <= 1} onPress={() => patch({ hourlyRates: settings.hourlyRates.filter((_, i) => i !== idx) })}>
                      <DynamicIcon name="trash-2" size={16} />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<DynamicIcon name="plus" size={16} />}
                  onPress={() => {
                    const last = settings.hourlyRates[settings.hourlyRates.length - 1];
                    patch({ hourlyRates: [...settings.hourlyRates, { from: todayKyivYmd(), usd: last?.usd ?? 20 }] });
                  }}
                >
                  Додати зміну ставки
                </Button>
              </div>

              <Divider />
              <h3 className="text-sm font-semibold">Підпис виконавця</h3>
              <p className="text-xs text-default-500">Зберігається в БД і віддається лише адміну для PDF. Не лежить у відкритих файлах застосунку.</p>
              <div className="flex items-center gap-3">
                {signature ? <img src={signature} alt="Підпис" className="h-14 border border-default-200 rounded bg-white p-1" /> : <span className="text-sm text-default-500">Підпис не завантажено</span>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void onSignatureFile(e.target.files?.[0])} />
                <Button size="sm" variant="flat" startContent={<DynamicIcon name="upload" size={16} />} onPress={() => fileRef.current?.click()}>
                  {signature ? 'Замінити' : 'Завантажити'}
                </Button>
                {signature ? (
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={async () => {
                      await invoicesApi.saveSignature(null);
                      setSignature(null);
                    }}
                  >
                    Прибрати
                  </Button>
                ) : null}
              </div>

              <Divider />
              <h3 className="text-sm font-semibold">Збережені платники</h3>
              <ul className="space-y-2">
                {payers.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-default-200 px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium text-default-900">{p.name}</div>
                      <div className="text-xs text-default-500 break-words">ІПН {p.taxId} · {p.address}</div>
                    </div>
                    <Button isIconOnly size="sm" variant="light" color="danger" aria-label="Видалити платника" onPress={() => void removePayer(p.id)}>
                      <DynamicIcon name="trash-2" size={14} />
                    </Button>
                  </li>
                ))}
                {payers.length === 0 ? <li className="text-sm text-default-500">Список порожній: платники додаються при створенні рахунку.</li> : null}
              </ul>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </>
          )}
        </ModalBody>
        <ModalFooter className="justify-start gap-3">
          <Button className={BTN_PRIMARY_BLUE} isLoading={saving} isDisabled={!settings} onPress={() => void save()}>
            Зберегти
          </Button>
          <Button variant="flat" onPress={onClose}>
            Закрити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
