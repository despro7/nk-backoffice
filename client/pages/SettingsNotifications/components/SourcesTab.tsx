import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Chip,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { HR_TABLE_CLASS_NAMES } from '@/pages/Hr/hrUi';
import type { NotificationSourceSummary } from '@shared/types/notificationSettings';

interface SourcesTabProps {
  sources: NotificationSourceSummary[] | null;
  onTest: (source: NotificationSourceSummary) => void;
  onCreateRule: (source: NotificationSourceSummary) => void;
}

type Filter = 'all' | 'uncovered' | 'visible' | 'hidden';

export function SourcesTab({ sources, onTest, onCreateRule }: SourcesTabProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => {
    const list = sources ?? [];
    switch (filter) {
      case 'uncovered':
        return list.filter((s) => s.ruleId == null);
      case 'visible':
        return list.filter((s) => s.visible);
      case 'hidden':
        return list.filter((s) => !s.visible);
      default:
        return list;
    }
  }, [sources, filter]);

  const uncovered = (sources ?? []).filter((s) => s.ruleId == null).length;

  return (
    <Card className="shadow-container">
      <CardBody className="gap-3 p-3">
        <div className="flex flex-wrap items-center gap-3 px-1">
          <Select
            size="sm"
            className="max-w-[220px]"
            label="Показати"
            selectedKeys={[filter]}
            onSelectionChange={(k) => setFilter((Array.from(k)[0] as Filter) ?? 'all')}
          >
            <SelectItem key="all">Усі джерела</SelectItem>
            <SelectItem key="uncovered">Без правила</SelectItem>
            <SelectItem key="visible">Видимі в дропдауні</SelectItem>
            <SelectItem key="hidden">Лише журнал</SelectItem>
          </Select>
          <span className="text-xs text-default-500">
            Що пишеться в журнал за 90 днів, згруповано за категорією, статусом і заголовком.
            {uncovered > 0 && <> Без правила: <b className="text-warning-600">{uncovered}</b>.</>}
          </span>
        </div>
        <Table aria-label="Джерела сповіщень" removeWrapper classNames={HR_TABLE_CLASS_NAMES} isStriped={false}>
          <TableHeader>
            <TableColumn>Категорія</TableColumn>
            <TableColumn>Статус</TableColumn>
            <TableColumn>Заголовок</TableColumn>
            <TableColumn align="end">Записів</TableColumn>
            <TableColumn>Останній</TableColumn>
            <TableColumn>Правило (останній запис)</TableColumn>
            <TableColumn align="end"> </TableColumn>
          </TableHeader>
          <TableBody
            items={rows.map((r) => ({ ...r, key: `${r.category}|${r.status}|${r.title}` }))}
            isLoading={sources === null}
            loadingContent={<span className="text-sm text-default-400">Завантаження…</span>}
            emptyContent="Немає записів"
          >
            {(s) => (
              <TableRow key={s.key} className="group">
                <TableCell className="font-mono text-xs">{s.category}</TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={s.status === 'error' ? 'danger' : s.status === 'warning' ? 'warning' : s.status === 'success' ? 'success' : 'default'} className="h-5 text-[11px]">
                    {s.status}
                  </Chip>
                </TableCell>
                <TableCell className="max-w-[320px] truncate text-sm">{s.title ?? '–'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-default-500">{new Date(s.lastAt).toLocaleDateString('uk-UA')}</TableCell>
                <TableCell>
                  {s.ruleName ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <DynamicIcon name={s.visible ? 'eye' : 'eye-off'} size={13} className="text-default-400" />
                      {s.ruleName}
                    </span>
                  ) : (
                    <Chip size="sm" variant="flat" color="warning" className="h-5 text-[11px]">Без правила</Chip>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Tooltip content="Відкрити в тестері" delay={300}>
                      <Button isIconOnly size="sm" variant="light" aria-label="Відкрити в тестері" onPress={() => onTest(s)}>
                        <DynamicIcon name="flask-conical" size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Створити правило з цього джерела" delay={300}>
                      <Button isIconOnly size="sm" variant="light" className="text-blue-600" aria-label="Створити правило" onPress={() => onCreateRule(s)}>
                        <DynamicIcon name="plus" size={16} />
                      </Button>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
