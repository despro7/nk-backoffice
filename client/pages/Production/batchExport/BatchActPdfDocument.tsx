import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  PRODUCTION_BATCH_STATUS_LABELS,
  type ProductionBatchDetailDto,
  type ProductionBatchLineDto,
  type ProductionBatchSignatureDto,
  type ProductionLossType,
} from '@shared/types/production';
import { issuePlan } from '@shared/utils/productionBatchIssue';
import {
  consumptionDeviationPct,
  deviationPct,
  factTotalPortions,
  isDeviationNotable,
  PORTIONS_DEVIATION_PCT,
} from '@shared/utils/productionBatchOutput';

const GRAY = '#6b7280';
const BORDER = '#e5e7eb';
const WARN = '#b45309';

const styles = StyleSheet.create({
  page: { fontFamily: 'Arial', fontSize: 9, paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, color: '#111827' },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: GRAY, marginBottom: 2 },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 4 },
  headerRow: { backgroundColor: '#f3f4f6', borderTopWidth: 1, borderTopColor: BORDER },
  cell: { paddingHorizontal: 6 },
  right: { textAlign: 'right' },
  headerText: { fontWeight: 700, fontSize: 8, color: '#4b5563' },
  sub: { fontSize: 7.5, color: GRAY, marginTop: 1 },
  warn: { color: WARN, fontWeight: 700 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '25%', marginBottom: 5 },
  gridLabel: { fontSize: 8, color: GRAY },
  gridValue: { fontSize: 10, fontWeight: 700 },
  comment: { fontSize: 9, marginTop: 4, lineHeight: 1.35 },
  signRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 7, alignItems: 'flex-end' },
  signStep: { width: '28%', paddingRight: 6 },
  signName: { width: '36%', paddingRight: 6 },
  signTime: { width: '18%', paddingRight: 6 },
  signBlank: { width: '18%' },
  blankLine: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', height: 12 },
  blankHint: { fontSize: 7, color: GRAY, marginTop: 1 },
  pageNumber: { position: 'absolute', bottom: 16, right: 28, fontSize: 8, color: GRAY },
});

/** Ширини колонок таблиці сировини (альбомна A4). */
const RAW = {
  idx: '3%',
  name: '23%',
  net: '8%',
  plan: '9%',
  issued: '9%',
  leftover: '8%',
  consumed: '9%',
  dev: '7%',
  action: '12%',
  note: '12%',
};
const PACK = { idx: '3%', name: '37%', plan: '11%', issued: '11%', leftover: '11%', consumed: '11%', action: '16%' };
const STAGE = { idx: '3%', name: '25%', plan: '14%', start: '14%', finish: '14%', temp: '8%', comment: '22%' };

const SIGN_STEPS: Array<{ step: string; label: string }> = [
  { step: 'issued', label: 'Сировину видав' },
  { step: 'accepted', label: 'Прийняв на виробництво' },
  { step: 'output', label: 'Факт виходу підтвердив' },
  { step: 'finished', label: 'Прийняв на склад ГП' },
];

const LEFTOVER_LABELS: Record<string, string> = { keep_vp: 'Лишити на ВП', return_sp: 'Повернути на СП' };

function qty(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return value.toLocaleString('uk-UA', { maximumFractionDigits: digits });
}

function withUnit(value: number | null | undefined, unit: string): string {
  const text = qty(value);
  return text === '–' || !unit ? text : `${text}\u00A0${unit}`;
}

function dateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dateOnly(value: string): string {
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}.${m}.${y}` : value;
}

function hm(minutes: number | null): string {
  if (minutes == null) return '–';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function pct(value: number | null): string {
  if (value == null) return '–';
  const abs = Math.abs(value).toLocaleString('uk-UA', { maximumFractionDigits: 1 });
  return `${value > 0 ? '+' : value < 0 ? '\u2212' : ''}${abs}%`;
}

function lossesText(line: ProductionBatchLineDto, lossTypes: ProductionLossType[]): string | null {
  if (!line.losses?.length) return null;
  return line.losses
    .filter((l) => l.percent > 0)
    .map((l) => `${lossTypes.find((t) => t.id === l.typeId)?.name ?? 'Втрати'} ${qty(l.percent, 1)}%`)
    .join(' · ');
}

function HeaderCell({ width, children, right }: { width: string; children: string; right?: boolean }) {
  return (
    <View style={[styles.cell, { width }]}>
      <Text style={right ? [styles.headerText, styles.right] : styles.headerText}>{children}</Text>
    </View>
  );
}

function Cell({ width, children, right, warn }: { width: string; children: string; right?: boolean; warn?: boolean }) {
  const style = [right ? styles.right : {}, warn ? styles.warn : {}];
  return (
    <View style={[styles.cell, { width }]}>
      <Text style={style}>{children}</Text>
    </View>
  );
}

function RawTable({ lines, lossTypes }: { lines: ProductionBatchLineDto[]; lossTypes: ProductionLossType[] }) {
  return (
    <View>
      <View style={[styles.row, styles.headerRow]} fixed>
        <HeaderCell width={RAW.idx}>№</HeaderCell>
        <HeaderCell width={RAW.name}>Сировина</HeaderCell>
        <HeaderCell width={RAW.net} right>Нетто, кг</HeaderCell>
        <HeaderCell width={RAW.plan} right>План</HeaderCell>
        <HeaderCell width={RAW.issued} right>Видано</HeaderCell>
        <HeaderCell width={RAW.leftover} right>Залишок</HeaderCell>
        <HeaderCell width={RAW.consumed} right>Витрачено</HeaderCell>
        <HeaderCell width={RAW.dev} right>Відхил.</HeaderCell>
        <HeaderCell width={RAW.action}>Залишок куди</HeaderCell>
        <HeaderCell width={RAW.note}>Примітка</HeaderCell>
      </View>
      {lines.map((line, idx) => {
        const plan = issuePlan(line);
        const losses = lossesText(line, lossTypes);
        const dev = line.consumedQty != null ? consumptionDeviationPct(line, line.leftoverQty) : null;
        const note = [line.shortageComment, line.issueNote, line.note].filter(Boolean).join('; ');
        return (
          <View key={line.id} style={styles.row} wrap={false}>
            <Cell width={RAW.idx}>{String(idx + 1)}</Cell>
            <View style={[styles.cell, { width: RAW.name }]}>
              <Text>{line.name}</Text>
              {losses && <Text style={styles.sub}>Втрати: {losses}</Text>}
            </View>
            <Cell width={RAW.net} right>{qty(line.plannedNetKg)}</Cell>
            <Cell width={RAW.plan} right>{withUnit(plan.qty, plan.unit)}</Cell>
            <Cell width={RAW.issued} right>{withUnit(line.issuedQty, plan.unit)}</Cell>
            <Cell width={RAW.leftover} right>{withUnit(line.leftoverQty, plan.unit)}</Cell>
            <Cell width={RAW.consumed} right>{withUnit(line.consumedQty, plan.unit)}</Cell>
            <Cell width={RAW.dev} right warn={isDeviationNotable(dev)}>{pct(dev)}</Cell>
            <Cell width={RAW.action}>{line.leftoverAction ? LEFTOVER_LABELS[line.leftoverAction] ?? '–' : '–'}</Cell>
            <Cell width={RAW.note}>{note || '–'}</Cell>
          </View>
        );
      })}
    </View>
  );
}

function PackagingTable({ lines }: { lines: ProductionBatchLineDto[] }) {
  return (
    <View>
      <View style={[styles.row, styles.headerRow]} fixed>
        <HeaderCell width={PACK.idx}>№</HeaderCell>
        <HeaderCell width={PACK.name}>Пакування</HeaderCell>
        <HeaderCell width={PACK.plan} right>План</HeaderCell>
        <HeaderCell width={PACK.issued} right>Видано</HeaderCell>
        <HeaderCell width={PACK.leftover} right>Залишок</HeaderCell>
        <HeaderCell width={PACK.consumed} right>Витрачено</HeaderCell>
        <HeaderCell width={PACK.action}>Залишок куди</HeaderCell>
      </View>
      {lines.map((line, idx) => {
        const plan = issuePlan(line);
        return (
          <View key={line.id} style={styles.row} wrap={false}>
            <Cell width={PACK.idx}>{String(idx + 1)}</Cell>
            <Cell width={PACK.name}>{line.name}</Cell>
            <Cell width={PACK.plan} right>{withUnit(plan.qty, plan.unit)}</Cell>
            <Cell width={PACK.issued} right>{withUnit(line.issuedQty, plan.unit)}</Cell>
            <Cell width={PACK.leftover} right>{withUnit(line.leftoverQty, plan.unit)}</Cell>
            <Cell width={PACK.consumed} right>{withUnit(line.consumedQty, plan.unit)}</Cell>
            <Cell width={PACK.action}>{line.leftoverAction ? LEFTOVER_LABELS[line.leftoverAction] ?? '–' : '–'}</Cell>
          </View>
        );
      })}
    </View>
  );
}

function StagesTable({ batch }: { batch: ProductionBatchDetailDto }) {
  return (
    <View>
      <View style={[styles.row, styles.headerRow]} fixed>
        <HeaderCell width={STAGE.idx}>№</HeaderCell>
        <HeaderCell width={STAGE.name}>Етап</HeaderCell>
        <HeaderCell width={STAGE.plan}>План: старт / трив.</HeaderCell>
        <HeaderCell width={STAGE.start}>Початок</HeaderCell>
        <HeaderCell width={STAGE.finish}>Завершення</HeaderCell>
        <HeaderCell width={STAGE.temp}>t</HeaderCell>
        <HeaderCell width={STAGE.comment}>Коментар</HeaderCell>
      </View>
      {batch.stages.map((st, idx) => (
        <View key={st.id} style={styles.row} wrap={false}>
          <Cell width={STAGE.idx}>{String(idx + 1)}</Cell>
          <Cell width={STAGE.name}>{st.name}</Cell>
          <Cell width={STAGE.plan}>{`+${hm(st.plannedOffsetMin ?? 0)} / ${hm(st.plannedDurationMin)}`}</Cell>
          <View style={[styles.cell, { width: STAGE.start }]}>
            <Text>{dateTime(st.startedAt)}</Text>
            {st.startedByName && <Text style={styles.sub}>{st.startedByName}</Text>}
          </View>
          <View style={[styles.cell, { width: STAGE.finish }]}>
            <Text>{dateTime(st.finishedAt)}</Text>
            {st.finishedByName && <Text style={styles.sub}>{st.finishedByName}</Text>}
          </View>
          <Cell width={STAGE.temp}>{st.actualTemp ? st.actualTemp.replace(/(\d)\s*(°\s*[CС]?|℃)/g, '$1\u00A0$2') : '–'}</Cell>
          <Cell width={STAGE.comment}>{st.comment || '–'}</Cell>
        </View>
      ))}
    </View>
  );
}

function FactBlock({ batch }: { batch: ProductionBatchDetailDto }) {
  const fact = batch.fact;
  const total = fact ? factTotalPortions(fact) : null;
  const dev = deviationPct(total, batch.plannedPortions);
  const items: Array<[string, string, boolean?]> = [
    ['Порцій на ГП', qty(fact?.portionsGood, 0)],
    ['Брак, порцій', qty(fact?.portionsReject, 0)],
    ['На пробу, порцій', qty(fact?.portionsSample, 0)],
    ['Брак термоналіпок', qty(fact?.labelRejects, 0)],
    ['Порцій у коробці', qty(fact?.portionsPerBox, 0)],
    ['Коробок', qty(fact?.boxes, 0)],
    ['Піддонів', qty(fact?.pallets, 0)],
    [
      'Усього зварено',
      total != null ? `${qty(total, 0)} з ${qty(batch.plannedPortions, 0)} (${pct(dev)})` : '–',
      isDeviationNotable(dev, PORTIONS_DEVIATION_PCT),
    ],
  ];
  return (
    <View>
      <View style={styles.grid}>
        {items.map(([label, value, warn]) => (
          <View key={label} style={styles.gridItem}>
            <Text style={styles.gridLabel}>{label}</Text>
            <Text style={warn ? [styles.gridValue, styles.warn] : styles.gridValue}>{value}</Text>
          </View>
        ))}
      </View>
      {fact?.comment && <Text style={styles.comment}>Коментар: {fact.comment}</Text>}
    </View>
  );
}

function activeSignature(signatures: ProductionBatchSignatureDto[], step: string): ProductionBatchSignatureDto | null {
  return (
    signatures
      .filter((s) => s.step === step && !s.revokedAt)
      .sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0] ?? null
  );
}

function BlankField({ hint }: { hint: string }) {
  return (
    <View>
      <View style={styles.blankLine} />
      <Text style={styles.blankHint}>{hint}</Text>
    </View>
  );
}

function Signatures({ batch }: { batch: ProductionBatchDetailDto }) {
  return (
    <View wrap={false}>
      {SIGN_STEPS.map(({ step, label }) => {
        const sig = activeSignature(batch.signatures, step);
        return (
          <View key={step} style={styles.signRow}>
            <View style={styles.signStep}>
              <Text style={{ fontWeight: 700 }}>{label}</Text>
            </View>
            <View style={styles.signName}>
              {sig ? (
                <>
                  <Text>{sig.userName}</Text>
                  {sig.roleLabel && <Text style={styles.sub}>{sig.roleLabel}</Text>}
                </>
              ) : (
                <BlankField hint="ПІБ" />
              )}
            </View>
            <View style={styles.signTime}>{sig ? <Text>{dateTime(sig.signedAt)}</Text> : <BlankField hint="Дата, час" />}</View>
            <View style={styles.signBlank}>
              <BlankField hint="Підпис" />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface BatchActPdfProps {
  batch: ProductionBatchDetailDto;
  lossTypes: ProductionLossType[];
}

/** Акт варки: план, видача, залишки, етапи, факт виходу і підписи (порожні рядки – для паперу). */
export function BatchActPdfDocument({ batch, lossTypes }: BatchActPdfProps) {
  const raw = batch.lines.filter((l) => l.kind === 'raw');
  const packaging = batch.lines.filter((l) => l.kind === 'packaging');
  const versions = [`техкарта v${batch.techCardVersion}`, batch.specVersion != null ? `специфікація v${batch.specVersion}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Document title={`Акт варки ${batch.number}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>
          Акт варки {batch.number}: {batch.goodName}
        </Text>
        <Text style={styles.meta}>
          {[
            `План: ${qty(batch.plannedPortions, 0)} порцій на ${dateOnly(batch.plannedDate)}`,
            versions,
            `Стан: ${PRODUCTION_BATCH_STATUS_LABELS[batch.status]}`,
          ].join('  ·  ')}
        </Text>
        <Text style={styles.meta}>
          {[
            `Створив: ${batch.createdByName ?? '–'}, ${dateTime(batch.createdAt)}`,
            batch.closedAt ? `Закрито: ${dateTime(batch.closedAt)}` : null,
            `Сформовано: ${dateTime(new Date().toISOString())}`,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
        {batch.comment && <Text style={styles.comment}>Коментар: {batch.comment}</Text>}
        {batch.status === 'cancelled' && (
          <Text style={[styles.comment, styles.warn]}>
            Варку скасовано{batch.cancelReason ? `: ${batch.cancelReason}` : ''}
          </Text>
        )}

        {raw.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Сировина</Text>
            <RawTable lines={raw} lossTypes={lossTypes} />
          </View>
        )}
        {packaging.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Пакування</Text>
            <PackagingTable lines={packaging} />
          </View>
        )}
        {batch.stages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Етапи</Text>
            <StagesTable batch={batch} />
          </View>
        )}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Факт виходу</Text>
          <FactBlock batch={batch} />
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Підписи</Text>
          <Signatures batch={batch} />
        </View>

        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
