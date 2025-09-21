export interface SyncHistoryRecord {
  id: number;
  syncType: string; // 'manual', 'automatic', 'background'
  startDate?: string;
  endDate?: string;
  totalOrders: number;
  newOrders: number;
  updatedOrders: number;
  skippedOrders: number;
  errors: number;
  duration: number;
  details: any;
  status: string; // 'success', 'partial', 'failed'
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
