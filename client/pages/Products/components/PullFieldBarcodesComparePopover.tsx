import { useMemo, useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import type { CatalogDilovodBarcodePreviewLine } from '@shared/types/catalog';
import {
  catalogBarcodePreviewKey,
  catalogBarcodePreviewOnlyIn,
  formatCatalogBarcodePreviewLine,
} from '@shared/utils/catalogBarcodePreviewFormat';
import { BarcodeKindIcon } from './BarcodeKindIcon';

interface PullFieldBarcodesComparePopoverProps {
  localLines: CatalogDilovodBarcodePreviewLine[];
  dilovodLines: CatalogDilovodBarcodePreviewLine[];
  positionLabel: string;
  children: ReactNode;
}

function BarcodePreviewColumn({
  title,
  lines,
  onlyHereKeys,
}: {
  title: string;
  lines: CatalogDilovodBarcodePreviewLine[];
  onlyHereKeys: Set<string>;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-default-400">{title}</p>
      {lines.length === 0 ? (
        <p className="text-xs text-default-400">—</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-default-700 scrollbar-thin-transparent">
          {lines.map((line, idx) => {
            const label = formatCatalogBarcodePreviewLine(line);
            const key = `${line.code}|${line.goodPart ?? ''}|${idx}`;
            const highlight = onlyHereKeys.has(catalogBarcodePreviewKey(line));
            return (
              <li
                key={key}
                className={`flex items-start gap-1.5 rounded px-1.5 py-1 font-mono text-[11px] leading-snug ${
                  highlight ? 'bg-warning-100 text-warning-900' : 'bg-default-100/80 text-default-700'
                }`}
              >
                <BarcodeKindIcon
                  kind={line.barcodeKind === 'box' ? 'box' : 'portion'}
                  size={13}
                />
                <span className="min-w-0 break-all">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PullFieldBarcodesComparePopover({
  localLines,
  dilovodLines,
  positionLabel,
  children,
}: PullFieldBarcodesComparePopoverProps) {
  const [open, setOpen] = useState(false);
  const onlyLocal = useMemo(
    () => catalogBarcodePreviewOnlyIn(localLines, dilovodLines),
    [localLines, dilovodLines],
  );
  const onlyDilovod = useMemo(
    () => catalogBarcodePreviewOnlyIn(dilovodLines, localLines),
    [localLines, dilovodLines],
  );

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="top"
      showArrow
      offset={8}
      shouldBlockScroll={false}
      classNames={{ base: 'z-[10050]' }}
    >
      <PopoverTrigger>
        <span
          className="inline text-left"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-lg border border-default-200 px-3 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[min(22rem,60vh)] min-w-[min(22rem,88vw)] flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-default-700">Штрихкоди і партії</span>
            <span className="text-[11px] text-default-400">{positionLabel}</span>
          </div>
          <div className="flex gap-3 border-t border-default-200/80 pt-2">
            <BarcodePreviewColumn title="Backoffice" lines={localLines} onlyHereKeys={onlyLocal} />
            <BarcodePreviewColumn title="Діловод" lines={dilovodLines} onlyHereKeys={onlyDilovod} />
          </div>
          {(onlyLocal.size > 0 || onlyDilovod.size > 0) && (
            <p className="text-[10px] text-default-500">
              Жовтим – позиції, яких немає в іншому джерелі
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
