import React, { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  CheckboxGroup,
  Divider,
  Input,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ORDER_CANCEL_STATUS_OPTIONS } from '@shared/constants/chatwootBotOrderCancel';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { ToastService } from '@/services/ToastService';
import { FormSwitchField } from '../components/FormSwitchField';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

type Props = { page: ChatwootBotSettingsPageModel };

export function OrderCancelTab({ page }: Props) {
  const { form, updateField, isSaving, handleSave, agents } = page;
  const [tokenVisible, setTokenVisible] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);

  if (!form) return null;

  const disabled = !form.orderCancelEnabled;
  const notifyDisabled = disabled || !form.orderCancelNotifyEnabled;

  /** Статус в одному списку прибирає його з іншого: автоматичне й ручне не перетинаються. */
  const setStatuses = (field: 'orderCancelAutoStatuses' | 'orderCancelSemiAutoStatuses', values: string[]) => {
    const other = field === 'orderCancelAutoStatuses' ? 'orderCancelSemiAutoStatuses' : 'orderCancelAutoStatuses';
    updateField(field, values);
    updateField(
      other,
      form[other].filter((s) => !values.includes(s)),
    );
  };

  const testTelegram = async () => {
    setIsTestingTelegram(true);
    try {
      await chatwootBotApi.testTelegram(form.telegramNotifyBotToken || undefined, form.telegramNotifyChatId || undefined);
      ToastService.show({ title: 'Telegram', description: 'Тестове повідомлення надіслано', color: 'success' });
    } catch (e) {
      ToastService.show({
        title: 'Telegram',
        description: e instanceof Error ? e.message : 'Не вдалося надіслати',
        color: 'danger',
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const saveFooter = (
    <CardFooter className="px-4 pb-4 pt-0">
      <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
        Зберегти
      </Button>
    </CardFooter>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <Card>
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="circle-x" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Скасування замовлень</h2>
        </CardHeader>
        <CardBody className="gap-4 p-4">
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
        </CardBody>
        {saveFooter}
      </Card>

      <Card>
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="bell-ring" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Сповіщення оператора</h2>
        </CardHeader>
        <CardBody className="gap-4 p-4">
          <p className="text-xs text-default-500">
            Приватна нотатка в розмові з номером, статусом, результатом і причиною – завжди.
          </p>
          <FormSwitchField
            isSelected={form.orderCancelNotifyEnabled}
            isDisabled={disabled}
            onValueChange={(v) => updateField('orderCancelNotifyEnabled', v)}
            title="Сповіщати оператора"
            description="Telegram – для кожного запиту; призначення розмови – коли потрібна дія оператора (не для автоскасування)."
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
            <Select
              label="Оператор"
              placeholder="Оберіть оператора"
              isDisabled={notifyDisabled || form.orderCancelAssignMode !== 'specific_agent'}
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
          </div>
          <Divider />
          <p className="text-sm font-semibold text-default-800">Telegram</p>
          <Input
            label="Токен Telegram-бота"
            type={tokenVisible ? 'text' : 'password'}
            isDisabled={form.clearTelegramNotifyBotToken}
            placeholder={
              form.hasTelegramNotifyBotToken
                ? `Збережено: ${form.telegramNotifyBotTokenMasked}`
                : '123456789:AA… від @BotFather'
            }
            value={form.telegramNotifyBotToken}
            onValueChange={(v) => updateField('telegramNotifyBotToken', v)}
            endContent={
              <div className="flex items-center">
                {form.telegramNotifyBotToken.trim() ? (
                  <Tooltip content={tokenVisible ? 'Приховати' : 'Показати'} placement="top">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      aria-label={tokenVisible ? 'Приховати токен' : 'Показати токен'}
                      onPress={() => setTokenVisible((v) => !v)}
                    >
                      <DynamicIcon name={tokenVisible ? 'eye-off' : 'eye'} size={16} />
                    </Button>
                  </Tooltip>
                ) : null}
                {form.hasTelegramNotifyBotToken ? (
                  <Tooltip
                    content={form.clearTelegramNotifyBotToken ? 'Не очищати' : 'Очистити при збереженні'}
                    placement="top"
                  >
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      aria-label="Очистити токен Telegram"
                      color={form.clearTelegramNotifyBotToken ? 'danger' : 'default'}
                      onPress={() => updateField('clearTelegramNotifyBotToken', !form.clearTelegramNotifyBotToken)}
                    >
                      <DynamicIcon name="trash-2" size={16} />
                    </Button>
                  </Tooltip>
                ) : null}
              </div>
            }
          />
          <div className="flex gap-3 items-start">
            <Input
              label="Chat ID"
              placeholder="-100… для групи"
              description="Додайте бота в групу операторів; chat id групи – через @getidsbot або getUpdates."
              value={form.telegramNotifyChatId}
              onValueChange={(v) => updateField('telegramNotifyChatId', v)}
            />
            <Button
              size="lg"
              variant="flat"
              className="h-14 shrink-0"
              isDisabled={isTestingTelegram}
              startContent={
                <DynamicIcon
                  name={isTestingTelegram ? 'loader-2' : 'send'}
                  size={16}
                  className={isTestingTelegram ? 'animate-spin' : ''}
                />
              }
              onPress={() => void testTelegram()}
            >
              Тест
            </Button>
          </div>
        </CardBody>
        {saveFooter}
      </Card>
    </div>
  );
}
