import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Select,
  SelectItem,
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
  type ProductionBatchStatus,
} from '@shared/types/production';
import { useProductionBatches } from '../useProductionBatches';
import { BatchStatusChip, formatBatchDate } from '../components/batchUi';
import { BatchDatePicker } from '../components/BatchDatePicker';

const TABLE_CLASS_NAMES = {
  wrapper: 'p-0 shadow-none',
  table: 'min-w-[640px]',
  th: 'first:rounded-s-md last:rounded-e-md bg-default-100',
  tr: 'hover:bg-gray-100/60 transition-colors duration-50 cursor-pointer',
  td: 'first:rounded-s-md last:rounded-e-md',
};

const ALL = 'all';

/** Список варок: номер, товар, план, плановий день, стан. Нова варка – з техкарти. */
export default function BatchesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const { items, loading, error } = useProductionBatches({
    status: status === ALL ? null : (status as ProductionBatchStatus),
    from: from || null,
    to: to || null,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (b) =>
        b.number.toLowerCase().includes(q) ||
        b.goodName.toLowerCase().includes(q) ||
        (b.goodSku ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <BatchDatePicker ariaLabel="Плановий день від" className="flex-1 sm:w-44" value={from} onChange={setFrom} />
          <span className="text-default-400">–</span>
          <BatchDatePicker ariaLabel="Плановий день до" className="flex-1 sm:w-44" value={to} onChange={setTo} />
          {(from || to) && (
            <Button
              size="sm"
              variant="light"
              isIconOnly
              aria-label="Скинути дати"
              title="Скинути дати"
              onPress={() => {
                setFrom('');
                setTo('');
              }}
            >
              <DynamicIcon name="x" size={14} />
            </Button>
          )}
        </div>
        <span className="ml-auto text-sm text-default-500 tabular-nums">{filtered.length}</span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="shadow-none rounded-lg">
        <CardBody className="p-3">
          {loading ? (
            <div className="p-8 text-center text-default-500">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-default-500">
              {items.length === 0
                ? 'Варок ще немає. Нову варку створюють у техкарті товару.'
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
                  <TableColumn key="author">Створив</TableColumn>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-sm font-medium">{b.number}</TableCell>
                      <TableCell>
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
