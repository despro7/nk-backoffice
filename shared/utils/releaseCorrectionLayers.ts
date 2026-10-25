import { formatReleaseHistoryDocTrail } from './releaseHistoryDisplayTitle.js';

export type CorrectionLayerLike = {
  operationType?: string | null;
  status?: string | null;
  internalDocNumber?: string | null;
  internal_doc_number?: string | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
};

function operationKind(value: unknown): 'kit' | 'unkit' | 'other' {
  const op = String(value ?? '').toLowerCase();
  if (op === 'kit') return 'kit';
  if (op === 'unkit') return 'unkit';
  return 'other';
}

function layerCreatedAtMs(layer: CorrectionLayerLike): number {
  const raw = layer.createdAt ?? layer.created_at ?? null;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function docNumber(layer: CorrectionLayerLike): string {
  return String(layer.internalDocNumber ?? layer.internal_doc_number ?? '').trim();
}

function isSendFailed(layer: CorrectionLayerLike): boolean {
  return String(layer.status ?? '').toLowerCase() === 'send_failed';
}

/** kit → unkit(и) за часом створення. */
export function sortCorrectionLayersForDisplay<T extends CorrectionLayerLike>(layers: T[]): T[] {
  const kits = layers.filter((layer) => operationKind(layer.operationType) === 'kit');
  const unkits = layers
    .filter((layer) => operationKind(layer.operationType) === 'unkit')
    .sort((a, b) => layerCreatedAtMs(a) - layerCreatedAtMs(b));
  const others = layers.filter((layer) => operationKind(layer.operationType) === 'other');
  return [...kits, ...unkits, ...others];
}

export function pickPrimaryCorrectionUnkit<T extends CorrectionLayerLike>(unkits: T[]): T | null {
  if (unkits.length === 0) return null;
  const successful = unkits.filter((layer) => !isSendFailed(layer));
  const pool = successful.length > 0 ? successful : unkits;
  return [...pool].sort((a, b) => layerCreatedAtMs(a) - layerCreatedAtMs(b)).at(-1) ?? null;
}

/** №512/514 — без помилкового unkit у заголовку. */
export function buildCorrectionDocTrailFromLayers(layers: CorrectionLayerLike[]): string | null {
  const sorted = sortCorrectionLayersForDisplay(layers);
  const kit = sorted.find((layer) => operationKind(layer.operationType) === 'kit');
  const unkits = sorted.filter((layer) => operationKind(layer.operationType) === 'unkit');
  const primaryUnkit = pickPrimaryCorrectionUnkit(unkits);
  const numbers = [docNumber(kit ?? {}), docNumber(primaryUnkit ?? {})].filter(Boolean);
  return formatReleaseHistoryDocTrail(numbers);
}

/** Є kit і хоча б один успішний unkit (не лише send_failed). */
export function isCorrectionHistoryComplete(layers: CorrectionLayerLike[]): boolean {
  const sorted = sortCorrectionLayersForDisplay(layers);
  const hasKit = sorted.some((layer) => operationKind(layer.operationType) === 'kit');
  const hasSuccessfulUnkit = sorted.some((
    layer,
  ) => operationKind(layer.operationType) === 'unkit' && !isSendFailed(layer));
  return hasKit && hasSuccessfulUnkit;
}

export function getCorrectionLayerStepPrefix(
  layer: CorrectionLayerLike,
  sortedLayers: CorrectionLayerLike[],
): string {
  if (sortedLayers.length <= 1) return '';

  const kind = operationKind(layer.operationType);
  if (kind === 'kit') return 'Крок 1 · ';

  if (kind === 'unkit') {
    if (isSendFailed(layer)) return 'Помилкова спроба · ';
    const successfulUnkits = sortedLayers.filter((
      row,
    ) => operationKind(row.operationType) === 'unkit' && !isSendFailed(row));
    const successIndex = successfulUnkits.findIndex((row) => docNumber(row) === docNumber(layer));
    if (successIndex >= 0) {
      return `Крок ${successIndex + 2} · `;
    }
    return '';
  }

  return '';
}
