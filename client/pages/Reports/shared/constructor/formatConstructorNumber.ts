export type ConstructorNumberFormat = 'qty' | 'money' | 'percent';

const QTY_FORMATTER = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const MONEY_FORMATTER = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT_FORMATTER = new Intl.NumberFormat('uk-UA', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const ABSURD_ABS = 1e12;

export function formatConstructorNumber(
  value: number | undefined | null,
  format: ConstructorNumberFormat,
): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—';
  }

  if (Math.abs(value) >= ABSURD_ABS) {
    return '—';
  }

  if (format === 'money') {
    return MONEY_FORMATTER.format(value);
  }

  if (format === 'percent') {
    return PERCENT_FORMATTER.format(value);
  }

  return QTY_FORMATTER.format(value);
}
