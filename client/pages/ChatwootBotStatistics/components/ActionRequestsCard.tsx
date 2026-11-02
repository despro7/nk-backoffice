import React from 'react';
import { Button, Chip, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ChatwootBotActionRequestDto, ChatwootBotActionSolution } from '@shared/types/chatwootBotScenarios';

function SolutionChip({ solution }: { solution: ChatwootBotActionSolution }) {
  if (solution.kind === 'none') {
    return (
      <Chip size="sm" variant="flat" color="warning">
        Немає – оператор
      </Chip>
    );
  }
  const prefix = solution.kind === 'scenario' ? 'Сценарій' : 'Вбудовано';
  return (
    <Tooltip content={solution.enabled ? 'Увімкнено' : 'Вимкнено – бот передає запит оператору'} placement="top">
      <Chip size="sm" variant="flat" color={solution.enabled ? 'success' : 'default'} className="max-w-[260px]">
        {prefix}: {solution.title}
        {solution.enabled ? '' : ' (вимк.)'}
      </Chip>
    </Tooltip>
  );
}

/** Що клієнти просять зробити (не питання) і чи вміє бот це закрити. */
export function ActionRequestsCard({
  rows,
  canManageScenarios,
  onCreateScenario,
  onOpenScenario,
}: {
  rows: ChatwootBotActionRequestDto[];
  canManageScenarios: boolean;
  onCreateScenario: (row: ChatwootBotActionRequestDto) => void;
  onOpenScenario: (scenarioId: string) => void;
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
            <TableColumn width={300}>Рішення</TableColumn>
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
                      <SolutionChip solution={row.solution} />
                      {canManageScenarios && row.solution.kind === 'scenario' && row.solution.scenarioId && (
                        <Tooltip content="Відкрити сценарій" placement="top">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            className="ml-auto"
                            aria-label="Відкрити сценарій"
                            onPress={() => onOpenScenario(row.solution.scenarioId!)}
                          >
                            <DynamicIcon name="square-pen" size={16} />
                          </Button>
                        </Tooltip>
                      )}
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
