import {
  Button,
  DatePicker,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Spinner,
} from '@heroui/react';
import { today, type DateValue } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';
import { DynamicIcon } from 'lucide-react/dynamic';
import { CARD_RADIO_GROUP_CLASS_NAMES, CardRadio } from '@/components/ui/CardRadio';
import { useEffect, useState } from 'react';
import type {
  ProductBatchCreateResult,
  ProductBatchDateKind,
  ProductBatchPreview,
} from '@shared/types/productBatch';

const KYIV_TZ = 'Europe/Kyiv';
/** Значення вибору «створити нову» серед наявних партій дня */
const CHOICE_NEW = '__new__';

function dateValueToYmd(value: DateValue | null): string {
  if (!value || value.year < 1000) return '';
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function formatUaDate(ymd: string | null | undefined): string {
  const day = String(ymd ?? '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '–';
}

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !json?.success || json.data === undefined) {
    throw new Error(json?.error || `Помилка сервера (${res.status})`);
  }
  return json.data;
}

const DATE_PICKER_CLASSES = {
  base: 'w-full',
  segment: 'rounded focus:bg-default-400/30',
  label: 'text-xs font-medium text-nowrap',
};

interface Props {
  isOpen: boolean;
  goodId: string;
  productName: string | null;
  defaultDateKind: ProductBatchDateKind;
  overlayZClassName?: string;
  onClose: () => void;
  onCreated: (result: ProductBatchCreateResult) => void;
}

export function CreateProductBatchModal({
  isOpen,
  goodId,
  productName,
  defaultDateKind,
  overlayZClassName,
  onClose,
  onCreated,
}: Props) {
  const [dateKind, setDateKind] = useState<ProductBatchDateKind>(defaultDateKind);
  const [batchDate, setBatchDate] = useState<DateValue | null>(() => today(KYIV_TZ));
  const [expiration, setExpiration] = useState<DateValue | null>(null);
  const [preview, setPreview] = useState<ProductBatchPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDateKind(defaultDateKind);
    setBatchDate(today(KYIV_TZ));
    setExpiration(null);
    setSubmitError(null);
  }, [isOpen, defaultDateKind]);

  const dateYmd = dateValueToYmd(batchDate);
  const expirationYmd = dateValueToYmd(expiration);

  useEffect(() => {
    if (!isOpen || !dateYmd) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setChoice('');
    fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/batches/preview?date=${dateYmd}`, {
      credentials: 'include',
    })
      .then((res) => readJson<ProductBatchPreview>(res))
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        // Без партій цього дня вибирати нічого: одразу нова партія
        setChoice(data.sameDay.length === 0 ? CHOICE_NEW : '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(err instanceof Error ? err.message : 'Не вдалося перевірити партії');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, goodId, dateYmd]);

  const reuseBatchId = choice && choice !== CHOICE_NEW ? choice : null;
  const createsNew = choice === CHOICE_NEW;
  const reuseItem = reuseBatchId ? preview?.sameDay.find((item) => item.batchId === reuseBatchId) ?? null : null;
  const expirationInvalid = createsNew && Boolean(expirationYmd) && Boolean(dateYmd) && expirationYmd < dateYmd;
  const dateLabel = dateKind === 'receipt' ? 'Дата надходження' : 'Дата виробництва';

  const canSubmit =
    !submitting &&
    !previewLoading &&
    Boolean(preview) &&
    Boolean(choice) &&
    (!createsNew || (Boolean(expirationYmd) && !expirationInvalid));

  const handleSubmit = async () => {
    if (!canSubmit || !preview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/catalog/goods/${encodeURIComponent(goodId)}/batches`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: preview.date,
          expiration: createsNew ? expirationYmd : '',
          reuseBatchId,
        }),
      });
      const result = await readJson<ProductBatchCreateResult>(res);
      onCreated(result);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Не вдалося створити партію');
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = reuseItem
    ? reuseItem.barcodes.length > 0
      ? 'Додати в картку'
      : 'Зареєструвати ШК'
    : 'Створити партію';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      scrollBehavior="inside"
      isDismissable={!submitting}
      classNames={{ wrapper: overlayZClassName, backdrop: overlayZClassName }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="text-lg font-semibold">Нова партія</div>
          <div className="text-sm font-normal text-default-500">
            Партія і ШК одразу створюються в Діловоді{productName ? ` для «${productName}»` : ''}.
          </div>
        </ModalHeader>

        <ModalBody className="gap-4">
          <RadioGroup
            label="Походження партії"
            value={dateKind}
            onValueChange={(value) => setDateKind(value as ProductBatchDateKind)}
            isDisabled={submitting}
            classNames={{ ...CARD_RADIO_GROUP_CLASS_NAMES, wrapper: 'grid grid-cols-1 gap-3 sm:grid-cols-2' }}
          >
            <CardRadio value="production" description="Партія з нашої кухні, дата виробництва.">
              <span className="text-sm font-medium">Власне виробництво</span>
            </CardRadio>
            <CardRadio value="receipt" description="Зовнішній товар, дата надходження.">
              <span className="text-sm font-medium">Надходження</span>
            </CardRadio>
          </RadioGroup>

          <I18nProvider locale="uk-UA">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DatePicker
                label={dateLabel}
                labelPlacement="outside"
                value={batchDate}
                onChange={setBatchDate}
                isRequired
                isDisabled={submitting}
                showMonthAndYearPickers
                granularity="day"
                selectorButtonPlacement="start"
                classNames={DATE_PICKER_CLASSES}
              />
              {!reuseItem && (
                <DatePicker
                  label="Термін придатності"
                  labelPlacement="outside"
                  value={expiration}
                  onChange={setExpiration}
                  isRequired
                  isDisabled={submitting}
                  minValue={batchDate ?? undefined}
                  isInvalid={expirationInvalid}
                  errorMessage={expirationInvalid ? 'Не раніше дати партії' : undefined}
                  showMonthAndYearPickers
                  granularity="day"
                  selectorButtonPlacement="start"
                  classNames={DATE_PICKER_CLASSES}
                />
              )}
            </div>
          </I18nProvider>

          {previewLoading && (
            <div className="flex items-center gap-2 text-sm text-default-500">
              <Spinner size="sm" />
              Перевіряю партії за цей день…
            </div>
          )}

          {previewError && !previewLoading && (
            <div className="rounded-lg border border-red-300/75 bg-red-50 p-3 text-sm text-red-900">{previewError}</div>
          )}

          {preview && !previewLoading && preview.sameDay.length === 0 && (
            <div className="rounded-lg border border-default-200 bg-default-50 p-3 text-sm text-default-700">
              Буде створено партію <strong className="font-mono">{preview.batchName}</strong> і згенеровано штрих-код
            </div>
          )}

          {preview && !previewLoading && preview.sameDay.length > 0 && (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="flex items-start gap-2">
                <DynamicIcon name="triangle-alert" size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  Для цього товару вже {preview.sameDay.length > 1 ? 'є партії' : 'є партія'} за{' '}
                  {formatUaDate(preview.date)}. Оберіть, що зробити:
                </div>
              </div>
              <RadioGroup
                aria-label="Дія з партією цього дня"
                size="sm"
                value={choice}
                onValueChange={setChoice}
                isDisabled={submitting}
              >
                {preview.sameDay.map((item) => (
                  <Radio key={item.batchId} value={item.batchId} description={
                    <span className="text-amber-900/80">
                      ТП {formatUaDate(item.expiration)} ·{' '}
                      {item.barcodes.length > 0
                        ? `ШК ${item.barcodes.join(', ')}`
                        : 'без ШК – буде зареєстровано новий'}
                    </span>
                  }>
                    Використати наявну <span className="font-mono font-semibold">{item.batchNumber}</span>
                  </Radio>
                ))}
                <Radio value={CHOICE_NEW} description={<span className="text-amber-900/80">Окрема партія з новим ШК</span>}>
                  Створити нову <span className="font-mono font-semibold">{preview.batchName}</span>
                </Radio>
              </RadioGroup>
            </div>
          )}

          {submitError && (
            <div className="rounded-lg border border-red-300/75 bg-red-50 p-3 text-sm text-red-900">{submitError}</div>
          )}
        </ModalBody>

        <ModalFooter className="gap-2">
          <Button variant="light" onPress={onClose} isDisabled={submitting}>
            Скасувати
          </Button>
          <Button color="primary" onPress={() => void handleSubmit()} isLoading={submitting} isDisabled={!canSubmit}>
            {submitLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
