const RU_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const RU_DATE_HINT = "ДД.ММ.ГГГГ";
export const RU_DATE_ERROR = "Укажите дату в формате ДД.ММ.ГГГГ";

export function maskRuDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length <= 2) {
    return day;
  }
  if (digits.length <= 4) {
    return `${day}.${month}`;
  }
  return `${day}.${month}.${year}`;
}

export function isoToRuDate(iso: string | null | undefined): string {
  if (iso === undefined || iso === null || iso.length === 0) {
    return "";
  }
  const match = ISO_DATE.exec(iso.slice(0, 10));
  if (match === null) {
    return "";
  }
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) {
    return "";
  }
  return `${day}.${month}.${year}`;
}

export type RuDateParse =
  | { ok: true; iso: string | null }
  | { ok: false };

export function parseRuDate(input: string): RuDateParse {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, iso: null };
  }
  const match = RU_DATE.exec(trimmed);
  if (match === null) {
    return { ok: false };
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return { ok: false };
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return { ok: true, iso: `${String(year)}-${mm}-${dd}` };
}
