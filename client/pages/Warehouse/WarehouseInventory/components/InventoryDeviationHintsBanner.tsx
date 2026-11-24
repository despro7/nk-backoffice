import { useState, type ReactNode } from 'react';
import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  DeviationHypothesis,
  DeviationHypothesisConfidence,
  DeviationHintsResponse,
  DeviationResidualLine,
} from '@shared/types/inventoryDeviationHints';
import { formatDate } from '@/lib/formatUtils';

interface InventoryDeviationHintsBannerProps {
  data: DeviationHintsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  badge?: ReactNode;
  /** Відкрити замовлення в дровері; без нього номер показується текстом. */
  onOpenOrder?: (orderNumber: string) => void;
}

const CONFIDENCE_LABEL: Record<DeviationHypothesisConfidence, string> = {
  high: 'Висока',
  medium: 'Середня',
  low: 'Низька',
};

const CONFIDENCE_COLOR: Record<DeviationHypothesisConfidence, 'success' | 'warning' | 'default'> = {
  high: 'success',
  medium: 'warning',
  low: 'default',
};

const fmtQty = (n: number): string => (n > 0 ? `+${n}` : String(n));

function hypothesisTitle(h: DeviationHypothesis): string {
  const refNumber = h.reference?.orderNumber ?? h.reference?.number;
  const num = refNumber ? ` №${refNumber}` : '';
  switch (h.type) {
    case 'kit_unposted':
      if (h.kit) return `Комплектація${num}: проведено ${h.kit.postedQty}, фізично ${h.kit.impliedQty}`;
      return 'Комплектацію виконано фізично, але не проведено в обліку';
    case 'kit_swap':
      if (h.swap?.kind === 'set') return `Зібрано «${h.swap.actualName}» замість «${h.swap.expectedName}»${num ? ` (комплектація${num})` : ''}`;
      if (h.swap) return `Замість «${h.swap.expectedName}» використано «${h.swap.actualName}»${num ? ` (комплектація${num})` : ''}`;
      return 'Підміна товару в комплектації';
    case 'return_unposted':
      return `Повернення замовлення${num} фізично прийнято, але не проведено`;
    case 'return_duplicated':
      return `Повернення замовлення${num} проведено двічі`;
    case 'kit_not_done':
      if (h.kit) return `Комплектація${num}: проведено ${h.kit.postedQty}, фізично ${h.kit.impliedQty}`;
      return `Комплектацію${num} проведено в обліку, але фізично не виконано`;
    case 'order_unposted':
      return h.similarCount && h.similarCount > 1
        ? `Відвантаження ${h.similarCount} схожих замовлень не проведено або проведено двічі`
        : `Замовлення${num} відвантажено фізично, але не проведено (або проведено двічі)`;
    case 'order_not_shipped':
      return h.similarCount && h.similarCount > 1
        ? `${h.similarCount} схожих замовлень проведено, але фізично не відвантажено`
        : `Замовлення${num} проведено, але фізично не відвантажено`;
    case 'movement_mismatch':
      return `Розбіжність у переміщенні${num}`;
    default:
      return 'Ймовірна причина';
  }
}

const RESIDUAL_HINT_PLUS = 'перевірте неоприбутковані надлишки / повернення';
const RESIDUAL_HINT_MINUS = 'перевірте несписаний брак';

function residualChip(r: DeviationResidualLine, historySessions?: number): string | null {
  if (!r.pattern) return null;
  return `Хронічне (${r.pattern.hits}${historySessions ? ` з ${historySessions}` : ''})`;
}

function ReferenceLink({ h, onOpenOrder }: { h: DeviationHypothesis; onOpenOrder?: (orderNumber: string) => void }) {
  const ref = h.reference;
  if (!ref) return null;
  const date = ref.date ? ` · ${formatDate(ref.date)}` : '';
  if (ref.kind === 'order') {
    const orderNumber = ref.orderNumber ?? null;
    const label = `Замовлення №${orderNumber ?? ref.number ?? ref.id}${date}`;
    if (orderNumber && onOpenOrder) {
      return (
        <button type="button" onClick={() => onOpenOrder(orderNumber)} className="text-xs text-primary underline cursor-pointer">
          {label}
        </button>
      );
    }
    return <span className="text-xs text-default-500">{label}</span>;
  }
  const label = `${ref.kind === 'movement' ? 'Переміщення' : 'Комплектація'} ${ref.number ?? ref.id}`;
  return <span className="text-xs text-default-500">{label}{date}</span>;
}

export const InventoryDeviationHintsBanner = ({ data, isLoading, isError, badge, onOpenOrder }: InventoryDeviationHintsBannerProps) => {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="px-4 py-2 border-b border-warning-200 bg-warning-50 text-xs text-warning-700 flex items-center gap-2">
        <DynamicIcon name="loader-circle" className="w-3 h-3 animate-spin" />
        {badge}
        Аналізую ймовірні причини відхилень...
      </div>
    );
  }
  if (isError || !data) return null;

  const { hypotheses, totalDeviationUnits, explainedUnits, residual } = data;
  if (hypotheses.length === 0 && residual.length === 0) return null;

  const countLabel =
    hypotheses.length === 0
      ? 'Ймовірних причин не знайдено'
      : `${hypotheses.length} ${hypotheses.length === 1 ? 'ймовірна причина відхилення' : hypotheses.length < 5 ? 'ймовірні причини відхилень' : 'ймовірних причин відхилень'} · пояснюють ${explainedUnits} з ${totalDeviationUnits} од.`;

  return (
    <div className="border-b border-warning-200 bg-warning-50">
      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-warning-800">
          <DynamicIcon name="lightbulb" className="w-4 h-4 text-warning-600" />
          {badge}
          <span className="font-medium">{countLabel}</span>
        </div>
        <Button
          size="sm"
          variant="flat"
          color="warning"
          onPress={() => setExpanded((v) => !v)}
          endContent={<DynamicIcon name={expanded ? 'chevron-up' : 'chevron-down'} className="w-3 h-3" />}
        >
          {expanded ? 'Згорнути' : 'Показати'}
        </Button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {hypotheses.map((h) => (
            <div key={h.id} className="bg-content1 rounded-md border border-warning-200 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Chip size="sm" variant="flat" color={CONFIDENCE_COLOR[h.confidence]}>
                    {CONFIDENCE_LABEL[h.confidence]}
                  </Chip>
                  <span className="text-sm font-medium text-default-900">{hypothesisTitle(h)}</span>
                </div>
                <span className="text-xs text-default-500">пояснює {h.explainedUnits} од.</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-default-500 text-left">
                    <th className="font-normal py-0.5">Товар</th>
                    <th className="font-normal py-0.5 text-right w-24">Очікувано</th>
                    <th className="font-normal py-0.5 text-right w-24">Відхилення</th>
                  </tr>
                </thead>
                <tbody>
                  {h.lines.map((line) => (
                    <tr key={line.sku} className="border-t border-default-100">
                      <td className="py-0.5">
                        {line.name} <span className="font-mono text-default-400">{line.sku}</span>
                      </td>
                      <td className="py-0.5 text-right tabular-nums">{fmtQty(line.expected)}</td>
                      <td className="py-0.5 text-right tabular-nums">{line.actual === 0 ? '–' : fmtQty(line.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ReferenceLink h={h} onOpenOrder={onOpenOrder} />
            </div>
          ))}

          {data.countingNoise && (
            <div className="rounded-md border border-warning-300 bg-content1 p-3 text-xs text-default-700">
              Схоже на помилки підрахунку, перерахуйте: {residual.map((r) => r.name).join(', ')}
            </div>
          )}

          {residual.length > 0 && (
            <div className="rounded-md border border-dashed border-warning-300 bg-content1 p-3 space-y-1">
              <div className="text-xs text-default-500">Не пояснено</div>
              {residual.map((r) => {
                const chip = residualChip(r, data.historySessions);
                return (
                  <div key={r.sku} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span>
                      {r.name} <span className="tabular-nums font-medium">{fmtQty(r.deviation)}</span>
                    </span>
                    {chip && (
                      <Chip size="sm" variant="flat" color="warning" title={r.pattern?.history.map((h) => `#${h.sessionId}: ${fmtQty(h.deviation)}`).join(', ')}>
                        {chip}
                      </Chip>
                    )}
                    {!r.pattern && !data.countingNoise && (
                      <span className="text-default-400">{r.deviation > 0 ? RESIDUAL_HINT_PLUS : RESIDUAL_HINT_MINUS}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InventoryDeviationHintsBanner;
