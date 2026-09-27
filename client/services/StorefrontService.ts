import type {
  StorefrontMetaKeyConfig,
  StorefrontPresetDto,
  StorefrontPresetInput,
  StorefrontPreviewResult,
  StorefrontSettingsDto,
} from '@shared/types/storefront';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.data as T;
}

export const storefrontApi = {
  async listPresets(): Promise<StorefrontPresetDto[]> {
    const res = await fetch('/api/storefront/presets', { credentials: 'include' });
    return parseJson(res);
  },

  async createPreset(input: StorefrontPresetInput): Promise<StorefrontPresetDto> {
    const res = await fetch('/api/storefront/presets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async updatePreset(id: string, input: Partial<StorefrontPresetInput>): Promise<StorefrontPresetDto> {
    const res = await fetch(`/api/storefront/presets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async deletePreset(id: string): Promise<void> {
    const res = await fetch(`/api/storefront/presets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await parseJson(res);
  },

  async getSettings(): Promise<StorefrontSettingsDto> {
    const res = await fetch('/api/storefront/settings', { credentials: 'include' });
    return parseJson(res);
  },

  async updateSettings(input: {
    defaultPresetId?: string | null;
    metaKeys?: StorefrontMetaKeyConfig[];
  }): Promise<StorefrontSettingsDto> {
    const res = await fetch('/api/storefront/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async preview(goodId: string): Promise<StorefrontPreviewResult> {
    const res = await fetch('/api/storefront/preview', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodId }),
    });
    return parseJson(res);
  },
};
