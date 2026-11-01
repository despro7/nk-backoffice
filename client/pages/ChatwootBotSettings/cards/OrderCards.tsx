import React from 'react';
import {
  Button,
  Checkbox,
  CheckboxGroup,
  DatePicker,
  Divider,
  Input,
  Select,
  SelectItem,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { I18nProvider } from '@react-aria/i18n';
import { getLocalTimeZone, today } from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ORDER_CANCEL_STATUS_OPTIONS } from '@shared/constants/chatwootBotOrderCancel';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { FormSwitchField } from '../components/FormSwitchField';
import { dateValueToVerifyTestDate, verifyTestDateToDateValue } from '../llmPlatformHelpers';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';

/** Сесія verify, ліміти спроб і тексти. */
export function VerifyCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="shield-check" title="Верифікація замовлень">
      <p className="text-xs text-default-500">
        Статус і склад замовлення бот показує після перевірки: телефон + номер замовлення або дата.
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <Input
          type="number"
          label="TTL сесії (год)"
          value={String(form.verifySessionTtlHours)}
          onValueChange={(v) => updateField('verifySessionTtlHours', Number(v) || 24)}
        />
        <Input
          type="number"
          label="Спроб / вікно"
          value={String(form.verifyRateLimitMaxAttempts)}
          onValueChange={(v) => updateField('verifyRateLimitMaxAttempts', Number(v) || 5)}
        />
        <Input
          type="number"
          label="Вікно (хв)"
          value={String(form.verifyRateLimitWindowMinutes)}
          onValueChange={(v) => updateField('verifyRateLimitWindowMinutes', Number(v) || 15)}
        />
      </div>
      <Textarea
        label="Повідомлення при невдалій verify"
        minRows={2}
        value={form.verifyFailMessage}
        onValueChange={(v) => updateField('verifyFailMessage', v)}
      />
      <Textarea
        label="Підказка verification_required"
        minRows={2}
        value={form.verifyRequiredHint}
        onValueChange={(v) => updateField('verifyRequiredHint', v)}
      />
    </SettingsCard>
  );
}

/** Ручна перевірка verify на реальних замовленнях (відповідь без PII). */
export function VerifyTestCard({ page }: SettingsCardProps) {
  const {
    verifyTestPhone,
    setVerifyTestPhone,
    verifyTestOrder,
    setVerifyTestOrder,
    verifyTestDate,
    setVerifyTestDate,
    verifyTestResult,
    setVerifyTestResult,
    isVerifyTesting,
    setIsVerifyTesting,
  } = page;

  const run = async () => {
    setIsVerifyTesting(true);
    setVerifyTestResult('');
    try {
      const data = verifyTestDate.trim()
        ? await chatwootBotApi.verifyByDateTest(verifyTestPhone, verifyTestDate)
        : await chatwootBotApi.verifyOrderTest(verifyTestPhone, verifyTestOrder);
      setVerifyTestResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setVerifyTestResult(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setIsVerifyTesting(false);
    }
  };

  return (
    <SettingsCard icon="flask-conical" title="Тест верифікації">
      <div className="flex flex-col md:flex-row md:items-center md:flex-wrap gap-3">
        <Input
          className="flex-1 min-w-[10rem]"
          label="Телефон"
          placeholder="Формат: 0991234567"
          value={verifyTestPhone}
          onValueChange={setVerifyTestPhone}
        />
        <Input
          className="flex-1 min-w-[8rem]"
          label="Номер замовлення"
          placeholder="Напр. 24155"
          value={verifyTestOrder}
          onValueChange={(v) => {
            setVerifyTestOrder(v);
            if (v.trim()) setVerifyTestDate('');
          }}
          isDisabled={Boolean(verifyTestDate.trim())}
          isClearable
        />
        <span className="text-sm text-default-500 shrink-0">або</span>
        <I18nProvider locale="uk-UA">
          <DatePicker
            className="flex-1 min-w-[11rem]"
            label="Дата останнього замовлення"
            labelPlacement="inside"
            granularity="day"
            showMonthAndYearPickers
            selectorButtonPlacement="start"
            value={verifyTestDateToDateValue(verifyTestDate)}
            maxValue={today(getLocalTimeZone())}
            onChange={(date) => {
              setVerifyTestDate(dateValueToVerifyTestDate(date));
              if (date) setVerifyTestOrder('');
            }}
            endContent={
              verifyTestDate.trim() ? (
                <Tooltip content="Очистити дату" placement="top">
                  <Button
                    size="sm"
                    color="danger"
                    variant="light"
                    isIconOnly
                    aria-label="Очистити дату"
                    onPress={() => setVerifyTestDate('')}
                    className="shrink-0 h-6 w-6 min-w-0"
                  >
                    <DynamicIcon name="x" size={14} />
                  </Button>
                </Tooltip>
              ) : null
            }
            classNames={{ base: 'w-full', segment: 'rounded' }}
          />
        </I18nProvider>
      </div>
      <Button
        variant="flat"
        color="success"
        className="px-3 min-w-0 shrink-0 self-start"
        isDisabled={isVerifyTesting}
        startContent={
          <DynamicIcon
            name={isVerifyTesting ? 'loader-2' : 'circle-dashed-check'}
            size={16}
            className={isVerifyTesting ? 'animate-spin' : ''}
          />
        }
        onPress={() => void run()}
      >
        Тест verify
      </Button>
      {verifyTestResult ? (
        <pre className="text-xs bg-default-100 p-2 rounded-lg overflow-auto max-h-40">{verifyTestResult}</pre>
      ) : null}
    </SettingsCard>
  );
}

/** Увімкнення і статуси автоматичного / напівавтоматичного скасування. */
export function OrderCancelCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  const disabled = !form.orderCancelEnabled;

  /** Статус в одному списку прибирає його з іншого: автоматичне й ручне не перетинаються. */
  const setStatuses = (field: 'orderCancelAutoStatuses' | 'orderCancelSemiAutoStatuses', values: string[]) => {
    const other = field === 'orderCancelAutoStatuses' ? 'orderCancelSemiAutoStatuses' : 'orderCancelAutoStatuses';
    updateField(field, values);
    updateField(
      other,
      form[other].filter((s) => !values.includes(s)),
    );
  };

  return (
    <SettingsCard icon="circle-x" title="Скасування замовлень">
      <FormSwitchField
        isSelected={form.orderCancelEnabled}
        onValueChange={(v) => updateField('orderCancelEnabled', v)}
        title="Бот приймає запити на скасування"
        description="Перевірка: телефон + прізвище й імʼя одержувача. Бот уточнює замовлення, питає причину й пропонує допомогу. Вимкнено – такі запити бот передає оператору."
      />
      <Divider />
      <CheckboxGroup
        size="sm"
        label="Автоматичне скасування"
        description="Бот сам ставить статус «Відмова» в SalesDrive. Клієнту прийде email від WooCommerce, якщо email є в замовленні."
        orientation="horizontal"
        isDisabled={disabled}
        value={form.orderCancelAutoStatuses}
        onValueChange={(v) => setStatuses('orderCancelAutoStatuses', v)}
      >
        {ORDER_CANCEL_STATUS_OPTIONS.map((o) => (
          <Checkbox key={o.id} value={o.id}>
            {o.label}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <CheckboxGroup
        size="sm"
        label="Після підтвердження оператором"
        description="Бот передає запит оператору, клієнту – що запит опрацюють. Статуси поза обома списками теж ідуть оператору."
        orientation="horizontal"
        isDisabled={disabled}
        value={form.orderCancelSemiAutoStatuses}
        onValueChange={(v) => setStatuses('orderCancelSemiAutoStatuses', v)}
      >
        {ORDER_CANCEL_STATUS_OPTIONS.map((o) => (
          <Checkbox key={o.id} value={o.id}>
            {o.label}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <p className="text-xs text-default-500 border-t border-default-200/75 pt-4">
        Замовлення в статусі «Продаж», «Відмова», «Повернення» й видалені замовлення – бот не пропонує скасувати.
      </p>
    </SettingsCard>
  );
}

/** Кому і як повідомляти про запит на скасування. */
export function OrderCancelNotifyCard({ page }: SettingsCardProps) {
  const { form, updateField, agents } = page;
  if (!form) return null;
  const disabled = !form.orderCancelEnabled;
  const notifyDisabled = disabled || !form.orderCancelNotifyEnabled;
  const telegramReady = form.hasTelegramNotifyBotToken && Boolean(form.telegramNotifyChatId.trim());

  return (
    <SettingsCard icon="bell-ring" title="Сповіщення про скасування">
      <p className="text-xs text-default-500">
        Приватна нотатка в розмові з номером, статусом, результатом і причиною – завжди.
      </p>
      <FormSwitchField
        isSelected={form.orderCancelNotifyEnabled}
        isDisabled={disabled}
        onValueChange={(v) => updateField('orderCancelNotifyEnabled', v)}
        title="Сповіщати оператора"
        description={`Telegram – для кожного запиту${telegramReady ? '' : ' (бот ще не налаштований – вкладка «Підключення»)'}; призначення розмови – коли потрібна дія оператора (не для автоскасування).`}
      />
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
        <Select
          label="Хто отримує запит"
          isDisabled={notifyDisabled}
          selectedKeys={[form.orderCancelAssignMode]}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            if (key === 'auto_inbox' || key === 'specific_agent') updateField('orderCancelAssignMode', key);
          }}
        >
          <SelectItem key="auto_inbox" textValue="Автоматично">
            Автоматично (Chatwoot inbox assignment)
          </SelectItem>
          <SelectItem key="specific_agent" textValue="Конкретний оператор">
            Конкретний оператор
          </SelectItem>
        </Select>
        {form.orderCancelAssignMode === 'specific_agent' && (
          <Select
            label="Оператор"
            placeholder="Оберіть оператора"
            isDisabled={notifyDisabled}
            selectedKeys={form.orderCancelAssigneeId != null ? [String(form.orderCancelAssigneeId)] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              updateField('orderCancelAssigneeId', key ? Number(key) : null);
            }}
            description="Список – через User PAT (вкладка «Підключення»)."
          >
            {agents.map((a) => (
              <SelectItem key={String(a.id)} textValue={a.name}>
                {a.name} (#{a.id})
              </SelectItem>
            ))}
          </Select>
        )}
      </div>
    </SettingsCard>
  );
}

export function ContactProfileCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="contact-round" title="Профіль контакту">
      <FormSwitchField
        isSelected={form.contactSyncEnabled}
        onValueChange={(v) => updateField('contactSyncEnabled', v)}
        title="Записувати телефон і email у профіль контакту"
        description="Що клієнт написав у чаті – в порожні поля контакту Chatwoot (потрібен User PAT). Якщо номер уже в іншого контакту – приватна нотатка оператору."
      />
    </SettingsCard>
  );
}
