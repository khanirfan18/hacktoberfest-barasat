import Link from "next/link";
import { z } from "zod";
import { GlassCard, SectionTitle, StatTile } from "@/components/ui-gg";
import { OwnerTimeline, type OwnerBooking, type OwnerSlot } from "@/components/owner/OwnerTimeline";
import { copy } from "@/lib/copy";
import { formatMoney } from "@/lib/format";
import { requireRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function localMidnightIso(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day);
  let utc = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utc));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const localDay = `${part("year")}-${part("month")}-${part("day")}`;
    const [localYear, localMonth, localDateValue] = localDay.split("-").map(Number);
    utc += desired - Date.UTC(localYear, localMonth - 1, localDateValue, Number(part("hour")));
  }
  return new Date(utc).toISOString();
}

type GymRelation = { id: string; name: string; address: string | null; opening_hours: unknown; cities: { name: string; timezone: string; currency: string } | Array<{ name: string; timezone: string; currency: string }> | null };
type BookingRow = { id: string; user_id: string; slot_start: string; slot_end: string; price_minor: number; status: "confirmed" | "checked_in" };

export default async function OwnerPage() {
  const owner = await requireRole("owner");
  const supabase = await createServerClient();
  const { data: gymRows, error: gymError } = await supabase
    .from("gyms")
    .select("id, name, address, opening_hours, cities(name, timezone, currency)")
    .eq("owner_id", owner.id)
    .order("created_at", { ascending: true })
    .limit(1);
  if (gymError) throw new Error(`Load owner gym: ${gymError.message}`);
  const gymRelation = gymRows?.[0] as GymRelation | undefined;

  if (!gymRelation) {
    return <div className="py-8"><SectionTitle eyebrow={copy.owner.dashboardEyebrow} title={copy.owner.dashboardTitle} /><GlassCard className="mt-6 p-6 text-sm text-white/50">{copy.owner.noGym}</GlassCard></div>;
  }
  const city = Array.isArray(gymRelation.cities) ? gymRelation.cities[0] : gymRelation.cities;
  if (!city?.timezone) throw new Error("Owner gym timezone is unavailable");
  const today = localDate(new Date(), city.timezone);
  const startIso = localMidnightIso(today, city.timezone);
  const endIso = localMidnightIso(shiftDate(today, 1), city.timezone);

  const [slotsResponse, bookingsResponse] = await Promise.all([
    supabase.rpc("slot_availability", { p_gym: gymRelation.id, p_day: today }),
    supabase.from("bookings")
      .select("id, user_id, slot_start, slot_end, price_minor, status")
      .eq("gym_id", gymRelation.id)
      .gte("slot_start", startIso)
      .lt("slot_start", endIso)
      .in("status", ["confirmed", "checked_in"])
      .order("slot_start", { ascending: true }),
  ]);
  if (slotsResponse.error) throw new Error(`Load today's owner availability: ${slotsResponse.error.message}`);
  if (bookingsResponse.error) throw new Error(`Load today's owner bookings: ${bookingsResponse.error.message}`);

  const slotSchema = z.array(z.object({
    hour: z.number().int().min(0).max(23),
    capacity: z.number().int().nonnegative(),
    booked: z.number().int().nonnegative(),
    open: z.boolean(),
  }));
  const slotParse = slotSchema.safeParse(slotsResponse.data ?? []);
  if (!slotParse.success) throw new Error("Today's owner availability had an invalid shape");
  const bookings = (bookingsResponse.data ?? []) as BookingRow[];
  const userIds = [...new Set(bookings.map((booking) => booking.user_id))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient.from("profiles").select("id, display_name").in("id", userIds);
    if (profilesError) throw new Error(`Load traveller display names: ${profilesError.message}`);
    for (const profile of profiles ?? []) names.set(profile.id, profile.display_name?.slice(0, 80) || "GymGo traveller");
  }
  const timelineBookings: OwnerBooking[] = bookings.map((booking) => ({
    id: booking.id,
    slotStart: booking.slot_start,
    displayName: names.get(booking.user_id) ?? "GymGo traveller",
    status: booking.status,
  }));
  const todayCount = bookings.length;
  const checkedInCount = bookings.filter((booking) => booking.status === "checked_in").length;
  const revenueMinor = bookings.reduce((total, booking) => total + booking.price_minor, 0);

  return (
    <div className="py-8">
      <SectionTitle eyebrow={copy.owner.dashboardEyebrow} title={copy.owner.dashboardTitle} />
      <p className="mt-2 text-sm text-white/45">{gymRelation.name} · {city.name} · {today}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatTile label={copy.owner.todayBookings} value={String(todayCount)} />
        <StatTile label={copy.owner.checkedIn} value={String(checkedInCount)} />
        <StatTile label={copy.owner.revenueEstimate} value={formatMoney(revenueMinor, city.currency)} />
      </div>
      <OwnerTimeline gymId={gymRelation.id} timezone={city.timezone} slots={slotParse.data as OwnerSlot[]} bookings={timelineBookings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link href="/owner/scan"><GlassCard className="p-6 transition hover:border-lime/30"><p className="font-display text-xl text-lime">{copy.owner.scanEntry} ↗</p><p className="mt-2 text-sm text-white/50">{copy.owner.scanDescription}</p></GlassCard></Link>
        <Link href="/owner/scans"><GlassCard className="p-6 transition hover:border-cyan/30"><p className="font-display text-xl">{copy.owner.scansLog} ↗</p><p className="mt-2 text-sm text-white/50">{copy.owner.scansDescription}</p></GlassCard></Link>
        <Link href="/owner/edit"><GlassCard className="p-6 transition hover:border-white/20"><p className="font-display text-xl">Edit your gym ↗</p><p className="mt-2 text-sm text-white/50">Keep your listing fresh.</p></GlassCard></Link>
      </div>
    </div>
  );
}
