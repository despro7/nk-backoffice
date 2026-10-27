import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

export const MOVEMENT_MOB_ALTERNATE_INTERFACE_TOOLTIP =
  'Документ створено в інтерфейсі Переміщення v2';
export const MOVEMENT_MOB_SCAN_INTERFACE_TOOLTIP =
  'Переміщення створено в інтерфейсі мобільного сканування (ШК)';
export const MOVEMENT_MOB_ALTERNATE_INTERFACE_BANNER_TEXT =
  'Документ створено в інтерфейсі переміщення v2 (десктоп), не через мобільне сканування. Штрих-коди та привʼязка партії до ШК можуть відображатися інакше, ніж у Dilovod.';

export function MovementMobAlternateInterfaceBadge() {
  return (
    <Tooltip content={MOVEMENT_MOB_ALTERNATE_INTERFACE_TOOLTIP} placement="top" delay={200} classNames={{
      content: 'bg-warning-700 text-white shadow-none rounded-sm text-xs ',
    }}>
      <span
        className="inline-flex items-center justify-center rounded text-warning-700 shrink-0 cursor-help"
        aria-label="Створено в іншому інтерфейсі"
      >
        <DynamicIcon name="monitor-smartphone" size={14} strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
}

export function MovementMobScanInterfaceBadge({
  stopAccordionToggle = false,
}: {
  stopAccordionToggle?: boolean;
}) {
  return (
    <Tooltip
      content={MOVEMENT_MOB_SCAN_INTERFACE_TOOLTIP}
      placement="top"
      delay={200}
      classNames={{
        content: 'bg-primary-700 text-white shadow-none rounded-sm text-xs max-w-[240px] py-1.5 text-center',
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded text-primary-600 shrink-0 cursor-help"
        aria-label={MOVEMENT_MOB_SCAN_INTERFACE_TOOLTIP}
        onMouseDown={stopAccordionToggle ? (event) => event.stopPropagation() : undefined}
        onClick={stopAccordionToggle ? (event) => event.stopPropagation() : undefined}
        onKeyDown={stopAccordionToggle ? (event) => event.stopPropagation() : undefined}
      >
        <DynamicIcon name="scan-barcode" size={14} strokeWidth={1.75} />
      </span>
    </Tooltip>
  );
}

export function MovementMobAlternateInterfaceBanner() {
  return (
    <div
      className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2.5 text-sm text-warning-900 flex items-start gap-2"
      role="status"
    >
      <DynamicIcon name="monitor-smartphone" size={18} strokeWidth={1.75} className="shrink-0 mt-0.5 text-warning-700" />
      <p className="leading-snug">{MOVEMENT_MOB_ALTERNATE_INTERFACE_BANNER_TEXT}</p>
    </div>
  );
}
