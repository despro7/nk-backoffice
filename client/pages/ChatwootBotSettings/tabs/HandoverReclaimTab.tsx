import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  cn,
  Divider,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { FormSwitchField } from '../components/FormSwitchField';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

type Props = { page: ChatwootBotSettingsPageModel };

export function HandoverReclaimTab({ page }: Props) {
  const {
    form,
    updateField,
    isSaving,
    handleSave,
    agents,
    inboxHours,
    isLoadingInboxHours,
    loadInboxHours,
  } = page;

  if (!form) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      <Card>
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="headset" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Handover і робочі години</h2>
        </CardHeader>
        <CardBody className="gap-4 p-4">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
            <Select
              label="Призначення при handover"
              selectedKeys={[form.handoverAssignMode]}
              onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                if (key === 'auto_inbox' || key === 'specific_agent') {
                  updateField('handoverAssignMode', key);
                }
              }}
              description="Після bot_handoff (open) Chatwoot сам призначає агента, якщо в inbox увімкнено automatic assignment / Assignment V2."
            >
              <SelectItem key="auto_inbox" textValue="Автоматично">
                Автоматично (Chatwoot inbox assignment)
              </SelectItem>
              <SelectItem key="specific_agent" textValue="Конкретний агент">
                Конкретний агент
              </SelectItem>
            </Select>
            <Select
              label="Агент для виклику"
              placeholder="Оберіть агента або введіть ID нижче"
              isDisabled={form.handoverAssignMode === 'auto_inbox'}
              selectedKeys={
                form.handoverAssigneeId != null ? [String(form.handoverAssigneeId)] : []
              }
              onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                updateField('handoverAssigneeId', key ? Number(key) : null);
              }}
              description="ID користувача-агента в Chatwoot (не Agent Bot). Список – через User PAT у полі «Inbox API token»."
            >
              {agents.map((a) => (
                <SelectItem key={String(a.id)} textValue={a.name}>
                  {a.name} (#{a.id})
                </SelectItem>
              ))}
            </Select>
            <Input
              type="number"
              label="Агент ID (вручну)"
              placeholder="напр. 2"
              className="w-full sm:w-40 sm:shrink-0"
              isDisabled={form.handoverAssignMode === 'auto_inbox'}
              value={form.handoverAssigneeId != null ? String(form.handoverAssigneeId) : ''}
              onValueChange={(v) =>
                updateField('handoverAssigneeId', v.trim() ? Number(v) || null : null)
              }
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
            <Input
              type="number"
              label="Inbox ID (fallback / симуляція)"
              description="Робочі години беруться з Chatwoot → Inbox → Робочий час. У webhook використовується inbox_id з conversation; це поле – якщо його немає."
              className="min-w-0 flex-1"
              value={form.handoverDefaultInboxId != null ? String(form.handoverDefaultInboxId) : ''}
              onValueChange={(v) =>
                updateField('handoverDefaultInboxId', v.trim() ? Number(v) || null : null)
              }
            />
            <div className="flex flex-col items-start gap-2 min-w-0">
              {inboxHours ? (
                <Chip
                  size="sm"
                  variant="flat"
                  color={inboxHours.inHours ? 'success' : 'warning'}
                >
                  Зараз: {inboxHours.inHours ? 'робочі години' : 'поза годинами'} ·{' '}
                  {inboxHours.schedule.name} ({inboxHours.source})
                </Chip>
              ) : (
                <span className="text-xs text-default-500">
                  Не вдалося зчитати години inbox – перевірте User PAT.
                </span>
              )}
              <Button
                size="sm"
                color="primary"
                data-btn-tone="primary-blue-flat"
                isLoading={isLoadingInboxHours}
                onPress={() => void loadInboxHours(form.handoverDefaultInboxId)}
              >
                Оновити з Chatwoot
              </Button>
            </div>
          </div>
          <Textarea
            label="Повідомлення клієнту (робочі години, виклик оператора)"
            minRows={2}
            value={form.handoverMessageInHours}
            onValueChange={(v) => updateField('handoverMessageInHours', v)}
          />
          <Textarea
            label="Повідомлення клієнту (поза годинами – бот лишається)"
            minRows={3}
            value={form.handoverMessageOutOfHours}
            onValueChange={(v) => updateField('handoverMessageOutOfHours', v)}
          />
          <Textarea
            label="Підтвердження після збору контактів"
            minRows={2}
            value={form.handoverCallbackAckMessage}
            onValueChange={(v) => updateField('handoverCallbackAckMessage', v)}
          />
          <div className="flex items-center gap-3">
            <Switch
              isSelected={form.handoverEmergencyEnabled}
              onValueChange={(v) => updateField('handoverEmergencyEnabled', v)}
            />
            <div>
              <p className="text-sm font-medium">Екстрений виклик поза годинами</p>
              <p className="text-xs text-default-500">Keywords зараз; пізніше – класифікація Jev</p>
            </div>
          </div>
          <Input
            label="Emergency keywords"
            value={form.handoverEmergencyKeywordsText}
            onValueChange={(v) => updateField('handoverEmergencyKeywordsText', v)}
          />
          <Textarea
            label="Повідомлення клієнту (екстрений виклик)"
            minRows={2}
            value={form.handoverMessageEmergency}
            onValueChange={(v) => updateField('handoverMessageEmergency', v)}
          />
        </CardBody>
        <CardFooter className="p-4">
          <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
            Зберегти
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="rotate-ccw" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Reclaim (повернення діалогу боту)</h2>
        </CardHeader>
        <CardBody className="gap-4 p-4">
          <p className="text-xs text-default-500">
            Якщо діалог уже у людини-оператора, бот може знову відповідати клієнту за правилами нижче.
            Для перевірки «офлайн» і таймаутів мовчання потрібен User PAT (поле Inbox API token).
          </p>
          <FormSwitchField
            isSelected={form.reclaimEnabled}
            onValueChange={(v) => updateField('reclaimEnabled', v)}
            title="Увімкнути reclaim"
            description="Якщо вимкнено – бот лише ігнорує повідомлення, поки діалог у оператора."
          />
          <FormSwitchField
            isSelected={form.resolveCleanupEnabled}
            onValueChange={(v) => updateField('resolveCleanupEnabled', v)}
            title="Скидати «замок» при «Вирішити»"
            description="Зняти оператора з діалогу й дозволити боту після reopen (без публічного повідомлення)."
          />
          <Divider />
          <p className="text-sm font-semibold text-default-800">Завжди (і в робочі, і поза годинами)</p>
          <FormSwitchField
            isSelected={form.reclaimOnAssigneeOffline}
            isDisabled={!form.reclaimEnabled}
            onValueChange={(v) => updateField('reclaimOnAssigneeOffline', v)}
            title="Оператор офлайн у Chatwoot"
            description="Бот відповідає замість оператора, якщо призначений агент не в мережі."
          />
          <Textarea
            label="Текст клієнту (оператор офлайн)"
            minRows={2}
            isDisabled={!form.reclaimEnabled}
            value={form.reclaimMessageOffline}
            onValueChange={(v) => updateField('reclaimMessageOffline', v)}
          />
          <Divider />
          <p className="text-sm font-semibold text-default-800">Поза робочими годинами</p>
          <FormSwitchField
            isSelected={form.reclaimOnOohAgentSilent}
            isDisabled={!form.reclaimEnabled}
            onValueChange={(v) => updateField('reclaimOnOohAgentSilent', v)}
            title="Якщо оператор довго мовчить"
            description="Повернути діалог боту, коли з останньої публічної відповіді оператора минуло N хвилин."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              label="Хвилин мовчання (поза годинами)"
              isDisabled={!form.reclaimEnabled || !form.reclaimOnOohAgentSilent}
              value={String(form.reclaimOohSilentMinutes)}
              onValueChange={(v) =>
                updateField('reclaimOohSilentMinutes', Number(v) || 10)
              }
            />
            <FormSwitchField
              isSelected={form.reclaimOohTreatNoAgentReplyAsSilent}
              isDisabled={!form.reclaimEnabled || !form.reclaimOnOohAgentSilent}
              onValueChange={(v) => updateField('reclaimOohTreatNoAgentReplyAsSilent', v)}
              title="Одразу, якщо оператор ще не відповідав"
              description="Вважати «мовчання» з моменту передачі діалогу людині."
            />
          </div>
          <Textarea
            label="Текст клієнту (поза годинами, після мовчання)"
            minRows={2}
            isDisabled={!form.reclaimEnabled}
            value={form.reclaimMessageOoh}
            onValueChange={(v) => updateField('reclaimMessageOoh', v)}
          />
          <Divider />
          <p className="text-sm font-semibold text-default-800">У робочі години</p>
          <FormSwitchField
            isSelected={form.reclaimInHoursAgentSilentEnabled}
            isDisabled={!form.reclaimEnabled}
            onValueChange={(v) => updateField('reclaimInHoursAgentSilentEnabled', v)}
            title="Reclaim за таймаутом мовчання (опційно)"
            description="За замовчуванням вимкнено: у робочі години бот не перехоплює діалог лише через мовчання."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              label="Хвилин мовчання (у робочі години)"
              isDisabled={
                !form.reclaimEnabled || !form.reclaimInHoursAgentSilentEnabled
              }
              value={String(form.reclaimInHoursSilentMinutes)}
              onValueChange={(v) =>
                updateField('reclaimInHoursSilentMinutes', Number(v) || 10)
              }
            />
            <FormSwitchField
              isSelected={form.reclaimInHoursTreatNoAgentReplyAsSilent}
              isDisabled={
                !form.reclaimEnabled || !form.reclaimInHoursAgentSilentEnabled
              }
              onValueChange={(v) =>
                updateField('reclaimInHoursTreatNoAgentReplyAsSilent', v)
              }
              title="Одразу, якщо оператор ще не відповідав"
              description="Те саме правило, що й поза годинами, але лише в робочий час."
            />
          </div>
          <Textarea
            label="Текст клієнту (робочі години, після мовчання)"
            minRows={2}
            isDisabled={!form.reclaimEnabled}
            value={form.reclaimMessageInHours}
            onValueChange={(v) => updateField('reclaimMessageInHours', v)}
          />
          <Divider />
          <FormSwitchField
            isSelected={form.reclaimContinueWithEcho}
            isDisabled={!form.reclaimEnabled}
            onValueChange={(v) => updateField('reclaimContinueWithEcho', v)}
            title="Після reclaim відповісти на це ж повідомлення"
            description="Echo або handover на поточний webhook (інакше – лише текст reclaim)."
          />
        </CardBody>
        <CardFooter className="p-4">
          <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
            Зберегти
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
