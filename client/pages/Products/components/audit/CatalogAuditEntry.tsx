import { useProductionSettings } from '@/hooks/useProductionSettings';
import { useMemo } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SpecChip } from '@/components/SpecChip';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';
import type { AuditSource } from '@shared/constants/auditEntities';
import { CATALOG_AUDIT_ACTIONS, type CatalogGoodAuditLogDto } from '@shared/types/catalogAudit';
import {
  buildCatalogAuditLines,
  formatCatalogAuditAction,
  formatCatalogAuditSource,
  type CatalogAuditDictionaries,
  type CatalogAuditLine,
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

type ActionIcon = { icon: string; className: string };

const TONE = {
  blue: 'bg-blue-100 text-blue-600',
  red: 'bg-rose-100 text-rose-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  green: 'bg-emerald-100 text-emerald-600',
  violet: 'bg-violet-100 text-violet-600',
  sky: 'bg-sky-100 text-sky-600',
  neutral: 'bg-default-200 text-default-600',
} as const;

const DEFAULT_ACTION_ICON: ActionIcon = { icon: 'pencil', className: TONE.blue };

/** Іконка та тон кружка дії в журналі: редагування синє, видалення червоне, чернетка жовта. */
const ACTION_ICON: Record<string, ActionIcon> = {
  [CATALOG_AUDIT_ACTIONS.CREATED]: { icon: 'circle-plus', className: TONE.green },
  [CATALOG_AUDIT_ACTIONS.DUPLICATED]: { icon: 'copy', className: TONE.green },
  [CATALOG_AUDIT_ACTIONS.UPDATED]: DEFAULT_ACTION_ICON,
  [CATALOG_AUDIT_ACTIONS.MOVED]: { icon: 'folder-input', className: TONE.blue },
  [CATALOG_AUDIT_ACTIONS.TYPE_CHANGED]: { icon: 'shapes', className: TONE.blue },
  [CATALOG_AUDIT_ACTIONS.ARCHIVED]: { icon: 'archive', className: TONE.neutral },
  [CATALOG_AUDIT_ACTIONS.RESTORED]: { icon: 'archive-restore', className: TONE.green },
  [CATALOG_AUDIT_ACTIONS.TRASHED]: { icon: 'trash-2', className: TONE.red },
  [CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED]: { icon: 'image', className: TONE.sky },
  [CATALOG_AUDIT_ACTIONS.LABEL_TEMPLATE_CHANGED]: { icon: 'tag', className: TONE.sky },
  [CATALOG_AUDIT_ACTIONS.LABEL_PUBLISHED]: { icon: 'printer', className: TONE.sky },
  [CATALOG_AUDIT_ACTIONS.STOREFRONT_PULL]: { icon: 'globe', className: TONE.sky },
  [CATALOG_AUDIT_ACTIONS.DILOVOD_PULL]: { icon: 'download', className: TONE.violet },
  [CATALOG_AUDIT_ACTIONS.DILOVOD_SYNC]: { icon: 'refresh-cw', className: TONE.violet },
  [CATALOG_AUDIT_ACTIONS.LEGACY_FIELD_CHANGED]: DEFAULT_ACTION_ICON,
  [CATALOG_AUDIT_ACTIONS.SPEC_DRAFT_SAVED]: { icon: 'file-clock', className: TONE.yellow },
  [CATALOG_AUDIT_ACTIONS.SPEC_DRAFT_DISCARDED]: { icon: 'file-minus', className: TONE.red },
  [CATALOG_AUDIT_ACTIONS.SPEC_APPROVED]: { icon: 'file-check-2', className: TONE.green },
  [CATALOG_AUDIT_ACTIONS.SPEC_REJECTED]: { icon: 'file-x', className: TONE.red },
  [CATALOG_AUDIT_ACTIONS.SPEC_VERSION_RECORDED]: { icon: 'file-text', className: TONE.violet },
};

function formatWhen(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  item: CatalogGoodAuditLogDto;
  dictionaries?: CatalogAuditDictionaries;
  /** Показувати назву товару (загальний журнал). */
  showGood?: boolean;
  onGoodClick?: (goodId: string) => void;
}

/** Запис журналу змін товару: іконка дії, хто і коли, сітка змін «поле | значення». */
export function CatalogAuditEntry({ item, dictionaries, showGood = false, onGoodClick }: Props) {
  const { settings: productionSettings } = useProductionSettings();
  const lines = useMemo(
    () => buildCatalogAuditLines(item.payload, { ...dictionaries, lossTypes: productionSettings.lossTypes }),
    [item.payload, dictionaries, productionSettings.lossTypes]
  );
  const hue = SOURCE_HUE[item.source];
  const goodName = item.payload?.goodName || item.entityId;
  const goodSku = item.payload?.goodSku;
  const actionIcon = ACTION_ICON[item.action] ?? DEFAULT_ACTION_ICON;
  const who = item.userName?.trim() || (item.source === 'dilovod' ? 'Dilovod' : 'Система');

  return (
    <div className="flex gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${actionIcon.className}`}>
        <DynamicIcon name={actionIcon.icon as 'pencil'} size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showGood ? (
              <>
                <button
                  type="button"
                  className="text-left text-sm font-semibold text-default-900 hover:underline disabled:no-underline"
                  disabled={!onGoodClick}
                  onClick={() => onGoodClick?.(item.entityId)}
                >
                  {goodName}
                  {goodSku ? <span className="font-mono font-normal text-default-500"> · {goodSku}</span> : null}
                </button>
                <p className="mt-0.5 text-xs font-medium text-default-600">{formatCatalogAuditAction(item.action)}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-default-900">{formatCatalogAuditAction(item.action)}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <time className="block whitespace-nowrap text-xs text-default-400" dateTime={item.createdAt}>
              {formatWhen(item.createdAt)}
            </time>
            <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-default-500">
              {hue ? (
                <SpecChip tokens={getSpecColorByHue(hue)} rounded="sm">
                  {formatCatalogAuditSource(item.source)}
                </SpecChip>
              ) : null}
              <span>{who}</span>
            </div>
          </div>
        </div>
        {lines.length > 0 ? (
          <div className="mt-2 rounded-lg bg-default-50 px-3 py-2">
            <CatalogAuditChangesGrid lines={lines} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Зміни запису сіткою: позначка, поле, значення. */
function CatalogAuditChangesGrid({ lines }: { lines: CatalogAuditLine[] }) {
  return (
    <dl className="grid grid-cols-[0.75rem_minmax(6rem,max-content)_1fr] gap-x-3 gap-y-1 text-sm">
      {lines.map((line, index) => {
        const mark = LINE_MARK[line.kind];
        return (
          <div key={index} className="contents">
            <span className={`font-mono ${mark.className}`}>{mark.sign}</span>
            <dt className="text-default-500">{line.label}</dt>
            <dd className="min-w-0 break-words text-default-800">{line.text}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Рядки змін (+ − ~ ·) у компактному вигляді: порівняння версій специфікації. */
export function CatalogAuditLineList({ lines }: { lines: CatalogAuditLine[] }) {
  return (
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
  );
}
