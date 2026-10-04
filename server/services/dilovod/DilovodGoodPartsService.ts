/**
 * Створення партій у Dilovod (`catalogs.goodParts`).
 * Поля payload збираються з live-метаданих: у NK Food API доступні лише code/owner/date/expiration.
 */

import { DilovodApiClient } from './DilovodApiClient.js';
import { dilovodMetadataService } from './DilovodMetadataService.js';
import type { DilovodObjectMetadata } from './DilovodTypes.js';
import { formatDateForDilovod, unwrapDilovodId } from './DilovodUtils.js';
import { isUsableDilovodBatchId } from '../../../shared/utils/dilovodBatchId.js';
import {
  formatBatchExpirationForDilovod,
  formatGoodPartCodeForDilovod,
  formatGoodPartNumberForDilovod,
} from '../../../shared/utils/kitBatchName.js';

export type CreateGoodPartInput = {
  /** Dilovod id товару-власника (owner). */
  owner: string;
  /** Серійний № / назва партії для UI. */
  batchName: string;
  productionDate?: string | null;
  expiration?: string | null;
};

export type CreateGoodPartResult = {
  batchId: string;
  batchNumber: string;
};

function reqsToFieldNames(meta: DilovodObjectMetadata | null | undefined): Set<string> {
  const names = new Set<string>();
  const reqs = meta?.reqs;
  if (!reqs) return names;
  if (Array.isArray(reqs)) {
    for (const item of reqs) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (name) names.add(name);
    }
    return names;
  }
  if (typeof reqs === 'object') {
    for (const name of Object.keys(reqs)) {
      if (name.trim()) names.add(name.trim());
    }
  }
  return names;
}

/** Завантажує імена полів, які Dilovod дозволяє писати в saveObject. */
export async function resolveGoodPartWritableFields(): Promise<Set<string>> {
  const meta = await dilovodMetadataService.getObject('catalogs.goodParts');
  return reqsToFieldNames(meta);
}

/** Payload header для saveObject catalogs.goodParts. */
export function buildGoodPartCreateHeader(input: {
  owner: string;
  batchName: string;
  productionDate: string;
  expiration?: string | null;
  writableFields?: Set<string>;
}): Record<string, unknown> {
  const owner = String(input.owner ?? '').trim();
  const batchName = String(input.batchName ?? '').trim();
  const code = formatGoodPartCodeForDilovod(batchName);
  const header: Record<string, unknown> = {
    id: 'catalogs.goodParts',
    owner,
    code,
    date: input.productionDate,
  };

  const expiration = formatBatchExpirationForDilovod(input.expiration);
  if (expiration) {
    header.expiration = expiration;
  }

  const writable = input.writableFields;
  if (writable?.has('name')) {
    header.name = { uk: code, ru: '' };
  }
  if (writable?.has('number')) {
    const number = formatGoodPartNumberForDilovod(batchName);
    if (number) header.number = number;
  }

  return header;
}

export class DilovodGoodPartsService {
  private api = new DilovodApiClient();

  /**
   * Створює нову партію в Dilovod (catalogs.goodParts).
   */
  async createGoodPart(input: CreateGoodPartInput): Promise<CreateGoodPartResult> {
    const owner = String(input.owner ?? '').trim();
    const batchName = String(input.batchName ?? '').trim();
    if (!owner) {
      throw new Error('owner обовʼязковий');
    }
    if (!batchName) {
      throw new Error('batchName обовʼязковий');
    }

    await this.api.ensureReady();
    const productionDate = input.productionDate?.trim() || formatDateForDilovod('Kyiv');
    const writableFields = await resolveGoodPartWritableFields();
    const header = buildGoodPartCreateHeader({
      owner,
      batchName,
      productionDate,
      expiration: input.expiration,
      writableFields,
    });

    const resp = await this.api.makeRequest<{ id?: unknown; error?: unknown }>({
      version: '0.25',
      key: this.api.getApiKey(),
      action: 'saveObject',
      params: { header },
    });

    if (resp?.error) {
      throw new Error(typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error));
    }

    const batchId = unwrapDilovodId(resp?.id);
    if (!isUsableDilovodBatchId(batchId)) {
      throw new Error('Dilovod не повернув id нової партії');
    }

    return { batchId, batchNumber: batchName };
  }
}

export const dilovodGoodPartsService = new DilovodGoodPartsService();
