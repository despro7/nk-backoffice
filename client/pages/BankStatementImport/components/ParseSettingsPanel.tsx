import React, { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionItem, Button, Checkbox, Chip, Input, Select, SelectItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  BankStatementColumnMap,
  BankStatementInlineColumn,
  BankStatementParseMapping,
  BankStatementRawSampleRow,
  BankStatementTemplate,
} from '@shared/types/bankStatement';
import {
  BANK_STATEMENT_INLINE_COLUMNS,
  DEFAULT_BANK_STATEMENT_MAPPING,
} from '@shared/types/bankStatement';
import { findDilovodItemLabel } from '@shared/utils/directoryUtils';
import { addKeywordsToDict, removeKeywordFromDict } from '@shared/utils/settlementsKindKeywords';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';

const COLUMN_FIELDS: Array<{ key: keyof BankStatementColumnMap; label: string }> = [
  { key: 'operationNumber', label: '№ операції' },
  { key: 'date', label: 'Дата' },
  { key: 'correspondentIban', label: 'IBAN кореспондента' },
  { key: 'correspondentName', label: 'Кореспондент' },
  { key: 'edrpou', label: 'ЄДРПОУ' },
  { key: 'purpose', label: 'Призначення' },
  { key: 'debit', label: 'Дебет (витрати)' },
  { key: 'credit', label: 'Кредит (надходження)' },
];

interface ParseSettingsPanelProps {
  mapping: BankStatementParseMapping;
  onMappingChange: (mapping: BankStatementParseMapping) => void;
  templates: BankStatementTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (id: string) => void;
  onReparse: () => void;
  onSaveTemplate: (name: string) => void;
  onUpdateTemplate: () => void;
  onDeleteTemplate: () => void;
  isParsing: boolean;
  canReparse: boolean;
  excelRowCount?: number;
  skippedCount?: number;
  parsedCount?: number;
  rawSample?: BankStatementRawSampleRow[];
  showRawSample?: boolean;
  defaultExpanded?: boolean;
  kindKeywords: Record<string, string[]>;
  onKindKeywordsChange: (dict: Record<string, string[]>) => void;
  inlineEditColumns: BankStatementInlineColumn[];
  onInlineEditColumnsChange: (columns: BankStatementInlineColumn[]) => void;
}

export default function ParseSettingsPanel({
  mapping,
  onMappingChange,
  templates,
  activeTemplateId,
  onSelectTemplate,
  onReparse,
  onSaveTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  isParsing,
  canReparse,
  excelRowCount,
  skippedCount,
  parsedCount,
  rawSample,
  showRawSample,
  defaultExpanded,
  kindKeywords,
  onKindKeywordsChange,
  inlineEditColumns,
  onInlineEditColumnsChange,
}: ParseSettingsPanelProps) {
  const { directories, loadDirectories } = useDilovodDirectories();
  const [newName, setNewName] = useState('');
  const [newKeywordByKind, setNewKeywordByKind] = useState<Record<string, string>>({});
  const [expandedKeys, setExpandedKeys] = useState<string[]>(defaultExpanded ? ['parse'] : []);
  const active = useMemo(
    () => templates.find((t) => t.id === activeTemplateId),
    [templates, activeTemplateId],
  );
  const isBuiltIn = Boolean(active?.builtIn);

  useEffect(() => {
    if (defaultExpanded) setExpandedKeys(['parse']);
  }, [defaultExpanded]);

  useEffect(() => {
    void loadDirectories();
  }, [loadDirectories]);

  const keywordKindIds = useMemo(() => Object.keys(kindKeywords), [kindKeywords]);
  const inlineSet = useMemo(() => new Set(inlineEditColumns), [inlineEditColumns]);

  const patch = (partial: Partial<BankStatementParseMapping>) => {
    onMappingChange({ ...mapping, ...partial });
  };

  const patchCol = (key: keyof BankStatementColumnMap, value: string) => {
    onMappingChange({
      ...mapping,
      columns: { ...mapping.columns, [key]: value.toUpperCase() },
    });
  };

  return (
    <Accordion
      variant="bordered"
      selectedKeys={expandedKeys}
      className="px-0"
      onSelectionChange={(keys) => setExpandedKeys(Array.from(keys as Set<string>))}
    >
      <AccordionItem
        key="parse"
        aria-label="Налаштування парсингу"
        title="Налаштування парсингу виписки"
        subtitle="Рядок старту, колонки Excel і шаблони банку"
        startContent={<DynamicIcon name="settings-2" size={18} className="text-sky-600" />}
        className="px-4"
      >
        <div className="flex flex-col gap-4 pb-3">
          <div className="flex flex-wrap items-start gap-3">
            <Select
              size="sm"
              label="Шаблон за замовчуванням"
              // labelPlacement="outside"
              description="Цей шаблон підставляється при наступному відкритті сторінки"
              selectedKeys={activeTemplateId ? [activeTemplateId] : []}
              onSelectionChange={(keys) => {
                const id = Array.from(keys)[0] as string | undefined;
                if (id) onSelectTemplate(id);
              }}
              className="min-w-[220px] max-w-xs"
            >
              {templates.map((t) => (
                <SelectItem key={t.id} textValue={t.name}>
                  {t.name}{t.id === activeTemplateId ? ' · за замовчуванням' : ''}{t.builtIn ? ' (стандарт)' : ''}
                </SelectItem>
              ))}
            </Select>
            <Button
              size="sm"
              color="primary"
              className="h-12"
              isDisabled={!canReparse || isParsing}
              isLoading={isParsing}
              onPress={onReparse}
              startContent={!isParsing && <DynamicIcon name="refresh-cw" size={14} />}
            >
              Перечитати файл
            </Button>
            <Button size="sm" variant="bordered" className="h-12" isDisabled={isParsing} onPress={onUpdateTemplate}>
              Оновити шаблон
            </Button>
            {!isBuiltIn && (
              <Button size="sm" variant="light" color="danger" className="h-12" isDisabled={isParsing} onPress={onDeleteTemplate}>
                Видалити
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              size="sm"
              type="number"
              min={1}
              label="Перший рядок даних"
              labelPlacement="outside"
              value={String(mapping.dataStartRow)}
              onValueChange={(v) => patch({ dataStartRow: Number(v) || 1 })}
            />
            <Input
              size="sm"
              type="number"
              min={0}
              label="Рядків шапки (IBAN)"
              labelPlacement="outside"
              value={String(mapping.headerRows)}
              onValueChange={(v) => patch({ headerRows: Number(v) || 0 })}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {COLUMN_FIELDS.map((field) => (
              <Input
                key={field.key}
                size="sm"
                label={field.label}
                labelPlacement="outside"
                placeholder="A"
                value={mapping.columns[field.key]}
                onValueChange={(v) => patchCol(field.key, v)}
                classNames={{ input: 'uppercase font-mono' }}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Input
              size="sm"
              label="Новий шаблон"
              labelPlacement="outside"
              placeholder="ПриватБанк, NovaPay…"
              value={newName}
              onValueChange={setNewName}
              className="min-w-[200px] max-w-xs"
            />
            <Button
              size="sm"
              variant="bordered"
              isDisabled={!newName.trim() || isParsing}
              onPress={() => {
                onSaveTemplate(newName.trim());
                setNewName('');
              }}
              startContent={<DynamicIcon name="save" size={14} />}
            >
              Зберегти як новий
            </Button>
            <Button
              size="sm"
              variant="light"
              onPress={() => onMappingChange(DEFAULT_BANK_STATEMENT_MAPPING)}
            >
              Скинути на NovaPay
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-800">Inline-редагування колонок</p>
            <p className="text-xs text-gray-500">
              Увімкнені колонки можна змінювати прямо в таблиці, без модального вікна.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {BANK_STATEMENT_INLINE_COLUMNS.map((col) => (
                <Checkbox
                  key={col.key}
                  size="sm"
                  isSelected={inlineSet.has(col.key)}
                  onValueChange={(selected) => {
                    const next = selected
                      ? [...inlineEditColumns, col.key]
                      : inlineEditColumns.filter((k) => k !== col.key);
                    onInlineEditColumnsChange(next);
                  }}
                >
                  {col.label}
                </Checkbox>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-800">Словник видів розрахунків</p>
            <p className="text-xs text-gray-500">
              Унікальне слово з призначення додається автоматично, коли ви обираєте вид у рядку.
              Теги можна редагувати вручну.
            </p>
            {keywordKindIds.length === 0 ? (
              <p className="text-xs text-gray-400">Поки порожньо — оберіть вид розрахунків у таблиці.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {keywordKindIds.map((kindId) => {
                  const label = findDilovodItemLabel(kindId, directories?.settlementsKinds) || kindId;
                  const tags = kindKeywords[kindId] ?? [];
                  return (
                    <div key={kindId} className="rounded-md border border-gray-200 p-2.5">
                      <p className="text-xs font-medium text-gray-700 mb-2">{label}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tags.map((tag) => (
                          <Chip
                            key={tag}
                            size="sm"
                            variant="flat"
                            onClose={() => onKindKeywordsChange(removeKeywordFromDict(kindKeywords, kindId, tag))}
                          >
                            {tag}
                          </Chip>
                        ))}
                        <Input
                          size="sm"
                          variant="bordered"
                          placeholder="Додати слово"
                          value={newKeywordByKind[kindId] ?? ''}
                          onValueChange={(v) => setNewKeywordByKind((prev) => ({ ...prev, [kindId]: v }))}
                          className="w-40"
                          classNames={{ inputWrapper: 'h-7 min-h-7' }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const value = (newKeywordByKind[kindId] ?? '').trim();
                            if (!value) return;
                            onKindKeywordsChange(addKeywordsToDict(kindKeywords, kindId, [value]));
                            setNewKeywordByKind((prev) => ({ ...prev, [kindId]: '' }));
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(excelRowCount != null || parsedCount != null) && (
            <p className="text-xs text-gray-500">
              У файлі рядків: {excelRowCount ?? '—'} · розпізнано: {parsedCount ?? 0}
              {skippedCount != null ? ` · пропущено: ${skippedCount}` : ''}
            </p>
          )}

          {showRawSample && rawSample && rawSample.length > 0 && (
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <p className="text-xs font-medium text-gray-600 px-3 py-2 bg-gray-50">
                Зразок клітинок з файлу (непорожні, до 30 колонок)
              </p>
              <table className="w-full text-xs">
                <tbody>
                  {rawSample.map((row) => (
                    <tr key={row.excelRow} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">Рядок {row.excelRow}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-700">
                        {row.cells.length === 0
                          ? '—'
                          : row.cells.map((c) => `${c.col}=${c.value}`).join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </AccordionItem>
    </Accordion>
  );
}
