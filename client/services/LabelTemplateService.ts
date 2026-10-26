import type {
  LabelTemplateDefaults,
  LabelTemplateDetailDto,
  LabelTemplateDto,
  LabelTemplateGoodOverrideLink,
  LabelTemplatePreviewInputsDto,
} from '@shared/types/labelTemplate';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';

type ApiResult<T> = { success: boolean; data?: T; error?: string };

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResult<T>;
  if (!res.ok || !body.success || body.data == null) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body.data;
}

export class LabelTemplateService {
  static list(filter?: { audience?: string; labelKind?: string }): Promise<LabelTemplateDto[]> {
    const url = new URL('/api/label-templates', window.location.origin);
    if (filter?.audience) url.searchParams.set('audience', filter.audience);
    if (filter?.labelKind) url.searchParams.set('labelKind', filter.labelKind);
    return fetch(url.toString(), { credentials: 'include' }).then((res) => parseJson(res));
  }

  static get(id: string): Promise<LabelTemplateDetailDto> {
    return fetch(`/api/label-templates/${encodeURIComponent(id)}`, { credentials: 'include' }).then(
      (res) => parseJson(res),
    );
  }

  static listGoodOverrides(templateId: string): Promise<LabelTemplateGoodOverrideLink[]> {
    return fetch(`/api/label-templates/${encodeURIComponent(templateId)}/good-overrides`, {
      credentials: 'include',
    }).then((res) => parseJson(res));
  }

  static save(
    id: string | null,
    input: {
      name: string;
      labelKind: string;
      audience: string;
      template?: LabelPdfmeTemplate;
      isDeletionLocked?: boolean;
      iconKey?: string | null;
    },
  ): Promise<LabelTemplateDetailDto> {
    const url = id ? `/api/label-templates/${encodeURIComponent(id)}` : '/api/label-templates';
    return fetch(url, {
      method: id ? 'PUT' : 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((res) => parseJson(res));
  }

  static duplicate(id: string): Promise<LabelTemplateDetailDto> {
    return fetch(`/api/label-templates/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      credentials: 'include',
    }).then((res) => parseJson(res));
  }

  static archive(id: string): Promise<void> {
    return fetch(`/api/label-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) {
        const body = (await res.json()) as ApiResult<null>;
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    });
  }

  static getDefaults(): Promise<LabelTemplateDefaults> {
    return fetch('/api/label-templates/defaults', { credentials: 'include' }).then((res) =>
      parseJson(res),
    );
  }

  static saveDefaults(matrix: LabelTemplateDefaults): Promise<LabelTemplateDefaults> {
    return fetch('/api/label-templates/defaults', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matrix),
    }).then((res) => parseJson(res));
  }

  static getPreviewInputs(input: {
    goodId: string;
    batchId: string;
    batchNumber: string;
    expiration?: string | null;
    labelKind?: 'portion' | 'box';
  }): Promise<LabelTemplatePreviewInputsDto> {
    const url = new URL('/api/label-templates/preview-inputs', window.location.origin);
    url.searchParams.set('goodId', input.goodId);
    url.searchParams.set('batchId', input.batchId);
    url.searchParams.set('batchNumber', input.batchNumber);
    if (input.labelKind) url.searchParams.set('labelKind', input.labelKind);
    if (input.expiration) url.searchParams.set('expiration', input.expiration);
    return fetch(url.toString(), { credentials: 'include' }).then((res) => parseJson(res));
  }
}
