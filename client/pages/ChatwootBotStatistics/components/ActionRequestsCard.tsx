import React from 'react';
import {
  Button,
  Chip,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { InstructionPreview } from '@/pages/ChatwootBotSettings/components/InstructionEditor';
import type { ChatwootBotActionRequestDto, ChatwootBotActionSolution } from '@shared/types/chatwootBotScenarios';

const KIND_META: Record<ChatwootBotActionSolution['kind'], { icon: IconName; label: string }> = {
  scenario: { icon: 'workflow', label: 'Сценарій' },
  tool: { icon: 'wrench', label: 'Вбудовано в бота' },
  none: { icon: 'headset', label: 'Немає рішення' },
};

/** Коротка мітка рішення; по кліку — схема (кроки сценарію / що робить вбудована дія) і посилання в налаштування. */
function SolutionChip({
  solution,
  onOpenScenario,
  onOpenSettings,
}: {
  solution: ChatwootBotActionSolution;
  onOpenScenario: (scenarioId: string) => void;
  onOpenSettings: (tab: string) => void;
}) {
  const meta = KIND_META[solution.kind];
  if (solution.kind === 'none') {
    return (
      <Chip size="sm" variant="flat" color="warning" startContent={<DynamicIcon name={meta.icon} size={12} />}>
        Оператор
      </Chip>
    );
  }
  return (
    <Popover placement="bottom-start" showArrow>
      <PopoverTrigger>
        {/* Button, а не Chip: тригер Popover має бути pressable. */}
        <Button
          size="sm"
          variant="flat"
          radius="full"
          color={solution.enabled ? 'success' : 'default'}
          className="h-6 min-w-0 max-w-[220px] px-2 gap-1 text-xs"
          startContent={<DynamicIcon name={meta.icon} size={12} className="shrink-0" />}
        >
          <span className="truncate">
            {solution.title}
            {solution.enabled ? '' : ' · вимк.'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm p-3 items-start gap-2">
        <div className="flex items-center gap-2 text-xs text-default-500">
          <DynamicIcon name={meta.icon} size={14} />
          {meta.label}
          <Chip size="sm" variant="flat" color={solution.enabled ? 'success' : 'default'} className="h-5">
            {solution.enabled ? 'увімкнено' : 'вимкнено'}
          </Chip>
        </div>
        <p className="text-sm font-semibold">{solution.title}</p>
        {solution.summary ? <InstructionPreview text={solution.summary} /> : null}
        {solution.kind === 'scenario' && solution.triggersCount != null && (
          <p className="text-xs text-default-500">Фраз клієнтів: {solution.triggersCount}</p>
        )}
        {solution.kind === 'scenario' && solution.scenarioId ? (
          <Button
            size="sm"
            variant="flat"
            startContent={<DynamicIcon name="square-pen" size={14} />}
            onPress={() => onOpenScenario(solution.scenarioId!)}
          >
            Відкрити в конструкторі
          </Button>
        ) : solution.settingsTab ? (
          <Button
            size="sm"
            variant="flat"
            startContent={<DynamicIcon name="settings" size={14} />}
            onPress={() => onOpenSettings(solution.settingsTab!)}
          >
            Налаштування
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Що клієнти просять зробити (не питання) і чи вміє бот це закрити. */
export function ActionRequestsCard({
  rows,
  canManageScenarios,
  onCreateScenario,
  onOpenScenario,
  onOpenSettings,
}: {
  rows: ChatwootBotActionRequestDto[];
  canManageScenarios: boolean;
  onCreateScenario: (row: ChatwootBotActionRequestDto) => void;
  onOpenScenario: (scenarioId: string) => void;
  onOpenSettings: (tab: string) => void;
}) {
  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      <h2 className="flex items-center gap-1 text-md font-semibold text-default-800 mb-1">
        <DynamicIcon name="hand" size={16} />
        Запити на дію
      </h2>
      <p className="text-xs text-default-500 mb-3">
        Що клієнти просять зробити: скасувати чи змінити замовлення, надіслати прайс тощо (розбір повідомлень LLM). «Рішення» –
        сценарій з налаштувань, вбудований інструмент бота або нічого: тоді бот передає запит оператору.
      </p>
      {rows.length === 0 ? (
        <p className="text-default-500 text-sm">
          За обраний період запитів на дію немає (або розбір повідомлень вимкнено на вкладці «Теми питань» налаштувань).
        </p>
      ) : (
        <Table aria-label="Запити на дію" removeWrapper>
          <TableHeader>
            <TableColumn>Запит</TableColumn>
            <TableColumn width={100}>Кількість</TableColumn>
            <TableColumn width={260}>Рішення</TableColumn>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const otherPhrasings = row.examples.filter((e) => e !== row.label);
              return (
                <TableRow key={row.label}>
                  <TableCell>
                    <p className="text-sm font-medium">{row.label}</p>
                    {otherPhrasings.length > 0 && (
                      <p className="text-xs text-default-500">{otherPhrasings.join(' · ')}</p>
                    )}
                  </TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <SolutionChip solution={row.solution} onOpenScenario={onOpenScenario} onOpenSettings={onOpenSettings} />
                      {canManageScenarios && row.solution.kind === 'none' && (
                        <Tooltip content="Створити сценарій для цього запиту" placement="top">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="ml-auto text-blue-600"
                            aria-label="Створити сценарій"
                            onPress={() => onCreateScenario(row)}
                          >
                            <DynamicIcon name="workflow" size={16} />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
