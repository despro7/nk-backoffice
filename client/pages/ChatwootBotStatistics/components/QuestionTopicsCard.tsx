import React, { useMemo, useState } from 'react';
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Checkbox,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Radio,
  RadioGroup,
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
import { KnowledgeCoverage } from './KnowledgeCoverage';

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
  /** Додати питання теми в базу знань (нова або існуюча стаття). */
  onKnowledgeAction: (row: ChatwootBotQuestionClusterDto) => void;
  onOpenKnowledge: () => void;
  /** Після будь-якої зміни — перезавантажити статистику. */
  onChanged: () => Promise<void>;
};

type TitleDialog = { kind: 'rename'; topicId: number; title: string } | { kind: 'create'; title: string };
/** Теми для обʼєднання; `targetId` — тема, чия назва лишиться заголовком групи. */
type MergeDialog = { topicIds: number[]; targetId: number };

/** Фільтр за статтею: усі, без статті або конкретна стаття. */
const ALL = 'all';
const NO_ARTICLE = 'none';

function rowMatchesSearch(row: ChatwootBotQuestionClusterDto, needle: string): boolean {
  if (!needle) return true;
  const texts = [row.label, ...row.examples, ...(row.questions ?? []).map((q) => q.text)];
  return texts.some((t) => t.toLowerCase().includes(needle));
}
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
  onKnowledgeAction,
  onOpenKnowledge,
  onChanged,
}: Props) {
  const managed = rows.some((row) => row.topicId != null);
  const canManage = canManageTopics && managed;

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [articleFilter, setArticleFilter] = useState<string>(ALL);
  const [tagFilter, setTagFilter] = useState<string>(ALL);
  const [busy, setBusy] = useState(false);
  const [titleDialog, setTitleDialog] = useState<TitleDialog | null>(null);
  const [mergeDialog, setMergeDialog] = useState<MergeDialog | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null);

  // Опції фільтрів — зі статей, які реально знаходить бот за темами періоду.
  const articleOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of rows) if (row.knowledgeEntry) map.set(row.knowledgeEntry.id, row.knowledgeEntry.title);
    return [...map].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, 'uk'));
  }, [rows]);
  const tagOptions = useMemo(
    () => [...new Set(rows.flatMap((row) => row.knowledgeEntry?.tags ?? []))].sort((a, b) => a.localeCompare(b, 'uk')),
    [rows],
  );

  const needle = search.trim().toLowerCase();
  const filtered = needle || articleFilter !== ALL || tagFilter !== ALL;
  const filteredRows = rows.filter((row) => {
    if (!rowMatchesSearch(row, needle)) return false;
    if (articleFilter === NO_ARTICLE && row.knowledgeEntry) return false;
    if (articleFilter !== ALL && articleFilter !== NO_ARTICLE && String(row.knowledgeEntry?.id) !== articleFilter) return false;
    if (tagFilter !== ALL && !(row.knowledgeEntry?.tags ?? []).includes(tagFilter)) return false;
    return true;
  });
  const visibleRows = showAll || filtered ? filteredRows : filteredRows.slice(0, VISIBLE_TOPICS);
  const rowByTopicId = useMemo(() => {
    const map = new Map<number, ChatwootBotQuestionClusterDto>();
    for (const row of rows) if (row.topicId != null) map.set(row.topicId, row);
    return map;
  }, [rows]);
  const topicTitle = (id: number) => topics.find((t) => t.id === id)?.title ?? rowByTopicId.get(id)?.label ?? `#${id}`;
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
    if (!mergeDialog) return;
    const sourceIds = mergeDialog.topicIds.filter((id) => id !== mergeDialog.targetId);
    if (sourceIds.length === 0) return;
    const ok = await run(() => chatwootBotApi.mergeTopics(mergeDialog.targetId, sourceIds), 'Теми об’єднано');
    if (ok) {
      setMergeDialog(null);
      setSelectedTopics(new Set());
    }
  };

  const mergeQuestionCount = (mergeDialog?.topicIds ?? []).reduce(
    (sum, id) => sum + (rowByTopicId.get(id)?.count ?? 0),
    0,
  );

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
    if (key === 'merge') setMergeDialog({ topicIds: [row.topicId], targetId: row.topicId });
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

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Input
            size="sm"
            isClearable
            aria-label="Пошук по питаннях"
            placeholder="Пошук по питаннях…"
            className="flex-1 min-w-56"
            startContent={<DynamicIcon name="search" size={14} className="text-default-400" />}
            value={search}
            onValueChange={setSearch}
            onClear={() => setSearch('')}
          />
          <Select
            size="sm"
            aria-label="Стаття бази знань"
            className="w-56"
            selectedKeys={[articleFilter]}
            onSelectionChange={(keys) => setArticleFilter(String(Array.from(keys)[0] ?? ALL))}
          >
            {[
              <SelectItem key={ALL} textValue="Усі статті">
                Усі статті
              </SelectItem>,
              <SelectItem key={NO_ARTICLE} textValue="Без статті">
                Без статті (прогалини)
              </SelectItem>,
              ...articleOptions.map((a) => (
                <SelectItem key={String(a.id)} textValue={a.title}>
                  {a.title}
                </SelectItem>
              )),
            ]}
          </Select>
          {tagOptions.length > 0 && (
            <Select
              size="sm"
              aria-label="Тег статті"
              className="w-44"
              selectedKeys={[tagFilter]}
              onSelectionChange={(keys) => setTagFilter(String(Array.from(keys)[0] ?? ALL))}
            >
              {[
                <SelectItem key={ALL} textValue="Усі теги">
                  Усі теги
                </SelectItem>,
                ...tagOptions.map((tag) => (
                  <SelectItem key={tag} textValue={tag}>
                    {tag}
                  </SelectItem>
                )),
              ]}
            </Select>
          )}
          {filtered && (
            <span className="text-xs text-default-500">
              Знайдено: {filteredRows.length} з {rows.length}
            </span>
          )}
        </div>
      )}

      {canManage && selectedTopics.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md bg-default-200/65">
          <span className="text-sm font-medium px-1">Вибрано тем: {selectedTopics.size}</span>
          <Button
            size="sm"
            color="primary"
            isDisabled={busy || selectedTopics.size < 2}
            startContent={<DynamicIcon name="merge" size={14} />}
            onPress={() => {
              const ids = [...selectedTopics];
              // Заголовок за замовчуванням — найчастіша тема.
              const targetId = [...ids].sort((a, b) => (rowByTopicId.get(b)?.count ?? 0) - (rowByTopicId.get(a)?.count ?? 0))[0];
              setMergeDialog({ topicIds: ids, targetId });
            }}
          >
            Об’єднати…
          </Button>
          <Button size="sm" variant="light" isDisabled={busy} onPress={() => setSelectedTopics(new Set())}>
            Скасувати
          </Button>
        </div>
      )}

      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md bg-default-200/65">
          <span className="text-sm font-medium px-1">Вибрано: {selected.size}</span>
          <Autocomplete
            size="sm"
            aria-label="Перенести в тему"
            placeholder="Перенести в тему… (почніть вводити)"
            className="min-w-64 flex-1"
            inputProps={{ classNames: { inputWrapper: 'bg-white data-[hover=true]:bg-default-50' } }}
            isDisabled={busy}
            defaultItems={topics}
            selectedKey={null}
            onSelectionChange={(key) => {
              const topicId = Number(key);
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
            {(topic) => (
              <AutocompleteItem key={String(topic.id)} textValue={topic.title}>
                {topic.title}
              </AutocompleteItem>
            )}
          </Autocomplete>
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
      ) : filteredRows.length === 0 ? (
        <p className="text-default-500 text-sm">Нічого не знайдено за фільтрами.</p>
      ) : (
        <div className="divide-y divide-default-100">
          <div className="flex items-center gap-2 pb-2 text-xs font-semibold text-default-500 uppercase">
            {canManage && <span className="w-6" />}
            <span className="w-6" />
            <span className="flex-1">Тема</span>
            <span className="w-20">Кількість</span>
            <span className="w-[250px]">База знань</span>
            <span className="w-9" />
          </div>
          {visibleRows.map((row) => {
            const questions = row.questions ?? [];
            const isOpen = row.topicId != null && expanded.has(row.topicId);
            const otherPhrasings = row.examples.filter((e) => e !== row.label);
            return (
              <div key={row.topicId ?? row.label} className="py-2">
                <div className="flex items-center gap-2">
                  {canManage && (
                    <span className="w-6">
                      {row.topicId != null && (
                        <Checkbox
                          size="sm"
                          aria-label={`Вибрати тему «${row.label}»`}
                          isSelected={selectedTopics.has(row.topicId)}
                          onValueChange={() => setSelectedTopics((prev) => toggleSet(prev, row.topicId!))}
                        />
                      )}
                    </span>
                  )}
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
                  <span className="w-20 text-sm px-1">{row.count}</span>
                  <span className="w-[250px]">
                    <KnowledgeCoverage
                      row={row}
                      canManage={canManageKnowledge}
                      onOpenKnowledge={onOpenKnowledge}
                      onAction={onKnowledgeAction}
                    />
                  </span>
                  <span className="w-9 flex justify-end">
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
                  <div className="ml-8 mr-9 mt-1 pl-3 border-l border-default-200">
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
        {!filtered && rows.length > VISIBLE_TOPICS && (
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
          mergeDialog && (
            <div className="space-y-3">
              <Autocomplete
                size="sm"
                label="Додати тему"
                placeholder="Почніть вводити назву"
                defaultItems={topics.filter((t) => !mergeDialog.topicIds.includes(t.id))}
                selectedKey={null}
                onSelectionChange={(key) => {
                  const id = Number(key);
                  if (!id) return;
                  setMergeDialog((prev) => (prev ? { ...prev, topicIds: [...prev.topicIds, id] } : prev));
                }}
              >
                {(topic) => (
                  <AutocompleteItem key={String(topic.id)} textValue={topic.title}>
                    {topic.title}
                  </AutocompleteItem>
                )}
              </Autocomplete>
              <RadioGroup
                size="sm"
                label="Заголовок групи"
                description="Оберіть, назва якої теми лишиться; решта тем зникне, їхні питання перейдуть сюди."
                value={String(mergeDialog.targetId)}
                onValueChange={(v) => setMergeDialog((prev) => (prev ? { ...prev, targetId: Number(v) } : prev))}
              >
                {mergeDialog.topicIds.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <Radio value={String(id)} classNames={{ base: 'flex-1 max-w-none' }}>
                      <span className="text-sm">{topicTitle(id)}</span>
                      {rowByTopicId.get(id) ? (
                        <span className="text-xs text-default-400"> · {rowByTopicId.get(id)!.count}</span>
                      ) : null}
                    </Radio>
                    {mergeDialog.topicIds.length > 1 && (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={`Прибрати «${topicTitle(id)}»`}
                        onPress={() =>
                          setMergeDialog((prev) => {
                            if (!prev) return prev;
                            const topicIds = prev.topicIds.filter((t) => t !== id);
                            return { topicIds, targetId: prev.targetId === id ? topicIds[0] : prev.targetId };
                          })
                        }
                      >
                        <DynamicIcon name="x" size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </RadioGroup>
              <div className="rounded-md bg-default-100 p-2 text-sm">
                {mergeDialog.topicIds.length < 2 ? (
                  <span className="text-default-500">Додайте ще хоча б одну тему.</span>
                ) : (
                  <>
                    Після об’єднання: <strong>«{topicTitle(mergeDialog.targetId)}»</strong>
                    {mergeQuestionCount > 0 ? ` · ${mergeQuestionCount} звернень за період` : ''}
                  </>
                )}
              </div>
            </div>
          )
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
