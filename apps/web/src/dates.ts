const DAY = 86400000;
export type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'lastMonth' | 'last365' | 'custom';
type CalendarRange = { start: Date; end: Date; previousStart: Date };

function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  function part(type: Intl.DateTimeFormatPartTypes) { return Number(parts.find(part => part.type === type)?.value); }
  return Date.UTC(part('year'), part('month') - 1, part('day'));
}

function midnight(date: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'longOffset' });
  function offset(timestamp: number) {
    const name = formatter.formatToParts(timestamp).find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = /^GMT([+-])(\d\d):(\d\d)(?::(\d\d))?$/.exec(name);
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0)) * 1000 : 0;
  }
  const first = date - offset(date);
  const second = date - offset(first);
  return new Date(first === second ? first : Math.max(first, second));
}

export function calendarRange(now: Date, timezone: string, preset: Preset, customStart: string, customEnd: string): CalendarRange | null {
  const today = localDate(now, timezone);
  const local = new Date(today);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const thisMonth = Date.UTC(year, month, 1);
  const lastMonth = Date.UTC(year, month - 1, 1);
  let start = today, end = today + DAY, previousStart: number | undefined;
  switch (preset) {
    case 'today': break;
    case 'yesterday': start -= DAY; end -= DAY; break;
    case 'last7': start -= 6 * DAY; break;
    case 'last30': start -= 29 * DAY; break;
    case 'last365': start -= 364 * DAY; break;
    case 'month': start = thisMonth; previousStart = lastMonth; break;
    case 'lastMonth': start = lastMonth; end = thisMonth; previousStart = Date.UTC(year, month - 2, 1); break;
    case 'custom':
      start = Date.parse(customStart);
      end = Date.parse(customEnd) + DAY;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 365 * DAY) return null;
      break;
  }
  const startTime = midnight(start, timezone);
  return { start: startTime, end: midnight(end, timezone), previousStart: midnight(previousStart ?? start - (end - start), timezone) };
}
