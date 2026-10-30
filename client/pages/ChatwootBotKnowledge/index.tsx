import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootKnowledgeApi } from '@/services/ChatwootKnowledgeService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { BTN_PRIMARY_BLUE } from '@/lib/buttonStyles';
import { PERMISSIONS } from '@shared/constants/permissions';
import type {
  ChatwootBotKnowledgeEntry,
  ChatwootBotKnowledgeSearchHit,
} from '@shared/types/chatwootBotKnowledge';
import { HR_TABLE_CLASS_NAMES } from '../Hr/hrUi';
import { KnowledgeEntryDrawer } from './KnowledgeEntryDrawer';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Вхідне питання з URL `#new=...` (кнопка «Додати в базу знань» на сторінці статистики). */
function readQuestionFromHash(): string | null {
  const match = window.location.hash.match(/^#new=(.*)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default function ChatwootBotKnowledgePage() {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_CHATWOOT_KNOWLEDGE_MANAGE);

  const [entries, setEntries] = useState<ChatwootBotKnowledgeEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filter, setFilter] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<ChatwootBotKnowledgeEntry | null>(null);
  const [initialQuestion, setInitialQuestion] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ChatwootBotKnowledgeEntry | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [testQuery, setTestQuery] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [testHits, setTestHits] = useState<ChatwootBotKnowledgeSearchHit[] | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setEntries(await chatwootKnowledgeApi.list());
    } catch (e) {
      ToastService.show({
        title: 'Не вдалося завантажити базу знань',
        description: e instanceof Error ? e.message : String(e),
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const question = readQuestionFromHash();
    if (question && canManage) {
      setEditing(null);
      setInitialQuestion(question);
      setDrawerOpen(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [canManage]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.title, e.answer, ...e.questions, ...e.tags].some((text) => text.toLowerCase().includes(q)),
    );
  }, [entries, filter]);

  const openNew = (): void => {
    setEditing(null);
    setInitialQuestion(undefined);
    setDrawerOpen(true);
  };

  const openEdit = (entry: ChatwootBotKnowledgeEntry): void => {
    setEditing(entry);
    setInitialQuestion(undefined);
    setDrawerOpen(true);
  };

  const handleSaved = (saved: ChatwootBotKnowledgeEntry): void => {
    setEntries((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)]);
    setDrawerOpen(false);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await chatwootKnowledgeApi.remove(deleteTarget.id);
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      ToastService.show({ title: 'Статтю видалено', color: 'success' });
      setDeleteTarget(null);
    } catch (e) {
      ToastService.show({
        title: 'Не вдалося видалити',
        description: e instanceof Error ? e.message : String(e),
        color: 'danger',
      });
    } finally {
      setDeleting(false);
    }
  };

  const runSearchTest = async (): Promise<void> => {
    if (!testQuery.trim()) return;
    setTesting(true);
    try {
      setTestHits(await chatwootKnowledgeApi.search(testQuery));
    } catch (e) {
      ToastService.show({
        title: 'Пошук не вдався',
        description: e instanceof Error ? e.message : String(e),
        color: 'danger',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">
        Факти, до яких бот звертається через інструмент <span className="font-mono">search_knowledge_base</span>.
        Бот знаходить статтю за варіантами питання, назвою й тегами та відповідає своїми словами.
      </p>

      <Card>
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="search-check" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">Перевірити пошук</h2>
        </CardHeader>
        <CardBody className="gap-3 p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              className="flex-1"
              placeholder="Напр.: скільки коштує доставка до Львова?"
              value={testQuery}
              onValueChange={setTestQuery}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearchTest();
              }}
            />
            <Button
              variant="flat"
              isDisabled={testing || !testQuery.trim()}
              onPress={() => void runSearchTest()}
              startContent={
                <DynamicIcon name={testing ? 'loader-2' : 'search'} size={16} className={testing ? 'animate-spin' : ''} />
              }
            >
              Що знайде бот
            </Button>
          </div>
          {testHits && (
            testHits.length === 0 ? (
              <p className="text-xs text-default-500">
                Нічого не знайдено. Додайте це формулювання у варіанти питання потрібної статті.
              </p>
            ) : (
              <ul className="space-y-1">
                {testHits.map((hit) => (
                  <li key={hit.id} className="text-sm flex items-center gap-2">
                    <Chip size="sm" variant="flat">
                      {hit.score.toFixed(1)}
                    </Chip>
                    {hit.title}
                  </li>
                ))}
              </ul>
            )
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-2 px-4 sm:items-center border-b border-default-200">
          <div className="flex items-center gap-2 flex-1">
            <DynamicIcon name="book-open" size={20} className="text-default-600" />
            <h2 className="text-lg font-semibold">Статті</h2>
            <Chip size="sm" variant="flat">
              {entries.length}
            </Chip>
          </div>
          <Input
            size="sm"
            className="sm:max-w-xs"
            placeholder="Фільтр"
            value={filter}
            onValueChange={setFilter}
            startContent={<DynamicIcon name="filter" size={14} className="text-default-400" />}
          />
          {canManage && (
            <Button
              size="sm"
              className={BTN_PRIMARY_BLUE}
              onPress={openNew}
              startContent={<DynamicIcon name="plus" size={16} />}
            >
              Додати статтю
            </Button>
          )}
        </CardHeader>
        <CardBody className="p-3">
          <Table aria-label="Статті бази знань" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
            <TableHeader>
              <TableColumn>Назва</TableColumn>
              <TableColumn width={110}>Питань</TableColumn>
              <TableColumn>Теги</TableColumn>
              <TableColumn width={110}>Стан</TableColumn>
              <TableColumn width={130}>Використано</TableColumn>
              <TableColumn width={120}>Оновлено</TableColumn>
              <TableColumn width={100}>{' '}</TableColumn>
            </TableHeader>
            <TableBody
              isLoading={loading}
              emptyContent={
                entries.length === 0
                  ? 'Статей ще немає. Почніть з найчастіших питань зі статистики бота.'
                  : 'Нічого не знайдено за фільтром.'
              }
            >
              {filtered.map((entry) => (
                <TableRow key={entry.id} className="group cursor-pointer" onClick={() => openEdit(entry)}>
                  <TableCell className="font-medium">{entry.title}</TableCell>
                  <TableCell>{entry.questions.length}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <Chip key={tag} size="sm" variant="flat">
                          {tag}
                        </Chip>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color={entry.enabled ? 'success' : 'default'}>
                      {entry.enabled ? 'Активна' : 'Вимкнена'}
                    </Chip>
                  </TableCell>
                  <TableCell>{entry.hits}</TableCell>
                  <TableCell className="text-xs text-default-500">{formatDate(entry.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip content={canManage ? 'Редагувати' : 'Переглянути'}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          className="text-blue-600"
                          aria-label="Редагувати статтю"
                          onPress={() => openEdit(entry)}
                        >
                          <DynamicIcon name={canManage ? 'pencil' : 'eye'} size={16} />
                        </Button>
                      </Tooltip>
                      {canManage && (
                        <Tooltip content="Видалити">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="text-rose-600"
                            aria-label="Видалити статтю"
                            onPress={() => setDeleteTarget(entry)}
                          >
                            <DynamicIcon name="trash-2" size={16} />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <KnowledgeEntryDrawer
        isOpen={drawerOpen}
        entry={editing}
        initialQuestion={initialQuestion}
        canManage={canManage}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
      <ConfirmModal
        isOpen={deleteTarget != null}
        title="Видалити статтю?"
        message={`Бот більше не використовуватиме статтю «${deleteTarget?.title ?? ''}».`}
        confirmText="Видалити"
        confirmColor="danger"
        confirmLoading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
