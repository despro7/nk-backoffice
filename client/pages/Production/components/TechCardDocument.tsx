import { useState, type ReactNode } from 'react';
import {
  Divider,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
} from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useProductionSettings } from '@/hooks/useProductionSettings';
import {
  EMPTY_TECH_CARD_PAYLOAD,
  type TechCardDetailDto,
  type TechCardVersionSource,
} from '@shared/types/production';
import { useTechCardVersions } from '../useTechCards';
import { TechCardComposition } from './TechCardComposition';
import { SpecDraftChip, TechCardStatusChip, formatDateTime } from './techCardUi';

type TabKey = 'card' | 'versions' | 'batches';

const VERSION_SOURCE_LABELS: Record<TechCardVersionSource, string> = {
  ui: 'Редагування',
  auto: 'Нова версія специфікації',
  rollback: 'Відкат',
};

const TABLE_CLASS_NAMES = {
  th: 'bg-default-100 text-default-600 text-xs font-semibold first:rounded-l-md last:rounded-r-md',
  td: 'text-sm py-2',
};

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-default-900">
        <DynamicIcon name={icon} size={16} className="text-default-500" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-default-500">{children}</p>;
}

/** Рядок метаданих техкарти: статус, версії, артикул. */
export function TechCardMeta({ data }: { data: TechCardDetailDto }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
      <TechCardStatusChip status={data.status} />
      {data.spec.draft && <SpecDraftChip status={data.spec.draft.status} />}
      <span>{data.current ? `Техкарта v${data.current.version}` : 'Версій техкарти ще немає'}</span>
      <span>·</span>
      <span>
        {data.spec.currentVersion != null ? `Специфікація v${data.spec.currentVersion}` : 'Специфікація без версії'}
      </span>
      {data.good.sku && (
        <>
          <span>·</span>
          <span className="font-mono">{data.good.sku}</span>
        </>
      )}
    </div>
  );
}

function VersionsTab({ data }: { data: TechCardDetailDto }) {
  const { versions, loading, error } = useTechCardVersions(data.goodId, true);
  const spec = data.spec.current;
  return (
    <div className="space-y-4">
      {spec && (
        <p className="text-sm text-default-600">
          Чинна специфікація: v{spec.version}, {formatDateTime(spec.at)}
          {spec.byName ? `, ${spec.byName}` : ''}.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Table aria-label="Версії техкарти" removeWrapper classNames={TABLE_CLASS_NAMES}>
        <TableHeader>
          <TableColumn>Версія</TableColumn>
          <TableColumn>Специфікація</TableColumn>
          <TableColumn>Джерело</TableColumn>
          <TableColumn>Затвердив</TableColumn>
          <TableColumn>Дата</TableColumn>
          <TableColumn>Коментар</TableColumn>
        </TableHeader>
        <TableBody
          isLoading={loading}
          emptyContent={loading ? ' ' : 'Затверджених версій техкарти ще немає'}
        >
          {versions.map((v) => (
            <TableRow key={v.version}>
              <TableCell className="tabular-nums font-medium">v{v.version}</TableCell>
              <TableCell className="tabular-nums">{v.specVersion != null ? `v${v.specVersion}` : '–'}</TableCell>
              <TableCell>{VERSION_SOURCE_LABELS[v.source]}</TableCell>
              <TableCell>{v.approvedByName ?? v.authorName ?? '–'}</TableCell>
              <TableCell className="tabular-nums">{formatDateTime(v.approvedAt ?? v.createdAt)}</TableCell>
              <TableCell className="text-default-500">{v.comment || '–'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CardTab({ data }: { data: TechCardDetailDto }) {
  const { settings } = useProductionSettings();
  const payload = data.current?.payload ?? EMPTY_TECH_CARD_PAYLOAD;
  const specDraft = data.spec.draft;

  return (
    <div className="flex flex-col gap-5">
      <Section icon="list" title="Склад">
        {specDraft && (
          <p className="text-xs text-warning-700">
            Склад показано за чинною версією специфікації. Чернетка
            {specDraft.authorName ? ` (${specDraft.authorName}, ${formatDateTime(specDraft.updatedAt)})` : ''} ще
            не затверджена.
          </p>
        )}
        <TechCardComposition
          productName={data.good.name}
          components={data.good.components}
          units={data.units}
          specQty={data.good.specQty}
          lossFormula={data.lossFormula}
          lossTypes={settings.lossTypes}
        />
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="list-ordered" title="Етапи">
        {payload.stages.length === 0 ? (
          <Empty>Етапи ще не описано.</Empty>
        ) : (
          <ol className="space-y-1 text-sm">
            {payload.stages.map((stage, idx) => (
              <li key={stage.key} className="flex gap-2">
                <span className="tabular-nums text-default-400">{idx + 1}.</span>
                <span className="font-medium">{stage.name || 'Без назви'}</span>
                {stage.durationMin != null && (
                  <span className="text-default-500">· {stage.durationMin} хв</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="package" title="Пакування">
        {payload.packaging.length === 0 ? <Empty>Пакування ще не задано.</Empty> : null}
      </Section>

      <Divider className="bg-default-200/60" />

      <Section icon="sticky-note" title="Примітки">
        {payload.notes ? (
          <p className="whitespace-pre-line text-sm">{payload.notes}</p>
        ) : (
          <Empty>Приміток немає.</Empty>
        )}
      </Section>
    </div>
  );
}

/** Документ техкарти: вкладки «Техкарта», «Версії / Історія», «Варки». Спільний для сторінки і Drawer. */
export function TechCardDocument({ data }: { data: TechCardDetailDto }) {
  const [tab, setTab] = useState<TabKey>('card');

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        size="md"
        color="primary"
        aria-label="Розділи техкарти"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key) as TabKey)}
      >
        <Tab
          key="card"
          title={
            <span className="flex items-center gap-2">
              <span className="inline-flex size-4 shrink-0">
                <DynamicIcon name="file-text" size={16} />
              </span>
              Техкарта
            </span>
          }
        />
        <Tab
          key="versions"
          title={
            <span className="flex items-center gap-2">
              <span className="inline-flex size-4 shrink-0">
                <DynamicIcon name="history" size={16} />
              </span>
              Версії / Історія
            </span>
          }
        />
        <Tab
          key="batches"
          title={
            <span className="flex items-center gap-2">
              <span className="inline-flex size-4 shrink-0">
                <DynamicIcon name="cooking-pot" size={16} />
              </span>
              Варки
            </span>
          }
        />
      </Tabs>

      {tab === 'card' && <CardTab data={data} />}
      {tab === 'versions' && <VersionsTab data={data} />}
      {tab === 'batches' && <Empty>Варок за цією техкартою ще немає.</Empty>}
    </div>
  );
}
