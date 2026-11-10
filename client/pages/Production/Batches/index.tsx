import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Select,
  SelectItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import {
  PRODUCTION_BATCH_STATUSES,
  PRODUCTION_BATCH_STATUS_LABELS,
  type ProductionBatchListItemDto,
  type ProductionBatchStatus,
} from '@shared/types/production';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { batchAwaitsUser, batchNextActions } from '@shared/utils/productionBatchActions';
import { useProductionBatches } from '../useProductionBatches';
import { BatchStatusChip, formatBatchDate } from '../components/batchUi';
import type { DateRange } from '@react-types/datepicker';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';

const TABLE_CLASS_NAMES = {
  wrapper: 'p-0 shadow-none',
  table: 'min-w-[860px]',
  th: 'first:rounded-s-md last:rounded-e-md bg-default-100',
  tr: 'hover:bg-gray-100/60 transition-colors duration-50 cursor-pointer',
  td: 'first:rounded-s-md last:rounded-e-md',
};

const ALL = 'all';

/** Наступна дія варки; моя – виділена. */
function NextStep({ batch, awaitsMe }: { batch: ProductionBatchListItemDto; awaitsMe: boolean }) {
  const action = batchNextActions(batch)[0];
  if (!action) return <span className="text-default-400">–</span>;
  return (
    <span className={`text-[13px] leading-tight ${awaitsMe ? 'flex items-center gap-1.5 font-medium text-primary' : 'text-default-600'}`}>
      {awaitsMe && <DynamicIcon name="hand" size={14} className="shrink-0" />}
      {action.label}
    </span>
  );
}

/** Список варок: номер, товар, план, плановий день, стан. Нова варка – з техкарти. */
export default function BatchesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>(ALL);
  const [range, setRange] = useState<DateRange | null>(null);
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const { hasPermission } = useRoleAccess();
  const { items, loading, error } = useProductionBatches({
    status: status === ALL ? null : (status as ProductionBatchStatus),
    from: range?.start.toString() ?? null,
    to: range?.end.toString() ?? null,
  });

  // Варки, що чекають дії поточного користувача (за його правами)
  const awaitingIds = useMemo(
    () => new Set(items.filter((b) => batchAwaitsUser(b, hasPermission)).map((b) => b.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasPermission змінюється разом із ролями, items – з даними
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (b) =>
        (!mine || awaitingIds.has(b.id)) &&
        (!q ||
          b.number.toLowerCase().includes(q) ||
          b.goodName.toLowerCase().includes(q) ||
          (b.goodSku ?? '').toLowerCase().includes(q)),
    );
  }, [items, search, mine, awaitingIds]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          classNames={{ base: 'w-full sm:max-w-3xs', inputWrapper: 'data-[hover=true]:bg-white' }}
          autoComplete="off"
          placeholder="Номер, товар або артикул"
          value={search}
          isClearable
          onValueChange={setSearch}
          startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        />
        <Select
          aria-label="Стан варки"
          className="w-full sm:max-w-56"
          classNames={{ trigger: 'data-[hover=true]:bg-white' }}
          selectedKeys={[status]}
          onSelectionChange={(keys) => setStatus(String(Array.from(keys)[0] ?? ALL))}
        >
          {[
            <SelectItem key={ALL}>Усі стани</SelectItem>,
            ...PRODUCTION_BATCH_STATUSES.map((s) => <SelectItem key={s}>{PRODUCTION_BATCH_STATUS_LABELS[s]}</SelectItem>),
          ]}
        </Select>
        <div className="flex items-center gap-1">
          <ReportDateRangeFilter ariaLabel="Плановий день: період" value={range} onChange={setRange} />
          {range && (
            <Button
              size="sm"
              variant="light"
              isIconOnly
              aria-label="Скинути дати"
              title="Скинути дати"
              onPress={() => setRange(null)}
            >
              <DynamicIcon name="x" size={14} />
            </Button>
          )}
        </div>
        <Switch size="sm" isSelected={mine} onValueChange={setMine} classNames={{ wrapper: 'border border-white/75' }}>
          <span className="text-sm">
            Очікує моєї дії
            {awaitingIds.size > 0 && <span className="ml-1.5 tabular-nums text-[12px] text-default-700 bg-default-700/10 px-1 py-0.5 rounded shadow-inner-sm">{awaitingIds.size}</span>}
          </span>
        </Switch>
        {/* <span className="ml-auto text-sm text-default-500 tabular-nums">{filtered.length}</span> */}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="shadow-none rounded-lg">
        <CardBody className="p-3">
          {loading ? (
            <div className="p-8 text-center text-default-500">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-default-500">
              {items.length === 0 && status === ALL && !range
                ? 'Варок ще немає. Нову варку створюють у техкарті товару.'
                : mine
                  ? 'Немає варок, що чекають вашої дії'
                  : 'Нічого не знайдено за обраними фільтрами'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table
                aria-label="Варки"
                removeWrapper
                classNames={TABLE_CLASS_NAMES}
                onRowAction={(key) => navigate(`/production/batches/${String(key)}`)}
              >
                <TableHeader>
                  <TableColumn key="number">Номер</TableColumn>
                  <TableColumn key="good">Товар</TableColumn>
                  <TableColumn key="portions" className="text-right">План порцій</TableColumn>
                  <TableColumn key="date">Плановий день</TableColumn>
                  <TableColumn key="status">Стан</TableColumn>
                  <TableColumn key="next">Наступний крок</TableColumn>
                  <TableColumn key="stages" className="text-right">Етапи</TableColumn>
                  <TableColumn key="author">Створив</TableColumn>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-sm font-medium [&>span]:text-nowrap">{b.number}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">{b.goodName}</div>
                        <div className="text-xs text-default-500">
                          {[b.goodSku, `техкарта v${b.techCardVersion}`].filter(Boolean).join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.plannedPortions}</TableCell>
                      <TableCell className="tabular-nums">{formatBatchDate(b.plannedDate)}</TableCell>
                      <TableCell>
                        <BatchStatusChip status={b.status} />
                      </TableCell>
                      <TableCell>
                        <NextStep batch={b} awaitsMe={awaitingIds.has(b.id)} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-default-500">
                        {b.stagesTotal > 0 ? `${b.stagesDone} / ${b.stagesTotal}` : '–'}
                      </TableCell>
                      <TableCell className="text-sm text-default-500">{b.createdByName ?? '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
