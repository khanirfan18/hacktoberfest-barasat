export type OpeningHours = Record<string, Array<[string, string]>>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getLocalParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const weekday = part("weekday").slice(0, 3).toLowerCase();
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));
  return { weekday, minutes: hour * 60 + minute };
}

function toMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) return 1440;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isGymOpenNow(
  openingHours: unknown,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return false;
  const local = getLocalParts(now, timeZone);
  if (!DAY_KEYS.includes(local.weekday as (typeof DAY_KEYS)[number])) return false;

  const intervals = (openingHours as OpeningHours)[local.weekday];
  if (!Array.isArray(intervals)) return false;
  return intervals.some((interval) => {
    if (!Array.isArray(interval) || interval.length !== 2) return false;
    const opens = toMinutes(interval[0]);
    const closes = toMinutes(interval[1]);
    return opens !== null && closes !== null && local.minutes >= opens && local.minutes < closes;
  });
}

export function getLocalDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getLocalHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}
