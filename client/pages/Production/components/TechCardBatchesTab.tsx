import { useState } from 'react';
import { Button, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useNavigate } from 'react-router-dom';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import type { TechCardDetailDto } from '@shared/types/production';
import { useProductionBatches } from '../useProductionBatches';
import { BatchStatusChip, formatBatchDate } from './batchUi';
import { NewBatchModal } from './NewBatchModal';

const TABLE_CLASS_NAMES = {
  table: 'min-w-[520px]',
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2',
  tr: 'cursor-pointer hover:bg-default-50 border-b border-default-200/70 last:border-b-0',
};

/** Вкладка «Варки» техкарти: варки товару і «Нова варка» з чинної версії техкарти. */
export function TechCardBatchesTab({ data, overlayZ }: { data: TechCardDetailDto; overlayZ?: string }) {
  const navigate = useNavigate();
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_PRODUCTION_BATCHES);
  const canCreate = hasPermission(PERMISSIONS.ACTION_PRODUCTION_BATCHES_CREATE);
  const { items, loading, error } = useProductionBatches({ goodId: data.goodId }, canView);
  const [open, setOpen] = useState(false);
  const approved = data.current != null;

  if (!canView) return <p className="text-sm text-default-500">Немає доступу до варок.</p>;

  const newButton = (
    <Button
      color="primary"
      isDisabled={!approved}
      startContent={<DynamicIcon name="plus" size={14} />}
      onPress={() => setOpen(true)}
    >
      Нова варка
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div className="flex justify-end">
          {approved ? (
            newButton
          ) : (
            <Tooltip content="Варку створюють із затвердженої версії техкарти" classNames={{ content: 'text-xs' }}>
              <span>{newButton}</span>
            </Tooltip>
          )}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="-mx-1 overflow-x-auto px-1">
        <Table
          aria-label="Варки товару"
          removeWrapper
          classNames={TABLE_CLASS_NAMES}
          onRowAction={(key) => navigate(`/production/batches/${String(key)}`)}
        >
          <TableHeader>
            <TableColumn>Номер</TableColumn>
            <TableColumn className="text-right">План порцій</TableColumn>
            <TableColumn>Плановий день</TableColumn>
            <TableColumn>Стан</TableColumn>
            <TableColumn>Техкарта</TableColumn>
          </TableHeader>
          <TableBody isLoading={loading} emptyContent={loading ? ' ' : 'Варок за цією техкартою ще немає'}>
            {items.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono font-medium">{b.number}</TableCell>
                <TableCell className="text-right tabular-nums">{b.plannedPortions}</TableCell>
                <TableCell className="tabular-nums">{formatBatchDate(b.plannedDate)}</TableCell>
                <TableCell>
                  <BatchStatusChip status={b.status} />
                </TableCell>
                <TableCell className="tabular-nums">v{b.techCardVersion}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <NewBatchModal
        isOpen={open}
        goodId={data.goodId}
        goodName={data.good.name}
        defaultPortions={data.current?.payload.batchPortions ?? 1000}
        techCardVersion={data.current?.version ?? null}
        overlayZ={overlayZ}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
