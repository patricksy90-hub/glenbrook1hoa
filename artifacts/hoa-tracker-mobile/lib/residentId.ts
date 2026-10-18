// Share portal Resident ID identity/designation semantics with the native card.
export { buildIdNumber, getIdBadge } from '@workspace/designation';

export const VILLAGE_NAME = 'Glenbrook 1';
export const VILLAGE_CODE = 'GL1';
export const HOA_NAME = 'Glenbrook 1 HOA';
export const HOA_ADDRESS = 'Brgy. Pasong Camachile 1, General Trias, Cavite';
export const RETURN_POLICY = 'If found, please return to the HOA Administration Office.';

export function fullName(u: { firstName: string; lastName: string; middleName?: string | null }) {
  return [u.lastName + ',', u.firstName, u.middleName ? u.middleName[0] + '.' : ''].filter(Boolean).join(' ');
}

