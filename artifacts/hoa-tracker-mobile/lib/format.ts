export function parseCurrencyAmount(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;

  const amount = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : null;
}

export function formatCurrency(value: number | string | null | undefined): string {
  const amount = parseCurrencyAmount(value);
  if (amount === null) return 'PHP 0.00';

  const formatted = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `PHP ${formatted}`;
}

export function formatDate(dateString: string | null | undefined) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateString));
}
