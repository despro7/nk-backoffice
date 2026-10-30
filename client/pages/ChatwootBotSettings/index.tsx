import React from 'react';
import { Card, CardBody, Tab } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import PageTabs from '@/components/PageTabs';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import { CHATWOOT_SETTINGS_TAB_LABELS, type ChatwootSettingsTabKey } from './chatwootBotTabKeys';
import { useChatwootBotSettingsPage } from './useChatwootBotSettingsPage';
import { ConnectionTab } from './tabs/ConnectionTab';
import { RepliesTab } from './tabs/RepliesTab';
import { AiVerifyTab } from './tabs/AiVerifyTab';
import { HandoverReclaimTab } from './tabs/HandoverReclaimTab';
import { JournalTab } from './tabs/JournalTab';

const SettingsChatwootBot: React.FC = () => {
  const { hasPermission } = useRoleAccess();
  const page = useChatwootBotSettingsPage();
  const { form, isLoading, webhookProcessorHealth, activeTab, setActiveTab } = page;

  const canManage = hasPermission(PERMISSIONS.ACTION_CHATWOOT_SETTINGS_MANAGE);

  if (!hasPermission(PERMISSIONS.PAGE_CHATWOOT_SETTINGS)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">У вас немає прав доступу до цієї сторінки.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center h-64 text-default-500">
        Завантаження…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">
        Патерни, AI, verify замовлень, handover, reclaim і робочі години.
      </p>

      {webhookProcessorHealth?.mismatch && (
        <Card className="border-2 border-danger-300 bg-danger-50/40">
          <CardBody className="gap-2 p-4">
            <div className="flex gap-3 items-start">
              <DynamicIcon name="triangle-alert" size={20} className="text-danger shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-base text-danger-800">Webhook не на цей backoffice</p>
                <p className="text-danger-900/90">{webhookProcessorHealth.message}</p>
                <p className="text-xs text-danger-800/80 font-mono">
                  local host={webhookProcessorHealth.localHost ?? '?'} build=
                  {webhookProcessorHealth.localBuild}
                  {webhookProcessorHealth.targetHost
                    ? ` · tunnel host=${webhookProcessorHealth.targetHost} build=${webhookProcessorHealth.targetBuild ?? '?'}`
                    : ''}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {!form.enabled && (
        <Card className="border-2 border-warning-300 bg-warning-50/50">
          <CardBody className="p-4 text-sm text-warning-900">
            <div className="flex gap-3 items-start">
              <DynamicIcon name="triangle-alert" size={20} className="text-warning shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-base">Бот вимкнено</p>
                <p>
                  HTTP webhook може долітати, але обробка йде в{' '}
                  <span className="font-mono">bot_disabled</span> – echo/handover не виконуються. Увімкніть
                  перемикач на вкладці «Підключення», режим <span className="font-mono">live</span> і
                  натисніть «Зберегти».
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {webhookProcessorHealth &&
        !webhookProcessorHealth.mismatch &&
        webhookProcessorHealth.tunnelPointsHere &&
        webhookProcessorHealth.targetHealthUrl?.includes('chatwoot-dev') && (
          <Card className="border border-success-200 bg-success-50/50">
            <CardBody className="p-4 text-sm text-success-900 space-y-1">
              <p>
                Health тунелю chatwoot-dev вказує на цей Mac. Перевірте доставку кнопкою «Тест Outgoing URL» –
                у терміналі має зʼявитись <span className="font-mono text-xs">📦 Webhook raw body</span>.
              </p>
            </CardBody>
          </Card>
        )}

      <PageTabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key) as ChatwootSettingsTabKey)}
      >
        {(Object.keys(CHATWOOT_SETTINGS_TAB_LABELS) as ChatwootSettingsTabKey[]).map((key) => (
          <Tab key={key} title={CHATWOOT_SETTINGS_TAB_LABELS[key]} />
        ))}
      </PageTabs>

      {!canManage && (
        <Card className="border border-default-200 bg-default-50">
          <CardBody className="p-4 flex flex-row gap-3 items-center text-sm text-default-600">
            <DynamicIcon name="eye" size={18} className="shrink-0" />
            Лише перегляд: для зміни налаштувань і тестів потрібне право «Зміна налаштувань і тести чат-бота».
          </CardBody>
        </Card>
      )}

      <div>
        {/* Без права на зміну — нативний disabled блокує всі поля й кнопки вкладок. */}
        <fieldset disabled={!canManage} className="contents">
          {activeTab === 'connection' && <ConnectionTab page={page} />}
          {activeTab === 'replies' && <RepliesTab page={page} />}
          {activeTab === 'ai' && <AiVerifyTab page={page} />}
          {activeTab === 'handover' && <HandoverReclaimTab page={page} />}
        </fieldset>
        {activeTab === 'journal' && <JournalTab page={page} />}
      </div>
    </div>
  );
};

export default SettingsChatwootBot;
