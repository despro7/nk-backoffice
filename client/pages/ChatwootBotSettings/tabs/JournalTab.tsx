import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  cn,
  Divider,
  Input,
  Switch,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { actionColor, formatEventLogDetails } from '../eventLogFormat';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

type Props = { page: ChatwootBotSettingsPageModel };

export function JournalTab({ page }: Props) {
  const {
    form,
    updateField,
    loadEvents,
    events,
    clearEventsConfirm,
    setClearEventsConfirm,
    isClearingEvents,
    handleClearEvents,
    expandedPayloadIds,
    togglePayloadExpanded,
    unassigningConvId,
    handleUnassignConversation,
  } = page;

  if (!form) return null;

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      <Card className="flex-1 shrink-0">
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="database" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Журнал webhook</h2>
        </CardHeader>
        <CardBody className="gap-4 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              label="TTL (днів)"
              description="Записи старші за цей термін видаляються"
              value={String(form.eventLogRetentionDays)}
              onValueChange={(v) => updateField('eventLogRetentionDays', Number(v) || 14)}
            />
            <Input
              type="number"
              label="Макс. записів"
              description="Після перевищення видаляються найстаріші"
              value={String(form.eventLogMaxRecords)}
              onValueChange={(v) => updateField('eventLogMaxRecords', Number(v) || 300)}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Switch
                isSelected={form.eventLogStoreFullPayload}
                onValueChange={(v) => updateField('eventLogStoreFullPayload', v)}
              />
              <div>
                <p className="text-sm font-medium">Повний JSON payload</p>
                <p className="text-xs text-default-500">
                  Увімкніть на час діагностики; збільшує розмір БД (обрізання ~64 KB).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                isSelected={form.eventLogPersistPrivate}
                onValueChange={(v) => updateField('eventLogPersistPrivate', v)}
              />
              <div>
                <p className="text-sm font-medium">Логувати private notes</p>
                <p className="text-xs text-default-500">
                  Debug: внутрішні нотатки агентів (`private_message`) у «Останні події».
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                isSelected={form.eventLogPersistOtherNoise}
                onValueChange={(v) => updateField('eventLogPersistOtherNoise', v)}
              />
              <div>
                <p className="text-sm font-medium">Логувати інший шум webhook</p>
                <p className="text-xs text-default-500">
                  Debug: outgoing, unsupported_event, sender_not_contact (не duplicate).
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="flex flex-col min-h-0">
        <CardHeader className="flex gap-2 px-4 items-center justify-between border-b border-default-200 shrink-0">
          <div className="flex gap-2 items-center">
            <DynamicIcon name="scroll-text" size={20} className="text-default-600" />
            <h2 className="text-lg font-semibold">Останні події</h2>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="light"
              color="danger"
              isDisabled={isClearingEvents}
              onPress={() => void handleClearEvents()}
              className={cn(
                'transition-[width,padding,background-color,box-shadow,color] duration-300 ease-out',
                clearEventsConfirm &&
                  'bg-danger/20 font-medium shadow-sm ring-1 ring-danger/30',
              )}
              startContent={
                <DynamicIcon
                  name={isClearingEvents ? 'loader-2' : 'trash-2'}
                  className={isClearingEvents ? 'animate-spin' : ''}
                  size={16}
                />
              }
            >
              {clearEventsConfirm ? 'Підтверджуєте очистку?' : 'Очистити історію'}
            </Button>
            <Button
              size="sm"
              variant="flat"
              onPress={() => {
                setClearEventsConfirm(false);
                void loadEvents();
              }}
            >
              Оновити
            </Button>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col flex-1 min-h-0 max-h-full p-0">
          <div className="overflow-hidden relative h-full min-h-96">
            <div className="pointer-events-none absolute bottom-0 left-0 right-4 h-12 z-10 bg-white [mask-image:linear-gradient(to_top,black_20%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,black_20%,transparent_100%)]"/>
            
            <div className="absolute inset-0 overflow-y-auto p-4">
              {events.length === 0 ? (
                <p className="text-sm text-default-500">Подій ще немає. Запустіть симуляцію.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((ev) => (
                    <li key={ev.id} className="text-sm border-b border-default-100 pb-2 last:border-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" color={actionColor(ev.action)} variant="flat">
                          {ev.action}
                        </Chip>
                        {ev.dryRun && (
                          <Chip size="sm" variant="bordered">
                            dry_run
                          </Chip>
                        )}
                        <span className="text-xs text-default-400 font-mono">
                          {new Date(ev.at).toLocaleString('uk-UA')}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-default-700">
                          {ev.reason}
                          {ev.conversationId != null ? ` · conv #${ev.conversationId}` : ''}
                        </p>
                        {ev.reason === 'human_agent_active' && ev.conversationId != null && (
                          <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            className="h-7 min-w-0 px-2 text-xs"
                            isDisabled={unassigningConvId != null}
                            onPress={() => void handleUnassignConversation(ev.conversationId!)}
                            startContent={
                              <DynamicIcon
                                name={
                                  unassigningConvId === ev.conversationId
                                    ? 'loader-2'
                                    : 'user-round-x'
                                }
                                className={
                                  unassigningConvId === ev.conversationId ? 'animate-spin' : ''
                                }
                                size={14}
                              />
                            }
                          >
                            Зняти assignee
                          </Button>
                        )}
                      </div>
                      {ev.contentPreview && (
                        <p className="text-xs text-default-500 mt-0.5">«{ev.contentPreview}»</p>
                      )}
                      {ev.details && (
                        <p className="text-xs text-default-400 mt-0.5 font-mono break-words">
                          {formatEventLogDetails(ev.details)}
                        </p>
                      )}
                      {ev.headersMeta && (
                        <p className="text-xs text-default-400 mt-0.5 font-mono">
                          {[
                            ev.headersMeta.detectedScheme,
                            ev.webhookEvent,
                            ev.source === 'webhook' ? 'webhook' : 'simulate',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      {ev.payloadJson != null && (
                        <div className="mt-1">
                          <Button
                            size="sm"
                            variant="flat"
                            className="h-7 min-w-0 pl-2 pr-3 text-xs text-default-500 gap-1"
                            onPress={() => togglePayloadExpanded(ev.id)}
                            disableRipple
                            startContent={
                              <DynamicIcon
                                name="chevron-right"
                                className={expandedPayloadIds.has(ev.id) ? 'rotate-90 duration-200' : 'duration-200'}
                                size={14}
                              />
                            }
                          >
                            {expandedPayloadIds.has(ev.id) ? 'Сховати payload' : 'Показати повний payload'}
                          </Button>
                          {expandedPayloadIds.has(ev.id) && (
                            <pre className="text-xs text-default-500 mt-1 p-2 bg-default-100 rounded-medium overflow-x-auto h-60 resize-y">
                              {JSON.stringify(ev.payloadJson, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <Divider className="shrink-0" />
          <p className="text-xs text-default-400 shrink-0 p-4">
            Зберігається в БД (TTL і ліміт записів – у блоці «Журнал webhook»). Показує схему auth у
            заголовках без значень secret/signature.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
