import {
  resolveWarehouseHistoryDilovodFrom,
  WAREHOUSE_HISTORY_DILOVOD_FROM,
  type WarehouseHistoryDilovodRecordType,
} from '@shared/constants/warehouseHistoryDilovodFrom';
import { formatReleaseInternalDocDisplayNumber } from '@shared/utils/releaseHistoryDisplayDocNumber';
import type { ReleaseHistoryCorrectionLayer } from '@shared/utils/mergeReleaseHistoryCorrections';

export type HistoryDilovodCheckItem = {
  id: number;
  dilovodDocId: string;
  label: string;
  dilovodFrom: string;
};

/** ID документа в Dilovod залежить від типу складської історії. */
export function resolveWarehouseHistoryDilovodDocId(record: {
  dilovodDocId?: unknown;
  dilovod_doc_id?: unknown;
  returnNumber?: unknown;
  return_number?: unknown;
  writeOffNumber?: unknown;
  write_off_number?: unknown;
  surplusNumber?: unknown;
  surplus_number?: unknown;
}): string {
  const candidates = [
    record.dilovodDocId,
    record.dilovod_doc_id,
    record.returnNumber,
    record.return_number,
    record.writeOffNumber,
    record.write_off_number,
    record.surplusNumber,
    record.surplus_number,
  ];
  for (const value of candidates) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function collectHistoryDilovodCheckItems(
  record: {
    id?: unknown;
    dilovodDocId?: unknown;
    dilovod_doc_id?: unknown;
    returnNumber?: unknown;
    return_number?: unknown;
    writeOffNumber?: unknown;
    write_off_number?: unknown;
    surplusNumber?: unknown;
    surplus_number?: unknown;
    internalDocNumber?: unknown;
    internal_doc_number?: unknown;
    correctionLayers?: ReleaseHistoryCorrectionLayer[];
  },
  options?: { recordType?: WarehouseHistoryDilovodRecordType },
): HistoryDilovodCheckItem[] {
  const defaultFrom = resolveWarehouseHistoryDilovodFrom(options?.recordType);
  const releaseFrom = WAREHOUSE_HISTORY_DILOVOD_FROM.releaseSet;

  const layers = Array.isArray(record.correctionLayers) ? record.correctionLayers : [];
  const fromLayers = layers
    .map((layer) => {
      const dilovodDocId = resolveWarehouseHistoryDilovodDocId(layer);
      if (!dilovodDocId) return null;
      const internal = String(
        layer.internalDocNumber ?? layer.internal_doc_number ?? '',
      ).trim();
      const label = formatReleaseInternalDocDisplayNumber(internal)
        ?? (internal || String(layer.recordId ?? layer.id ?? '').trim() || dilovodDocId);
      return {
        id: Number(layer.recordId ?? layer.id),
        dilovodDocId,
        label,
        dilovodFrom: releaseFrom,
      };
    })
    .filter((row): row is HistoryDilovodCheckItem => row != null);
  if (fromLayers.length > 0) return fromLayers;

  const dilovodDocId = resolveWarehouseHistoryDilovodDocId(record);
  if (!dilovodDocId) return [];
  const internal = String(record.internalDocNumber ?? record.internal_doc_number ?? '').trim();
  const label = formatReleaseInternalDocDisplayNumber(internal)
    ?? (internal || String(record.id ?? '').trim() || dilovodDocId);
  return [{ id: Number(record.id), dilovodDocId, label, dilovodFrom: defaultFrom }];
}

export function formatHistoryDilovodCheckAlertLine(
  label: string,
  result: {
    dilovodDocId?: string;
    exists?: boolean;
    delMark?: boolean;
    success?: boolean;
    error?: string;
  },
): string {
  if (result.error) return `⚠️ ${label}: помилка — ${result.error}`;
  if (result.success === false) return `⚠️ ${label}: перевірку не виконано`;
  const docId = String(result.dilovodDocId ?? '').trim() || '—';
  if (result.exists === false) {
    return `❌ ${label} (${docId})\nНе знайдено в Dilovod (немає в відповіді API)`;
  }
  if (result.delMark) {
    return `🗑️ ${label} (${docId})\nЗнайдено · позначено на видалення (delMark)`;
  }
  return `✅ ${label} (${docId})\nЗнайдено · активний документ (delMark ні)`;
}

export async function runWarehouseHistoryDilovodCheck(
  items: HistoryDilovodCheckItem[],
): Promise<void> {
  if (items.length === 0) {
    window.alert('ℹ️ У запису немає ID документа Dilovod — перевірити неможливо.');
    return;
  }

  const response = await fetch('/api/warehouse/releases/check-dilovod-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      readOnly: true,
      items: items.map(({ id, dilovodDocId, dilovodFrom }) => ({
        id,
        dilovodDocId,
        dilovodFrom,
      })),
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    window.alert(`⚠️ ${json?.error ? String(json.error) : `Помилка HTTP ${response.status}`}`);
    return;
  }

  const results = Array.isArray(json.results) ? json.results : [];
  const labelById = new Map(items.map((item) => [item.id, item.label]));
  const lines = results.map((row: {
    id?: number;
    dilovodDocId?: string;
    exists?: boolean;
    delMark?: boolean;
    success?: boolean;
    error?: string;
  }) => {
    const label = labelById.get(Number(row.id)) ?? `Запис №${row.id ?? '?'}`;
    return formatHistoryDilovodCheckAlertLine(label, row);
  });
  window.alert(lines.join('\n\n'));
}
