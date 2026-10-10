import type { ReturnHistoryRecord } from '../../WarehouseReturns/WarehouseReturnsTypes';
import type { WarehouseDocHistoryPagination } from '../../shared/warehouseDocHistoryTypes';
import { WarehouseGoodDocumentHistoryTab } from '../../shared/WarehouseGoodDocumentHistoryTab';

interface WriteOffHistoryTabProps {
  records: ReturnHistoryRecord[];
  loading: boolean;
  onRefresh: () => void;
  title?: string;
  emptyMessage?: string;
  pagination?: WarehouseDocHistoryPagination;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onEditRecord?: (record: ReturnHistoryRecord) => void | Promise<void>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onLoadRecord?: (record: ReturnHistoryRecord) => Promise<void>;
  detailsLoading?: Record<string, boolean>;
}

export const WriteOffHistoryTab = (props: WriteOffHistoryTabProps) => (
  <WarehouseGoodDocumentHistoryTab recordType="writeOff" {...props} />
);
