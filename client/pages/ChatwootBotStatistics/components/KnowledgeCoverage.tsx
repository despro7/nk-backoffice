import React, { useEffect, useState } from 'react';
import { Autocomplete, AutocompleteItem, Button, Chip, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BaseModal } from '@/components/modals/BaseModal';
import type { ChatwootBotQuestionClusterDto } from '@shared/types/chatwootBot';
import type { ChatwootBotKnowledgeEntry } from '@shared/types/chatwootBotKnowledge';
import { BotToolChip } from '../../ChatwootBotSettings/components/InstructionEditor';

/** Телефони в питаннях клієнтів не мають потрапити в базу знань. */
export function stripPhones(text: string): string {
  return text.replace(/\+?\d[\d\s\-()]{7,}\d/g, '…').replace(/\s+/g, ' ').trim();
}

/** Формулювання теми, які можна дописати в статтю як варіанти питання. */
export function clusterPhrasings(row: ChatwootBotQuestionClusterDto): string[] {
  return [...new Set([row.label, ...row.examples].map(stripPhones).filter(Boolean))];
}

/**
 * Чим бот відповідає на тему: стаття, яку знайде пошук, та інструменти, якими він уже відповідав
 * (каталог, статус замовлення…). «Немає» — ні статті, ні інструмента. Плюс кнопка «в базу знань».
 */
export function KnowledgeCoverage({
  row,
  canManage,
  onOpenKnowledge,
  onAction,
}: {
  row: ChatwootBotQuestionClusterDto;
  canManage: boolean;
  onOpenKnowledge: () => void;
  onAction: (row: ChatwootBotQuestionClusterDto) => void;
}) {
  const tools = row.tools ?? [];
  return (
    <div className="flex items-center gap-1 min-w-0">
      <div className="flex flex-wrap items-center gap-y-1 min-w-0">
        {row.knowledgeEntry ? (
          <Chip size="sm" variant="flat" color="success" className="cursor-pointer max-w-[200px] mr-0.5" onClick={onOpenKnowledge}>
            {row.knowledgeEntry.title}
          </Chip>
        ) : tools.length === 0 ? (
          <Chip size="sm" variant="flat" color="warning">
            Немає
          </Chip>
        ) : null}
        {tools.map((tool) => (
          <BotToolChip
            key={tool.name}
            name={tool.name}
            note={`Бот відповідав цим інструментом на ${tool.count} з ${row.count} повідомлень теми за період.`}
          />
        ))}
      </div>
      {canManage && (
        <Tooltip
          content={
            row.knowledgeEntry ? 'Додати ці формулювання в статтю (цю або іншу)' : 'Додати в базу знань: нова стаття або існуюча'
          }
        >
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="text-blue-600 ml-auto shrink-0"
            aria-label="Додати питання в базу знань"
            onPress={() => onAction(row)}
          >
            <DynamicIcon name={row.knowledgeEntry ? 'list-plus' : 'book-plus'} size={16} />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Куди додати питання теми: у знайдену статтю, в іншу (autocomplete) або в нову.
 * Формулювання стають варіантами питання статті — бот знаходитиме її за ними.
 */
export function KnowledgeAttachModal({
  row,
  entries,
  busy,
  onAttach,
  onCreate,
  onClose,
}: {
  row: ChatwootBotQuestionClusterDto | null;
  entries: ChatwootBotKnowledgeEntry[];
  busy: boolean;
  onAttach: (entryId: number, questions: string[]) => void;
  onCreate: (row: ChatwootBotQuestionClusterDto) => void;
  onClose: () => void;
}) {
  const [entryId, setEntryId] = useState<number | null>(null);
  useEffect(() => setEntryId(row?.knowledgeEntry?.id ?? null), [row]);
  const phrasings = row ? clusterPhrasings(row) : [];

  return (
    <BaseModal
      isOpen={row != null}
      title="Додати питання в базу знань"
      message={
        <div className="space-y-3">
          <div>
            <p className="text-xs text-default-500 mb-1">Формулювання клієнтів (телефони прибрано):</p>
            <ul className="text-sm text-default-700 list-disc pl-5 space-y-0.5 max-h-40 overflow-auto">
              {phrasings.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
          {row?.knowledgeEntry ? (
            <p className="text-xs text-default-500">
              Бот уже знаходить статтю «{row.knowledgeEntry.title}». Якщо тема не та – оберіть іншу.
            </p>
          ) : null}
          <Autocomplete
            label="Стаття"
            placeholder="Почніть вводити назву"
            defaultItems={entries}
            selectedKey={entryId != null ? String(entryId) : null}
            onSelectionChange={(key) => setEntryId(key != null ? Number(key) : null)}
            isDisabled={busy}
          >
            {(entry) => (
              <AutocompleteItem key={String(entry.id)} textValue={entry.title}>
                <div className="min-w-0">
                  <span className="truncate">{entry.title}</span>
                  {entry.tags.length > 0 ? (
                    <span className="block text-xs text-default-400 truncate">{entry.tags.join(', ')}</span>
                  ) : null}
                </div>
              </AutocompleteItem>
            )}
          </Autocomplete>
          <Button
            size="sm"
            variant="light"
            startContent={<DynamicIcon name="file-plus" size={14} />}
            isDisabled={busy || !row}
            onPress={() => row && onCreate(row)}
          >
            Створити нову статтю з цими питаннями
          </Button>
        </div>
      }
      confirmText="Додати в статтю"
      cancelText="Скасувати"
      confirmLoading={busy}
      onConfirm={() => entryId != null && onAttach(entryId, phrasings)}
      onCancel={onClose}
    />
  );
}
