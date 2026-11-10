/**
 * Наступна дія варки: хто зараз має діяти (право) і що саме зробити.
 *
 * Одне джерело для адресатів сповіщень, фільтра «Очікує моєї дії» і колонки «Відповідальний».
 */
import { PERMISSIONS } from '../constants/permissions.js';
import type { ProductionBatchStatus } from '../types/production.js';

export type ProductionBatchActionId = 'issue' | 'acceptProduction' | 'cook' | 'output' | 'acceptFinished' | 'close';

export interface ProductionBatchAction {
  id: ProductionBatchActionId;
  /** Право, з яким цю дію можна виконати. */
  permission: string;
  /** Що зробити, для колонки «Відповідальний» і сповіщень. */
  label: string;
}

export const PRODUCTION_BATCH_ACTIONS: Record<ProductionBatchActionId, ProductionBatchAction> = {
  issue: { id: 'issue', permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ISSUE, label: 'Видати сировину' },
  acceptProduction: {
    id: 'acceptProduction',
    permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_PRODUCTION,
    label: 'Прийняти на виробництво',
  },
  cook: { id: 'cook', permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_COOK, label: 'Відмітити етапи' },
  output: { id: 'output', permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_PRODUCTION, label: 'Внести факт виходу' },
  acceptFinished: {
    id: 'acceptFinished',
    permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_ACCEPT_FINISHED,
    label: 'Прийняти на склад ГП',
  },
  close: { id: 'close', permission: PERMISSIONS.ACTION_PRODUCTION_BATCHES_CREATE, label: 'Закрити варку' },
};

export interface BatchProgressLike {
  status: ProductionBatchStatus;
  stagesTotal: number;
  stagesDone: number;
}

/** Дії, яких чекає варка; перша – основна. [] – варка завершена або скасована. */
export function batchNextActions(batch: BatchProgressLike): ProductionBatchAction[] {
  const A = PRODUCTION_BATCH_ACTIONS;
  switch (batch.status) {
    case 'draft':
      return [A.issue];
    case 'issued':
      return [A.acceptProduction];
    case 'accepted':
    case 'cooking':
      return batch.stagesDone < batch.stagesTotal ? [A.cook, A.output] : [A.output];
    case 'output':
      return [A.acceptFinished];
    case 'finished':
      return [A.close];
    default:
      return [];
  }
}

/** Чи чекає варка дії користувача: can – перевірка права (адміністратор має всі). */
export function batchAwaitsUser(batch: BatchProgressLike, can: (permission: string) => boolean): boolean {
  return batchNextActions(batch).some((a) => can(a.permission));
}
