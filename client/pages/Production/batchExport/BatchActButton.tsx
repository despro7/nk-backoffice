import { useState } from 'react';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useProductionSettings } from '@/hooks/useProductionSettings';
import { ToastService } from '@/services/ToastService';
import type { ProductionBatchDetailDto } from '@shared/types/production';

/** «Акт PDF»: завантажити або надрукувати акт варки в будь-якому стані. */
export function BatchActButton({ batch }: { batch: ProductionBatchDetailDto }) {
  const { settings } = useProductionSettings();
  const [busy, setBusy] = useState(false);

  const handle = async (mode: 'download' | 'print') => {
    setBusy(true);
    try {
      const { exportBatchActPdf, printBatchActPdf } = await import('./batchActPdfExport');
      const lossTypes = settings.lossTypes;
      if (mode === 'download') await exportBatchActPdf(batch, lossTypes);
      else await printBatchActPdf(batch, lossTypes);
    } catch (err) {
      ToastService.show({
        title: mode === 'download' ? 'Помилка збереження' : 'Помилка друку',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
          variant="flat"
          isDisabled={busy}
          startContent={<DynamicIcon name={busy ? 'loader-2' : 'file-text'} size={16} className={busy ? 'animate-spin' : ''} />}
        >
          Акт PDF
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Акт варки"
        onAction={(key) => {
          if (key === 'download' || key === 'print') void handle(key);
        }}
      >
        <DropdownItem key="download" startContent={<DynamicIcon name="file-down" size={14} />}>
          Завантажити
        </DropdownItem>
        <DropdownItem key="print" startContent={<DynamicIcon name="printer" size={14} />}>
          Друк
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
