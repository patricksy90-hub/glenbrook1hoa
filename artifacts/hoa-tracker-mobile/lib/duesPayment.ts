export const ELIGIBLE_STATUSES = ['pending', 'overdue', 'partial', 'unpaid'];

export interface DueLike {
  id: number;
  amount: number;
  status: string;
  remainingAmount?: number | null;
}

export function toCents(n: number): number {
  return Math.round(n * 100);
}

export function isEligible(d: DueLike): boolean {
  const r = d.remainingAmount;
  return ELIGIBLE_STATUSES.includes(d.status) && typeof r === 'number' && Number.isFinite(r) && r > 0;
}

export function remainingCents(d: DueLike): number {
  return typeof d.remainingAmount === 'number' && Number.isFinite(d.remainingAmount)
    ? toCents(d.remainingAmount)
    : toCents(d.amount);
}

export function centsToString(c: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(c / 100);
}

export interface AdvancePeriod {
  periodKey: string;
  period: string;
  amount: number;
}

export function isAdvanceEligible(p: AdvancePeriod): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p.periodKey) && Number.isFinite(p.amount) && p.amount > 0;
}

export function paymentTotalCents(dues: DueLike[], advances: AdvancePeriod[], method: 'cash' | 'paymongo', fee: number): number {
  if (method === 'paymongo' && advances.length) throw new Error('Advance periods are cash only');
  return dues.reduce((sum, due) => sum + remainingCents(due), 0)
    + advances.reduce((sum, p) => sum + toCents(p.amount), 0)
    + (method === 'paymongo' ? toCents(fee) * dues.length : 0);
}

/** PayMongo's hosted checkout / short-link domains; no userinfo or port. */
export function isTrustedCheckoutUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !raw.startsWith('https://')) return false;
  const authority = raw.slice(8).split(/[/?#]/)[0];
  if (!authority || authority.includes('@') || authority.includes(':') || authority.includes('\\')) return false;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'pm.link' || host === 'paymongo.com' || host.endsWith('.paymongo.com');
}
