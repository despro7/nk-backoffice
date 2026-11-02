import React from 'react';
import { Button, Chip, Divider, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { CHATWOOT_BOT_EMERGENCY_TIMEOUT_LIMITS } from '@shared/types/chatwootBot';
import { textToKeywords } from '../chatwootBotFormState';
import { FormSwitchField } from '../components/FormSwitchField';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';

/** Коли кличемо людину і кого призначаємо. */
export function OperatorCallCard({ page }: SettingsCardProps) {
  const { form, updateField, agents } = page;
  if (!form) return null;
  const keywordChips = textToKeywords(form.handoverKeywordsText);

  return (
    <SettingsCard icon="headset" title="Виклик оператора">
      <Input
        label="Ключові слова"
        placeholder="оператор, людина, менеджер"
        value={form.handoverKeywordsText}
        onValueChange={(v) => updateField('handoverKeywordsText', v)}
        description="Через кому, без урахування регістру. Також бот кличе оператора сам, коли не знайшов відповіді."
      />
      {keywordChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {keywordChips.map((kw) => (
            <Chip key={kw} size="sm" variant="flat">
              {kw}
            </Chip>
          ))}
        </div>
      )}
      <Select
        label="Призначення при handover"
        selectedKeys={[form.handoverAssignMode]}
        onSelectionChange={(keys) => {
          const key = Array.from(keys)[0];
          if (key === 'auto_inbox' || key === 'specific_agent') updateField('handoverAssignMode', key);
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
      {form.handoverAssignMode === 'specific_agent' && (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
          <Select
            label="Агент для виклику"
            placeholder="Оберіть агента або введіть ID нижче"
            selectedKeys={form.handoverAssigneeId != null ? [String(form.handoverAssigneeId)] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              updateField('handoverAssigneeId', key ? Number(key) : null);
            }}
            description="ID користувача-агента в Chatwoot (не Agent Bot). Список – через User PAT."
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
            value={form.handoverAssigneeId != null ? String(form.handoverAssigneeId) : ''}
            onValueChange={(v) => updateField('handoverAssigneeId', v.trim() ? Number(v) || null : null)}
          />
        </div>
      )}
      <Divider />
      <FormSwitchField
        isSelected={form.handoverEmergencyEnabled}
        onValueChange={(v) => updateField('handoverEmergencyEnabled', v)}
        title="Екстрений виклик поза годинами"
        description="Ключове слово підключає оператора навіть уночі."
      />
      <Input
        label="Ключові слова екстреного виклику"
        isDisabled={!form.handoverEmergencyEnabled}
        value={form.handoverEmergencyKeywordsText}
        onValueChange={(v) => updateField('handoverEmergencyKeywordsText', v)}
      />
      <Input
        type="number"
        label="Чекати відповідь оператора, хв"
        min={CHATWOOT_BOT_EMERGENCY_TIMEOUT_LIMITS.min}
        max={CHATWOOT_BOT_EMERGENCY_TIMEOUT_LIMITS.max}
        isDisabled={!form.handoverEmergencyEnabled}
        value={String(form.handoverEmergencyTimeoutMinutes)}
        onValueChange={(v) => updateField('handoverEmergencyTimeoutMinutes', Number(v) || 5)}
        description="Не відповів публічно за цей час (або не вдалося призначити) – бот забирає розмову, надсилає текст «оператор не відповів» і просить контакти."
      />
      <FormSwitchField
        isSelected={form.handoverEmergencyTelegramEnabled}
        isDisabled={!form.handoverEmergencyEnabled}
        onValueChange={(v) => updateField('handoverEmergencyTelegramEnabled', v)}
        title="Екстрений виклик – у Telegram"
        description="Одразу при виклику і повторно, якщо оператор не відповів. Бот – вкладка «Підключення»."
      />
    </SettingsCard>
  );
}

export function WorkingHoursCard({ page }: SettingsCardProps) {
  const { form, updateField, inboxHours, isLoadingInboxHours, loadInboxHours } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="clock" title="Робочі години">
      <Input
        type="number"
        label="Inbox ID (fallback / симуляція)"
        description="Години беруться з Chatwoot → Inbox → Робочий час. У webhook – inbox_id розмови; це поле – якщо його немає."
        value={form.handoverDefaultInboxId != null ? String(form.handoverDefaultInboxId) : ''}
        onValueChange={(v) => updateField('handoverDefaultInboxId', v.trim() ? Number(v) || null : null)}
      />
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {inboxHours ? (
          <Chip variant="flat" color={inboxHours.inHours ? 'success' : 'warning'} className="rounded-sm h-8">
            Зараз: {inboxHours.inHours ? 'робочі години' : 'поза годинами'} · {inboxHours.schedule.name} (
            {inboxHours.source})
          </Chip>
        ) : (
          <span className="text-xs text-default-500">Не вдалося зчитати години inbox – перевірте User PAT.</span>
        )}
        <Button
          size="sm"
          variant="bordered"
          color="secondary"
          className="h-8 border-1"
          isDisabled={isLoadingInboxHours}
          startContent={
            <DynamicIcon
              name={isLoadingInboxHours ? 'loader-2' : 'refresh-cw'}
              size={14}
              className={isLoadingInboxHours ? 'animate-spin' : ''}
            />
          }
          onPress={() => void loadInboxHours(form.handoverDefaultInboxId)}
        >
          Оновити з Chatwoot
        </Button>
      </div>
    </SettingsCard>
  );
}

/** Тексти клієнту в робочі години: оператор на звʼязку. */
export function InHoursMessagesCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="sun" title="Тексти клієнту: робочі години">
      <Textarea
        label="Клієнт просить оператора"
        description="Бот призначає оператора й більше не відповідає в цій розмові."
        minRows={2}
        value={form.handoverMessageInHours}
        onValueChange={(v) => updateField('handoverMessageInHours', v)}
      />
      <Textarea
        label="Бот не знайшов відповіді"
        description="Бот сам кличе оператора (request_operator); питання й тема – у приватній нотатці для оператора."
        minRows={2}
        value={form.handoverMessageNoAnswerInHours}
        onValueChange={(v) => updateField('handoverMessageNoAnswerInHours', v)}
      />
    </SettingsCard>
  );
}

/** Тексти клієнту поза робочими годинами: збір контактів і екстрений виклик. */
export function OutOfHoursMessagesCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="moon" title="Тексти клієнту: поза годинами">
      <Textarea
        label="Клієнт просить оператора"
        description="Бот лишається в розмові й пропонує допомогу або дзвінок."
        minRows={3}
        value={form.handoverMessageOutOfHours}
        onValueChange={(v) => updateField('handoverMessageOutOfHours', v)}
      />
      <Textarea
        label="Бот не знайшов відповіді"
        description="Одразу просимо контакти; питання клієнта піде оператору разом з ними."
        minRows={2}
        value={form.handoverMessageNoAnswerOutOfHours}
        onValueChange={(v) => updateField('handoverMessageNoAnswerOutOfHours', v)}
      />
      <Textarea
        label="Підтвердження після збору контактів"
        minRows={2}
        value={form.handoverCallbackAckMessage}
        onValueChange={(v) => updateField('handoverCallbackAckMessage', v)}
      />
      <FormSwitchField
        isSelected={form.handoverCallbackTelegramEnabled}
        onValueChange={(v) => updateField('handoverCallbackTelegramEnabled', v)}
        title="Контакти для дзвінка – ще й у Telegram"
        description="Телефон, імʼя і питання клієнта. Приватна нотатка в розмові – завжди. Бот – вкладка «Підключення»."
      />
      <Textarea
        label="Екстрений виклик"
        minRows={2}
        isDisabled={!form.handoverEmergencyEnabled}
        value={form.handoverMessageEmergency}
        onValueChange={(v) => updateField('handoverMessageEmergency', v)}
      />
      <Textarea
        label="Екстрений виклик: оператор не відповів"
        minRows={2}
        isDisabled={!form.handoverEmergencyEnabled}
        value={form.handoverMessageEmergencyFallback}
        onValueChange={(v) => updateField('handoverMessageEmergencyFallback', v)}
      />
    </SettingsCard>
  );
}

/** Повернення діалогу боту від оператора. */
export function ReclaimCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="rotate-ccw" title="Reclaim (повернення діалогу боту)">
      <p className="text-xs text-default-500">
        Якщо діалог уже у людини-оператора, бот може знову відповідати клієнту за правилами нижче. Для перевірки
        «офлайн» і таймаутів мовчання потрібен User PAT.
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
          onValueChange={(v) => updateField('reclaimOohSilentMinutes', Number(v) || 10)}
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
          isDisabled={!form.reclaimEnabled || !form.reclaimInHoursAgentSilentEnabled}
          value={String(form.reclaimInHoursSilentMinutes)}
          onValueChange={(v) => updateField('reclaimInHoursSilentMinutes', Number(v) || 10)}
        />
        <FormSwitchField
          isSelected={form.reclaimInHoursTreatNoAgentReplyAsSilent}
          isDisabled={!form.reclaimEnabled || !form.reclaimInHoursAgentSilentEnabled}
          onValueChange={(v) => updateField('reclaimInHoursTreatNoAgentReplyAsSilent', v)}
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
    </SettingsCard>
  );
}
