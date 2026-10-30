import React, { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { ToastService } from '@/services/ToastService';
import type { ChatwootBotQuestionClusterDto } from '@shared/types/chatwootBot';
import type {
  ChatwootBotTopicDeleteMode,
  ChatwootBotTopicQuestionDto,
  ChatwootBotTopicRef,
} from '@shared/types/chatwootBotTopics';

const VISIBLE_TOPICS = 15;

const HINT_TOOLTIP_CLASSES = {
  base: 'before:rounded-[2px] before:z-[10] before:shadow-[1px_1px_1px_rgba(0,0,0,0.08)]',
  content: 'text-xs max-w-50 text-center p-2',
};

type Props = {
  rows: ChatwootBotQuestionClusterDto[];
  topics: ChatwootBotTopicRef[];
  ignoredQuestions: ChatwootBotTopicQuestionDto[];
  canManageTopics: boolean;
  canManageKnowledge: boolean;
  onAddToKnowledge: (row: ChatwootBotQuestionClusterDto) => void;
  onOpenKnowledge: () => void;
  /** Після будь-якої зміни — перезавантажити статистику. */
  onChanged: () => Promise<void>;
};

type TitleDialog = { kind: 'rename'; topicId: number; title: string } | { kind: 'create'; title: string };
type MergeDialog = { targetId: number; title: string; sourceIds: string[] };
type DeleteDialog = {
  topicId: number;
  title: string;
  mode: ChatwootBotTopicDeleteMode;
};

function QuestionRow({
  question,
  selectable,
  selected,
  onToggle,
}: {
  question: ChatwootBotTopicQuestionDto;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      {selectable && (
        <Checkbox size="sm" isSelected={selected} onValueChange={onToggle} aria-label={`Вибрати «${question.text}»`} />
      )}
      <span className="flex-1 min-w-0 text-default-700">
        {question.text} ({question.count})
      </span>
      {question.source === 'manual' && (
        <Chip size="sm" variant="flat" className="h-5 text-[11px]">
          вручну
        </Chip>
      )}
      {/* <span className="w-10 text-right text-default-500">{question.count}</span> */}
    </div>
  );
}

export function QuestionTopicsCard({
  rows,
  topics,
  ignoredQuestions,
  canManageTopics,
  canManageKnowledge,
  onAddToKnowledge,
  onOpenKnowledge,
  onChanged,
}: Props) {
  const managed = rows.some((row) => row.topicId != null);
  const canManage = canManageTopics && managed;

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [titleDialog, setTitleDialog] = useState<TitleDialog | null>(null);
  const [mergeDialog, setMergeDialog] = useState<MergeDialog | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null);

  const visibleRows = showAll ? rows : rows.slice(0, VISIBLE_TOPICS);
  const textByHash = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) for (const q of row.questions ?? []) map.set(q.hash, q.text);
    for (const q of ignoredQuestions) map.set(q.hash, q.text);
    return map;
  }, [rows, ignoredQuestions]);

  const toggleSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  /** Виконати дію і перезавантажити статистику; помилка — тост, вибір лишається. */
  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      await onChanged();
      ToastService.show({ title: success, color: 'success' });
      return true;
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося змінити теми',
        color: 'danger',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selectedHashes = [...selected];
  const runOnSelected = async (action: () => Promise<unknown>, success: string) => {
    if (await run(action, success)) setSelected(new Set());
  };

  const submitTitle = async () => {
    if (!titleDialog) return;
    const title = titleDialog.title.trim();
    if (!title) return;
    const ok =
      titleDialog.kind === 'rename'
        ? await run(() => chatwootBotApi.renameTopic(titleDialog.topicId, title), 'Тему перейменовано')
        : await run(() => chatwootBotApi.createTopic(title, selectedHashes), 'Тему створено');
    if (!ok) return;
    if (titleDialog.kind === 'create') setSelected(new Set());
    setTitleDialog(null);
  };

  const submitMerge = async () => {
    if (!mergeDialog || mergeDialog.sourceIds.length === 0) return;
    const ok = await run(
      () => chatwootBotApi.mergeTopics(mergeDialog.targetId, mergeDialog.sourceIds.map(Number)),
      'Теми об’єднано',
    );
    if (ok) setMergeDialog(null);
  };

  const submitDelete = async () => {
    if (!deleteDialog) return;
    const ok = await run(
      () => chatwootBotApi.deleteTopic(deleteDialog.topicId, deleteDialog.mode),
      deleteDialog.mode === 'ignore' ? 'Питання теми позначено як шум' : 'Тему розформовано',
    );
    if (ok) setDeleteDialog(null);
  };

  const onTopicAction = (row: ChatwootBotQuestionClusterDto, key: string) => {
    if (row.topicId == null) return;
    if (key === 'rename')
      setTitleDialog({
        kind: 'rename',
        topicId: row.topicId,
        title: row.label,
      });
    if (key === 'merge')
      setMergeDialog({
        targetId: row.topicId,
        title: row.label,
        sourceIds: [],
      });
    if (key === 'reassign' || key === 'ignore') setDeleteDialog({ topicId: row.topicId, title: row.label, mode: key });
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-1">
        <DynamicIcon name="badge-question-mark" size={16} />
        Теми питань
      </h2>
      <p className="text-xs text-default-500 mb-3">
        Нові питання розкладає алгоритм; ручні правки він не змінює. Колонка «База знань» показує статтю, яку знайде
        бот; «Немає» – прогалина.
      </p>

      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md bg-default-200/65">
          <span className="text-sm font-medium px-1">Вибрано: {selected.size}</span>
          <Select
            size="sm"
            aria-label="Перенести в тему"
            placeholder="Перенести в тему…"
            classNames={{
              base: 'min-w-64 flex-1',
              trigger: 'bg-white data-[hover=true]:bg-default-50',
            }}
            isDisabled={busy}
            selectedKeys={[]}
            onSelectionChange={(keys) => {
              const topicId = Number(Array.from(keys)[0]);
              if (!topicId) return;
              void runOnSelected(
                () =>
                  chatwootBotApi.applyTopicQuestionsAction({
                    action: 'move',
                    hashes: selectedHashes,
                    topicId,
                  }),
                'Питання перенесено',
              );
            }}
          >
            {topics.map((topic) => (
              <SelectItem key={String(topic.id)} textValue={topic.title}>
                {topic.title}
              </SelectItem>
            ))}
          </Select>
          <Tooltip
            content="Створити окрему тему з вибраних питань"
            showArrow
            classNames={HINT_TOOLTIP_CLASSES}
          >
            <Button
              size="sm"
              variant="solid"
              color="primary"
              isDisabled={busy}
              startContent={<DynamicIcon name="folder-plus" size={14} />}
              onPress={() =>
                setTitleDialog({
                  kind: 'create',
                  title: textByHash.get(selectedHashes[0]) ?? '',
                })
              }
            >
              Нова тема
            </Button>
          </Tooltip>
          <Tooltip
            content="Зняти ручне призначення: алгоритм сам підбере тему"
            showArrow
            classNames={HINT_TOOLTIP_CLASSES}
          >
            <Button
              size="sm"
              variant="flat"
              isDisabled={busy}
              startContent={<DynamicIcon name="wand-sparkles" size={14} />}
              onPress={() =>
                void runOnSelected(
                  () =>
                    chatwootBotApi.applyTopicQuestionsAction({
                      action: 'auto',
                      hashes: selectedHashes,
                    }),
                  'Питання повернуто алгоритму',
                )
              }
            >
              Алгоритму
            </Button>
          </Tooltip>
          <Tooltip
            content="Прибрати зі статистики тем (телефони, привітання тощо). Повернути можна з розділу «Шум»"
            showArrow
            classNames={HINT_TOOLTIP_CLASSES}
          >
            <Button
              size="sm"
              variant="flat"
              color="warning"
              isDisabled={busy}
              startContent={<DynamicIcon name="volume-x" size={14} />}
              onPress={() =>
                void runOnSelected(
                  () =>
                    chatwootBotApi.applyTopicQuestionsAction({
                      action: 'noise',
                      hashes: selectedHashes,
                    }),
                  'Позначено як шум',
                )
              }
            >
              Шум
            </Button>
          </Tooltip>
          <Button size="sm" variant="light" isDisabled={busy} onPress={() => setSelected(new Set())}>
            Скасувати
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-default-500 text-sm">За обраний період даних немає.</p>
      ) : (
        <div className="divide-y divide-default-100">
          <div className="flex items-center gap-2 pb-2 text-xs font-semibold text-default-500 uppercase">
            <span className="w-6" />
            <span className="flex-1">Тема</span>
            <span className="w-20">Кількість</span>
            <span className="w-[220px]">База знань</span>
            <span className="w-[72px]" />
          </div>
          {visibleRows.map((row) => {
            const questions = row.questions ?? [];
            const isOpen = row.topicId != null && expanded.has(row.topicId);
            const otherPhrasings = row.examples.filter((e) => e !== row.label);
            return (
              <div key={row.topicId ?? row.label} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="w-6">
                    {questions.length > 0 && (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        className="min-w-6 w-6 h-6"
                        aria-label={isOpen ? 'Згорнути питання' : 'Показати питання'}
                        onPress={() => row.topicId != null && setExpanded((prev) => toggleSet(prev, row.topicId!))}
                      >
                        <DynamicIcon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} />
                      </Button>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{row.label}</p>
                    {!isOpen && otherPhrasings.length > 0 && (
                      <p className="text-xs text-default-500 truncate">{otherPhrasings.join(' · ')}</p>
                    )}
                  </div>
                  <span className="w-20 text-sm px-2">{row.count}</span>
                  <span className="w-[220px] px-2">
                    {row.knowledgeEntry ? (
                      <Chip
                        size="sm"
                        variant="flat"
                        color="success"
                        className="cursor-pointer max-w-[200px]"
                        onClick={onOpenKnowledge}
                      >
                        {row.knowledgeEntry.title}
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="flat" color="warning">
                        Немає
                      </Chip>
                    )}
                  </span>
                  <span className="w-[72px] flex justify-end">
                    {canManageKnowledge && !row.knowledgeEntry && (
                      <Tooltip content="Додати в базу знань">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          className="text-blue-600"
                          aria-label="Додати тему в базу знань"
                          onPress={() => onAddToKnowledge(row)}
                        >
                          <DynamicIcon name="book-plus" size={16} />
                        </Button>
                      </Tooltip>
                    )}
                    {canManage && row.topicId != null && (
                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly size="sm" variant="light" aria-label="Дії з темою" isDisabled={busy}>
                            <DynamicIcon name="ellipsis-vertical" size={16} />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="Дії з темою" onAction={(key) => onTopicAction(row, String(key))}>
                          <DropdownItem key="rename" startContent={<DynamicIcon name="pencil" size={14} />}>
                            Перейменувати
                          </DropdownItem>
                          <DropdownItem key="merge" startContent={<DynamicIcon name="merge" size={14} />}>
                            Об’єднати з іншими…
                          </DropdownItem>
                          <DropdownItem
                            key="reassign"
                            description="Питання розкладе алгоритм заново"
                            startContent={<DynamicIcon name="wand-sparkles" size={14} />}
                          >
                            Розформувати
                          </DropdownItem>
                          <DropdownItem
                            key="ignore"
                            className="text-danger"
                            color="danger"
                            description="Питання теми не рахуватимуться"
                            startContent={<DynamicIcon name="trash-2" size={14} />}
                          >
                            Видалити як шум
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </span>
                </div>
                {isOpen && (
                  <div className="ml-8 mr-[72px] mt-1 pl-3 border-l border-default-200">
                    {questions.map((q) => (
                      <QuestionRow
                        key={q.hash}
                        question={q}
                        selectable={canManage}
                        selected={selected.has(q.hash)}
                        onToggle={() => setSelected((prev) => toggleSet(prev, q.hash))}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {rows.length > VISIBLE_TOPICS && (
          <Button size="sm" variant="light" onPress={() => setShowAll((v) => !v)}>
            {showAll ? 'Згорнути' : `Показати всі (${rows.length})`}
          </Button>
        )}
        {ignoredQuestions.length > 0 && (
          <Button
            size="sm"
            variant="light"
            startContent={<DynamicIcon name={showIgnored ? 'chevron-down' : 'chevron-right'} size={14} />}
            onPress={() => setShowIgnored((v) => !v)}
          >
            Шум ({ignoredQuestions.length})
          </Button>
        )}
      </div>
      {showIgnored && (
        <div className="mt-1 pl-3 border-l border-default-200">
          <p className="text-xs text-default-500 mb-1">
            Не рахуються в темах: телефони, подяки та питання, позначені вручну.
          </p>
          {ignoredQuestions.map((q) => (
            <QuestionRow
              key={q.hash}
              question={q}
              selectable={canManage}
              selected={selected.has(q.hash)}
              onToggle={() => setSelected((prev) => toggleSet(prev, q.hash))}
            />
          ))}
        </div>
      )}

      <BaseModal
        isOpen={titleDialog != null}
        title={titleDialog?.kind === 'rename' ? 'Перейменувати тему' : `Нова тема з вибраних питань (${selected.size})`}
        message={
          <Input
            autoFocus
            label="Назва теми"
            value={titleDialog?.title ?? ''}
            onValueChange={(title) => setTitleDialog((prev) => (prev ? { ...prev, title } : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitTitle();
            }}
          />
        }
        confirmText={titleDialog?.kind === 'rename' ? 'Зберегти' : 'Створити'}
        cancelText="Скасувати"
        confirmLoading={busy}
        onConfirm={() => void submitTitle()}
        onCancel={() => setTitleDialog(null)}
      />

      <BaseModal
        isOpen={mergeDialog != null}
        title="Об’єднати теми"
        message={
          <div className="space-y-2">
            <p className="text-sm text-default-600">
              Питання вибраних тем перейдуть у «{mergeDialog?.title}», а самі теми буде видалено.
            </p>
            <Select
              label="Теми для об’єднання"
              selectionMode="multiple"
              selectedKeys={mergeDialog?.sourceIds ?? []}
              onSelectionChange={(keys) =>
                setMergeDialog((prev) => (prev ? { ...prev, sourceIds: Array.from(keys).map(String) } : prev))
              }
            >
              {topics
                .filter((topic) => topic.id !== mergeDialog?.targetId)
                .map((topic) => (
                  <SelectItem key={String(topic.id)} textValue={topic.title}>
                    {topic.title}
                  </SelectItem>
                ))}
            </Select>
          </div>
        }
        confirmText="Об’єднати"
        cancelText="Скасувати"
        confirmLoading={busy}
        onConfirm={() => void submitMerge()}
        onCancel={() => setMergeDialog(null)}
      />

      <ConfirmModal
        isOpen={deleteDialog != null}
        title={deleteDialog?.mode === 'ignore' ? 'Видалити тему як шум?' : 'Розформувати тему?'}
        message={
          deleteDialog?.mode === 'ignore'
            ? `Тему «${deleteDialog?.title}» буде видалено, її питання більше не рахуватимуться в статистиці. Повернути їх можна з розділу «Шум».`
            : `Тему «${deleteDialog?.title}» буде видалено, а її питання алгоритм розкладе заново по інших темах.`
        }
        confirmText={deleteDialog?.mode === 'ignore' ? 'Видалити' : 'Розформувати'}
        cancelText="Скасувати"
        confirmColor={deleteDialog?.mode === 'ignore' ? 'danger' : 'primary'}
        confirmLoading={busy}
        onConfirm={() => void submitDelete()}
        onCancel={() => setDeleteDialog(null)}
      />
    </div>
  );
}
