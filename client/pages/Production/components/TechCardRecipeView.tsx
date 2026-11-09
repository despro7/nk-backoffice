import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { TechCardDetailDto, TechCardPayload } from '@shared/types/production';
import { techCardCoverage } from '@shared/utils/techCardPayload';
import {
  fractionKg,
  formatGrams,
  formatMinutes,
  packagingPortionKg,
  stageOutputsKg,
  type SpecRowOption,
} from './techCardRecipe';

const TABLE_CLASS_NAMES = {
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2 align-top',
};

export const PACKAGING_BASIS_LABELS = { portion: 'на порцію', box: 'на коробку' } as const;

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-default-500">{children}</p>;
}

/** Попередження: нерозподілені рядки і посилання на рядки, яких уже немає в специфікації. */
export function TechCardCoverageNotice({ payload, rows }: { payload: TechCardPayload; rows: SpecRowOption[] }) {
  const coverage = techCardCoverage(payload, rows.map((r) => r.rowKey));
  const nameByKey = new Map(rows.map((r) => [r.rowKey, r.name]));
  if (coverage.unassignedRowKeys.length === 0 && coverage.missingRefs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
      {coverage.unassignedRowKeys.length > 0 && (
        <p className="flex gap-1.5">
          <DynamicIcon name="triangle-alert" size={14} className="mt-px shrink-0" />
          <span>
            Не розподілено по етапах: {coverage.unassignedRowKeys.map((k) => nameByKey.get(k) ?? k).join(', ')}.
          </span>
        </p>
      )}
      {coverage.missingRefs.length > 0 && (
        <p className="flex gap-1.5">
          <DynamicIcon name="unlink" size={14} className="mt-px shrink-0" />
          <span>
            Рядків уже немає в специфікації:{' '}
            {[...new Set(coverage.missingRefs.map((r) => `${r.owner === 'stage' ? 'етап' : 'фракція'} «${r.name || 'без назви'}»`))].join(', ')}.
            Відкрийте редагування, щоб прибрати посилання.
          </span>
        </p>
      )}
    </div>
  );
}

export function TechCardStagesView({ payload, rows }: { payload: TechCardPayload; rows: SpecRowOption[] }) {
  if (payload.stages.length === 0) return <Empty>Етапи ще не описано.</Empty>;
  const nameByKey = new Map(rows.map((r) => [r.rowKey, r.name]));
  const stageOut = stageOutputsKg(payload, rows);
  const stageName = new Map(payload.stages.map((st, idx) => [st.key, `${idx + 1}. ${st.name}`]));

  return (
    <ol className="flex flex-col gap-3">
      {payload.stages.map((stage, idx) => {
        const facts = [
          stage.offsetMin != null && stage.offsetMin > 0 ? `старт +${formatMinutes(stage.offsetMin)}` : null,
          stage.durationMin != null && stage.durationMin > 0 ? formatMinutes(stage.durationMin) : null,
          stage.equipment,
          stage.mode,
        ].filter(Boolean);
        const inputs = [
          ...stage.inputStageKeys.map((k) => stageName.get(k) ?? k),
          ...stage.inputRowKeys.map((k) => nameByKey.get(k) ?? 'рядок відсутній'),
        ];
        return (
          <li key={stage.key} className="rounded-lg border border-default-200 p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold text-default-900">
                {idx + 1}. {stage.name}
              </span>
              {facts.length > 0 && <span className="text-xs text-default-500">{facts.join(' · ')}</span>}
            </div>
            {inputs.length > 0 && (
              <p className="mt-1 text-sm text-default-600">
                <span className="text-default-400">Входи: </span>
                {inputs.join(', ')}
              </p>
            )}
            {(stage.outputName || stage.yieldPercent != null) && (
              <p className="mt-1 text-sm text-default-600">
                <span className="text-default-400">Вихід: </span>
                {[
                  stage.outputName,
                  stage.yieldPercent != null ? `${stage.yieldPercent}%` : null,
                  stageOut.get(stage.key) != null ? `${formatGrams(stageOut.get(stage.key) ?? null)} на порцію` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {stage.description && (
              <div
                className="mt-2 text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1"
                // HTML з власного TipTap-редактора техкарти
                dangerouslySetInnerHTML={{ __html: stage.description }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function TechCardPackagingView({
  payload,
  goodNames,
}: {
  payload: TechCardPayload;
  goodNames: TechCardDetailDto['goodNames'];
}) {
  return (
    <div className="flex flex-col gap-2">
      {payload.packaging.length === 0 ? (
        <Empty>Пакування ще не задано.</Empty>
      ) : (
        <Table aria-label="Пакування" removeWrapper classNames={TABLE_CLASS_NAMES}>
          <TableHeader>
            <TableColumn>Матеріал</TableColumn>
            <TableColumn className="text-right">Кількість</TableColumn>
            <TableColumn>База</TableColumn>
            <TableColumn>Примітка</TableColumn>
          </TableHeader>
          <TableBody>
            {payload.packaging.map((row, idx) => (
              <TableRow key={`${row.goodId}-${idx}`}>
                <TableCell>{goodNames[row.goodId]?.name ?? row.goodId}</TableCell>
                <TableCell className="text-right tabular-nums">{row.qty.toLocaleString('uk-UA')}</TableCell>
                <TableCell>{PACKAGING_BASIS_LABELS[row.basis]}</TableCell>
                <TableCell className="text-default-500">{row.note || '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function TechCardDosingView({
  payload,
  rows,
  goodNames,
}: {
  payload: TechCardPayload;
  rows: SpecRowOption[];
  goodNames?: TechCardDetailDto['goodNames'];
}) {
  if (payload.dosing.length === 0) return <Empty>Фракції дозування ще не задано.</Empty>;
  const nameByKey = new Map(rows.map((r) => [r.rowKey, r.name]));
  const stageOut = stageOutputsKg(payload, rows);
  const stageName = new Map(payload.stages.map((st, idx) => [st.key, `${idx + 1}. ${st.name}`]));
  const masses = payload.dosing.map((d) => fractionKg(d, rows, stageOut));
  const total = masses.every((m) => m != null) ? masses.reduce<number>((sum, m) => sum + (m ?? 0), 0) : null;
  const pack = packagingPortionKg(payload, goodNames ?? {});

  return (
    <Table aria-label="Дозування" removeWrapper classNames={TABLE_CLASS_NAMES}>
      <TableHeader>
        <TableColumn>Фракція</TableColumn>
        <TableColumn>Склад</TableColumn>
        <TableColumn className="text-right">На порцію</TableColumn>
      </TableHeader>
      <TableBody>
        {[
          ...payload.dosing.map((d, idx) => (
            <TableRow key={d.key}>
              <TableCell className="font-medium">{d.name || '–'}</TableCell>
              <TableCell className="text-default-600">
                {[...d.stageKeys.map((k) => stageName.get(k) ?? k), ...d.rowKeys.map((k) => nameByKey.get(k) ?? 'рядок відсутній')].join(', ') || '–'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatGrams(masses[idx])}</TableCell>
            </TableRow>
          )),
          <TableRow key="total" className="bg-default-100">
            <TableCell className="font-semibold">Разом</TableCell>
            <TableCell>{''}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{formatGrams(total)}</TableCell>
          </TableRow>,
          ...(pack.kg > 0
            ? [
                <TableRow key="with-pack">
                  <TableCell className="font-semibold">З пакуванням</TableCell>
                  <TableCell className="text-default-500">+ {pack.counted.join(', ')}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatGrams(total != null ? total + pack.kg : null)}
                  </TableCell>
                </TableRow>,
              ]
            : []),
        ]}
      </TableBody>
    </Table>
  );
}
