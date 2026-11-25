import { useCallback, useState } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import MovementMobProductEditDrawer from '@/pages/Warehouse/WarehouseMovementMob/components/MovementMobProductEditDrawer';
import { ToastService } from '@/services/ToastService';
import { findKitDuplicateComponents, kitReleaseDuplicateMessage } from '@shared/utils/catalogKitDuplicates';

/** Перше дубльоване повідомлення за складом набору (для alert та блокування відправки). */
export function getKitReleaseDuplicateMessage(setName: string, componentsSnapshot: unknown): string | null {
  if (!Array.isArray(componentsSnapshot)) return null;
  const dups = findKitDuplicateComponents(
    componentsSnapshot.filter(Boolean).map((c: any) => ({
      sku: String(c.id ?? c.sku ?? c.code ?? '').trim(),
      name: c.name ?? c.title ?? null,
    }))
  );
  return dups.length > 0 ? kitReleaseDuplicateMessage(setName, dups[0]) : null;
}

interface Props {
  message: string;
  setSku: string;
}

export default function ReleaseKitDuplicateAlert({ message, setSku }: Props) {
  const [goodId, setGoodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openCard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/search?${new URLSearchParams({ q: setSku }).toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();
      const hit = (json?.data ?? []).find((r: { sku?: string | null; isGroup?: boolean }) => !r.isGroup && r.sku === setSku);
      if (!hit) throw new Error('Картку товару не знайдено');
      setGoodId(hit.id);
    } catch (e) {
      ToastService.show({
        title: 'Не вдалося відкрити картку товару',
        description: e instanceof Error ? e.message : undefined,
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [setSku]);

  return (
    <>
      <div
        role="alert"
        className="mb-4 flex flex-col gap-2 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-2 text-sm text-danger-700">
          <DynamicIcon name="alert-triangle" size={16} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
        <Button
          size="sm"
          variant="flat"
          color="danger"
          className="shrink-0"
          isDisabled={loading}
          startContent={<DynamicIcon name={loading ? 'loader-2' : 'external-link'} size={14} className={loading ? 'animate-spin' : undefined} />}
          onPress={() => void openCard()}
        >
          Відкрити картку товару
        </Button>
      </div>
      <MovementMobProductEditDrawer catalogGoodId={goodId} open={Boolean(goodId)} onClose={() => setGoodId(null)} />
    </>
  );
}
