import { useCallback, useEffect, useState } from 'react';
import { Tab } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { parseUrlHash, useUrlHashSync } from '@/hooks/useUrlHashSync';
import { ToastService } from '@/services/ToastService';
import { notificationSettingsApi, NotificationSettingsApiError } from '@/services/NotificationSettingsService';
import type { NotificationGlossaryEntry, NotificationRuleDef } from '@shared/types/notificationRules';
import type {
  NotificationConfigRevisionDto,
  NotificationRawLog,
  NotificationSourceSummary,
} from '@shared/types/notificationSettings';
import { PreviewTab } from './components/PreviewTab';
import { RulesTab } from './components/RulesTab';
import { RuleEditorDrawer } from './components/RuleEditorDrawer';
import { TesterTab } from './components/TesterTab';
import { SourcesTab } from './components/SourcesTab';
import { GlossaryTab } from './components/GlossaryTab';
import { HistoryTab } from './components/HistoryTab';
import { emptyRule, ruleFromSample } from './notificationPlayground';

const TABS = {
  preview: 'Перегляд',
  rules: 'Правила',
  tester: 'Тестер',
  sources: 'Джерела',
  glossary: 'Словник',
  history: 'Історія',
} as const;

type TabKey = keyof typeof TABS;

function parseTab(raw: string | null): TabKey {
  return raw && raw in TABS ? (raw as TabKey) : 'preview';
}

/** Скільки останніх записів журналу брати для перевірки правил у браузері. */
const SAMPLE_SIZE = 800;

function toastError(err: unknown, title = 'Не вдалося зберегти') {
  ToastService.show({ title, description: err instanceof Error ? err.message : String(err), color: 'danger' });
}

export default function SettingsNotifications() {
  const initialLog = Number(new URLSearchParams(window.location.search).get('log')) || null;
  const [tab, setTab] = useState<TabKey>(initialLog ? 'tester' : parseTab(parseUrlHash(window.location.hash).get('tab')));
  const [rules, setRules] = useState<NotificationRuleDef[]>([]);
  const [glossary, setGlossary] = useState<NotificationGlossaryEntry[]>([]);
  const [logs, setLogs] = useState<NotificationRawLog[]>([]);
  const [sources, setSources] = useState<NotificationSourceSummary[] | null>(null);
  const [revisions, setRevisions] = useState<NotificationConfigRevisionDto[] | null>(null);
  const [roles, setRoles] = useState<Array<{ slug: string; name: string }>>([]);
  const [editing, setEditing] = useState<NotificationRuleDef | null>(null);
  const [focusLogId, setFocusLogId] = useState<number | null>(initialLog);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  useUrlHashSync({ tab: tab === 'preview' ? null : tab }, (params) => setTab(parseTab(params.get('tab'))));

  const reloadConfig = useCallback(async () => {
    const [r, g] = await Promise.all([notificationSettingsApi.rules(), notificationSettingsApi.glossary()]);
    setRules(r);
    setGlossary(g);
    setVersion((v) => v + 1);
    setSources(null);
    setRevisions(null);
  }, []);

  useEffect(() => {
    reloadConfig().catch((err) => toastError(err, 'Не вдалося завантажити правила'));
    notificationSettingsApi.logs({ limit: SAMPLE_SIZE }).then(setLogs).catch(() => setLogs([]));
    fetch('/api/roles', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Array<{ slug: string; name: string }>) => setRoles(list.map((r) => ({ slug: r.slug, name: r.name }))))
      .catch(() => setRoles([]));
  }, [reloadConfig]);

  useEffect(() => {
    if (tab === 'sources' && sources === null) {
      notificationSettingsApi.sources().then(setSources).catch(() => setSources([]));
    }
    if (tab === 'history' && revisions === null) {
      notificationSettingsApi.revisions().then(setRevisions).catch(() => setRevisions([]));
    }
  }, [tab, sources, revisions]);

  const saveRule = async (rule: NotificationRuleDef): Promise<string[] | null> => {
    try {
      if (rule.id != null) await notificationSettingsApi.updateRule(rule.id, rule);
      else await notificationSettingsApi.createRule(rule);
      await reloadConfig();
      setEditing(null);
      ToastService.show({ title: 'Правило збережено', color: 'success' });
      return null;
    } catch (err) {
      if (err instanceof NotificationSettingsApiError && err.details.length) return err.details;
      toastError(err);
      return null;
    }
  };

  const withBusy = async (fn: () => Promise<unknown>, errorTitle?: string) => {
    setBusy(true);
    try {
      await fn();
      await reloadConfig();
    } catch (err) {
      toastError(err, errorTitle);
    } finally {
      setBusy(false);
    }
  };

  const moveRule = (rule: NotificationRuleDef, direction: -1 | 1) => {
    const ids = rules.map((r) => r.id!).filter((id) => id != null);
    const i = ids.indexOf(rule.id!);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    withBusy(() => notificationSettingsApi.reorderRules(ids));
  };

  const openTester = (logId: number) => {
    setFocusLogId(logId);
    setTab('tester');
  };

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-default-500">
        Що потрапляє в дропдаун сповіщень і як воно виглядає. Записи журналу (<code className="text-xs">meta_logs</code>) проходять через
        правила: перше увімкнене правило, що підійшло, визначає тип, групу, текст і кнопку. Після правил застосовується словник.
      </p>

      <PageTabs selectedKey={tab} onSelectionChange={(key) => setTab(parseTab(String(key)))}>
        {(Object.keys(TABS) as TabKey[]).map((key) => (
          <Tab key={key} title={TABS[key]} />
        ))}
      </PageTabs>

      {tab === 'preview' && (
        <PreviewTab roles={roles} version={version} onEditRule={(item) => openTester(item.id)} />
      )}
      {tab === 'rules' && (
        <RulesTab
          rules={rules}
          logs={logs}
          busy={busy}
          onEdit={setEditing}
          onCreate={() => setEditing(emptyRule())}
          onToggle={(rule, enabled) => withBusy(() => notificationSettingsApi.setRuleEnabled(rule.id!, enabled))}
          onMove={moveRule}
        />
      )}
      {tab === 'tester' && (
        <TesterTab rules={rules} glossary={glossary} logs={logs} focusLogId={focusLogId} onEditRule={setEditing} />
      )}
      {tab === 'sources' && (
        <SourcesTab
          sources={sources}
          onTest={(s) => openTester(s.sampleId)}
          onCreateRule={(s) => setEditing(ruleFromSample(s))}
        />
      )}
      {tab === 'glossary' && (
        <GlossaryTab
          glossary={glossary}
          onSave={async (entry) => {
            try {
              if (entry.id != null) await notificationSettingsApi.updateGlossary(entry.id, entry);
              else await notificationSettingsApi.createGlossary(entry);
              await reloadConfig();
              return true;
            } catch (err) {
              toastError(err);
              return false;
            }
          }}
          onDelete={(entry) => withBusy(() => notificationSettingsApi.deleteGlossary(entry.id!))}
        />
      )}
      {tab === 'history' && (
        <HistoryTab
          revisions={revisions}
          onRevert={(r) => withBusy(() => notificationSettingsApi.revert(r.id), 'Не вдалося відкотити')}
        />
      )}

      <RuleEditorDrawer
        isOpen={editing !== null}
        initial={editing}
        rules={rules}
        glossary={glossary}
        logs={logs}
        onClose={() => setEditing(null)}
        onSave={saveRule}
        onDelete={async (rule) => {
          await withBusy(() => notificationSettingsApi.deleteRule(rule.id!));
          setEditing(null);
        }}
        onReset={async (rule) => {
          await withBusy(() => notificationSettingsApi.resetRule(rule.id!));
          setEditing(null);
        }}
      />
    </div>
  );
}
