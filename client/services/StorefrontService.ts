import type {
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
  StorefrontPresetDto,
  StorefrontPresetInput,
  StorefrontPreviewResult,
  StorefrontSettingsDto,
  StorefrontWooSettingsInput,
  WooConnectionTestResult,
  WooInspectResult,
  WooMediaUploadResult,
  WooOrphanAuditResult,
  WooPullApplyInput,
  WooPullApplyResult,
  WooPullPreviewResult,
  WooPushApplyResult,
  WooPushBulkResult,
  WooPushPreviewResult,
} from '@shared/types/storefront';

/** Fired after storefront preset/settings are saved in SettingsStorefront. */
export const STOREFRONT_SETTINGS_UPDATED_EVENT = 'storefront-settings-updated';

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
    kitComponentSettings?: StorefrontKitComponentSettings;
    wooCommerce?: StorefrontWooSettingsInput;
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

  async testWooConnection(input?: {
    siteUrl?: string;
    consumerKey?: string;
    consumerSecret?: string;
  }): Promise<WooConnectionTestResult> {
    const res = await fetch('/api/storefront/woo/test-connection', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {}),
    });
    return parseJson(res);
  },

  async inspectWooProduct(sku: string): Promise<WooInspectResult> {
    const res = await fetch('/api/storefront/woo/inspect', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku }),
    });
    return parseJson(res);
  },

  async pullPreview(goodId: string): Promise<WooPullPreviewResult> {
    const res = await fetch('/api/storefront/woo/pull-preview', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodId }),
    });
    return parseJson(res);
  },

  async pullApply(input: WooPullApplyInput): Promise<WooPullApplyResult> {
    const res = await fetch('/api/storefront/woo/pull-apply', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return parseJson(res);
  },

  async pushPreview(goodId: string): Promise<WooPushPreviewResult> {
    const res = await fetch('/api/storefront/woo/push-preview', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodId }),
    });
    return parseJson(res);
  },

  async pushApply(goodId: string): Promise<WooPushApplyResult> {
    const res = await fetch('/api/storefront/woo/push-apply', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodId }),
    });
    return parseJson(res);
  },

  async pushBulk(goodIds: string[]): Promise<WooPushBulkResult> {
    const res = await fetch('/api/storefront/woo/push-bulk', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodIds }),
    });
    return parseJson(res);
  },

  async uploadWooMedia(goodId: string): Promise<WooMediaUploadResult> {
    const res = await fetch('/api/storefront/woo/media/upload', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goodId }),
    });
    return parseJson(res);
  },

  async auditWooOrphans(): Promise<WooOrphanAuditResult> {
    const res = await fetch('/api/storefront/woo/media/orphans', { credentials: 'include' });
    return parseJson(res);
  },

  async deleteWooOrphans(wooMediaIds: number[]): Promise<{ deleted: number; errors: string[] }> {
    const res = await fetch('/api/storefront/woo/media/orphans/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wooMediaIds }),
    });
    return parseJson(res);
  },
};
