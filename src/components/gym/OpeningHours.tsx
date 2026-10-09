import { isGymOpenNow } from "@/lib/explore";
import { GlassCard } from "@/components/ui-gg/GlassCard";

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"],
  ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
] as const;

function todayKey(timeZone: string, now: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now).slice(0, 3).toLowerCase();
  return weekday;
}

function formatHours(value: unknown) {
  if (!Array.isArray(value)) return "Closed";
  if (value.length === 0) return "Closed";
  return value.map((interval) => {
    if (!Array.isArray(interval) || interval.length !== 2) return "";
    return `${interval[0]} – ${interval[1]}`;
  }).filter(Boolean).join(", ") || "Closed";
}

export function OpeningHours({
  openingHours,
  timezone,
  estimated,
}: {
  openingHours: unknown;
  timezone: string;
  estimated: boolean;
}) {
  const now = new Date();
  const activeDay = todayKey(timezone, now);
  const open = isGymOpenNow(openingHours, timezone, now);
  const hours = openingHours && typeof openingHours === "object" && !Array.isArray(openingHours)
    ? openingHours as Record<string, unknown>
    : {};
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-sm">Opening hours</h2>
        <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase ${open ? "border-lime/30 text-lime" : "border-white/15 text-white/50"}`}>{open ? "Open now" : "Closed now"}</span>
      </div>
      {estimated && <p className="mt-3 rounded-lg border border-magenta/20 bg-magenta/5 p-2.5 text-xs text-magenta">These hours are estimated. Please confirm with the gym.</p>}
      <ul className="mt-4 space-y-2">
        {DAYS.map(([key, label]) => (
          <li key={key} className={`flex justify-between gap-3 rounded-lg px-2 py-1.5 text-xs ${key === activeDay ? "bg-lime/[0.07] text-lime" : "text-white/55"}`}>
            <span>{label}{key === activeDay && <span className="ml-2 font-mono text-[9px] uppercase">Today</span>}</span>
            <span className="text-right">{formatHours(hours[key])}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-white/35">Times shown in {timezone}</p>
    </GlassCard>
  );
}
