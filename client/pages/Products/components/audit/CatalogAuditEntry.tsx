import { useMemo } from 'react';
import { AuditLogRow } from '@/components/audit/AuditLogRow';
import { SpecChip } from '@/components/SpecChip';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import type { AuditSource } from '@shared/constants/auditEntities';
import type { CatalogGoodAuditLogDto } from '@shared/types/catalogAudit';
import {
  buildCatalogAuditLines,
  formatCatalogAuditAction,
  formatCatalogAuditHeader,
  formatCatalogAuditSource,
  type CatalogAuditDictionaries,
  type CatalogAuditLineKind,
} from '@shared/utils/catalogGoodAuditFormat';

const SOURCE_HUE: Record<AuditSource, string | null> = {
  ui: null,
  dilovod: 'violet',
  system: 'slate',
  bulk: 'amber',
};

const LINE_MARK: Record<CatalogAuditLineKind, { sign: string; className: string }> = {
  changed: { sign: '~', className: 'text-default-500' },
  added: { sign: '+', className: 'text-emerald-600' },
  removed: { sign: '−', className: 'text-rose-600' },
  info: { sign: '·', className: 'text-default-400' },
};

interface Props {
  item: CatalogGoodAuditLogDto;
  dictionaries?: CatalogAuditDictionaries;
  /** Показувати назву товару (загальний журнал). */
  showGood?: boolean;
  onGoodClick?: (goodId: string) => void;
}

export function CatalogAuditEntry({ item, dictionaries, showGood = false, onGoodClick }: Props) {
  const lines = useMemo(() => buildCatalogAuditLines(item.payload, dictionaries), [item.payload, dictionaries]);
  const hue = SOURCE_HUE[item.source];
  const goodName = item.payload?.goodName || item.entityId;
  const goodSku = item.payload?.goodSku;

  return (
    <AuditLogRow
      header={formatCatalogAuditHeader(item.createdAt, item.userName, item.source)}
      action={
        <>
          {showGood ? (
            <>
              <button
                type="button"
                className="text-default-900 hover:underline disabled:no-underline"
                disabled={!onGoodClick}
                onClick={() => onGoodClick?.(item.entityId)}
              >
                {goodName}
                {goodSku ? <span className="font-mono text-default-500"> · {goodSku}</span> : null}
              </button>
              <span className="text-default-400"> — </span>
            </>
          ) : null}
          {formatCatalogAuditAction(item.action)}
        </>
      }
      badge={
        hue ? (
          <SpecChip tokens={getSpecColorByHue(hue)} rounded="sm">
            {formatCatalogAuditSource(item.source)}
          </SpecChip>
        ) : null
      }
      details={
        lines.length > 0 ? (
          <ul className="space-y-0.5">
            {lines.map((line, index) => {
              const mark = LINE_MARK[line.kind];
              return (
                <li key={index} className="flex gap-1.5 whitespace-normal">
                  <span className={`w-2 shrink-0 font-mono ${mark.className}`}>{mark.sign}</span>
                  <span>
                    <span className="text-default-500">{line.label}:</span> {line.text}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null
      }
    />
  );
}
