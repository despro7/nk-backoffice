import { useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Input, Select, SelectItem, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { storefrontApi } from '@/services/StorefrontService';
import {
  CATALOG_IMAGE_SETTINGS_DEFAULTS,
  type CatalogImageFormat,
  type CatalogImageOptimizationSettings,
} from '@shared/types/catalogImageSettings';

const FORMAT_LABELS: Record<CatalogImageFormat, string> = {
  webp: 'WebP (рекомендовано)',
  jpeg: 'JPEG',
  original: 'Зберігати оригінальний формат',
};

export function CatalogImageSettingsCard({ canManage }: { canManage: boolean }) {
  const [saved, setSaved] = useState<CatalogImageOptimizationSettings>(CATALOG_IMAGE_SETTINGS_DEFAULTS);
  const [form, setForm] = useState<CatalogImageOptimizationSettings>(CATALOG_IMAGE_SETTINGS_DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storefrontApi
      .getMediaSettings()
      .then((data) => {
        if (cancelled) return;
        setSaved(data);
        setForm(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = JSON.stringify(saved) !== JSON.stringify(form);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await storefrontApi.updateMediaSettings(form);
      setSaved(data);
      setForm(data);
      ToastService.show({ title: 'Налаштування зображень збережено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canManage || saving;

  return (
    <Card className="w-full">
      <CardHeader className="border-b border-gray-200 flex items-center gap-2">
        <DynamicIcon name="image" size={18} className="text-gray-600" />
        <h2 className="text-base font-semibold text-gray-900">Зображення товарів</h2>
      </CardHeader>
      <CardBody className="p-6 space-y-4">
        <Switch
          isSelected={form.enabled}
          onValueChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
          isDisabled={disabled}
        >
          Стискати при завантаженні
        </Switch>
        <p className="text-xs text-default-500">
          Завантажувати можна файли до 30 МБ. Після збереження зображення зменшується і конвертується за
          налаштуваннями нижче (анімовані GIF не змінюються).
        </p>
        <Select
          label="Формат"
          labelPlacement="outside"
          selectedKeys={[form.format]}
          onChange={(e) => {
            const format = e.target.value as CatalogImageFormat;
            if (format) setForm((f) => ({ ...f, format }));
          }}
          isDisabled={disabled || !form.enabled}
        >
          {(Object.keys(FORMAT_LABELS) as CatalogImageFormat[]).map((key) => (
            <SelectItem key={key}>{FORMAT_LABELS[key]}</SelectItem>
          ))}
        </Select>
        <Input
          type="number"
          label="Макс. розмір довшої сторони, px"
          labelPlacement="outside"
          min={400}
          max={8000}
          value={String(form.maxDimension)}
          onValueChange={(v) => setForm((f) => ({ ...f, maxDimension: Number(v) || 0 }))}
          isDisabled={disabled || !form.enabled}
        />
        <Input
          type="number"
          label="Якість (40-100)"
          labelPlacement="outside"
          min={40}
          max={100}
          value={String(form.quality)}
          onValueChange={(v) => setForm((f) => ({ ...f, quality: Number(v) || 0 }))}
          isDisabled={disabled || !form.enabled}
        />
        {canManage && (
          <Button color="primary" isLoading={saving} isDisabled={!dirty} onPress={() => void handleSave()}>
            Зберегти
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
