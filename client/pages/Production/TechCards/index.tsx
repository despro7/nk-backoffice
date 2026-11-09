import { useMemo, useState } from 'react';
import {
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
import { PRODUCTION_BATCH_STATUS_LABELS, type TechCardStatus } from '@shared/types/production';
import { useTechCards } from '../useTechCards';
import { SpecDraftChip, TECH_CARD_STATUS_META, TechCardStatusChip, formatDateTime } from '../components/techCardUi';
import { formatBatchDate } from '../components/batchUi';

const TABLE_CLASS_NAMES = {
  wrapper: 'p-0 shadow-none',
  th: 'first:rounded-s-md last:rounded-e-md bg-default-100',
  tr: 'hover:bg-gray-100/60 transition-colors duration-50 cursor-pointer',
  td: 'first:rounded-s-md last:rounded-e-md',
};

const ALL = 'all';
const STATUS_FILTER_ORDER: TechCardStatus[] = ['none', 'editing', 'pending', 'rejected', 'approved'];

/** Список техкарт: готова продукція зі статусом техкарти. */
export default function TechCardsPage() {
  const navigate = useNavigate();
  const { items, loading, error } = useTechCards();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(ALL);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== ALL && item.status !== status) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || (item.sku ?? '').toLowerCase().includes(q);
    });
  }, [items, search, status]);

  const open = (goodId: string) => navigate(`/production/techcards/${encodeURIComponent(goodId)}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          classNames={{ base: 'max-w-3xs', inputWrapper: 'data-[hover=true]:bg-white' }}
          autoComplete="off"
          placeholder="Пошук за назвою або артикулом"
          value={search}
          isClearable
          onValueChange={setSearch}
          startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
        />
        <Select
          aria-label="Статус техкарти"
          className="max-w-52"
          classNames={{ trigger: 'data-[hover=true]:bg-white' }}
          selectedKeys={[status]}
          onSelectionChange={(keys) => setStatus(String(Array.from(keys)[0] ?? ALL))}
        >
          {[
            <SelectItem key={ALL}>Усі статуси</SelectItem>,
            ...STATUS_FILTER_ORDER.map((s) => <SelectItem key={s}>{TECH_CARD_STATUS_META[s].label}</SelectItem>),
          ]}
        </Select>
        <span className="ml-auto text-sm text-default-500 tabular-nums">
          {filtered.length} з {items.length}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="shadow-none rounded-lg">
        <CardBody className="p-3">
          {loading ? (
            <div className="p-8 text-center text-default-500">Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-default-500">
              {items.length === 0 ? 'Немає готової продукції' : 'Нічого не знайдено за обраними фільтрами'}
            </div>
          ) : (
            <Table
              aria-label="Техкарти"
              removeWrapper
              classNames={TABLE_CLASS_NAMES}
              onRowAction={(key) => open(String(key))}
            >
              <TableHeader>
                <TableColumn key="index" width={48}>№</TableColumn>
                <TableColumn key="name">Товар</TableColumn>
                <TableColumn key="spec">Специфікація</TableColumn>
                <TableColumn key="status">Техкарта</TableColumn>
                <TableColumn key="stages" className="text-right">Етапів</TableColumn>
                <TableColumn key="updatedAt">Змінено</TableColumn>
                <TableColumn key="lastBatch">Остання варка</TableColumn>
              </TableHeader>
              <TableBody>
                {filtered.map((item, index) => (
                  <TableRow key={item.goodId}>
                    <TableCell className="text-default-400 tabular-nums text-sm">{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-default-500">
                        {[item.sku, item.folderName].filter(Boolean).join(' · ') || '–'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums text-sm">
                          {item.specVersion != null ? `v${item.specVersion}` : '–'}
                        </span>
                        <span className="text-xs text-default-500">{item.componentsCount} поз.</span>
                        {item.specDraftStatus && <SpecDraftChip status={item.specDraftStatus} />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TechCardStatusChip status={item.status} />
                        {item.techCardVersion != null && (
                          <span className="tabular-nums text-sm">v{item.techCardVersion}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.stagesCount || '–'}</TableCell>
                    <TableCell className="tabular-nums text-sm text-default-500">
                      {formatDateTime(item.updatedAt)}
                    </TableCell>
                    <TableCell>
                      {item.lastBatch ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs">{item.lastBatch.number}</span>
                          <span className="text-xs text-default-500">
                            {formatBatchDate(item.lastBatch.plannedDate)} ·{' '}
                            {PRODUCTION_BATCH_STATUS_LABELS[item.lastBatch.status]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-default-400">–</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
