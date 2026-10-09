"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { GlassCard, HeatStrip } from "@/components/ui-gg";
import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/copy";

export type OwnerSlot = { hour: number; capacity: number; booked: number; open: boolean };
export type OwnerBooking = { id: string; slotStart: string; displayName: string; status: "confirmed" | "checked_in" };

const realtimeBookingSchema = z.object({ id: z.string().uuid(), gym_id: z.string().uuid() });

function hourLabel(hour: number) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour)));
}

export function OwnerTimeline({
  gymId,
  timezone,
  slots,
  bookings,
}: {
  gymId: string;
  timezone: string;
  slots: OwnerSlot[];
  bookings: OwnerBooking[];
}) {
  const router = useRouter();
  const [pulseId, setPulseId] = useState("");
  const [realtimeError, setRealtimeError] = useState(false);
  const values = useMemo(() => slots.map((slot) => slot.capacity > 0 ? slot.booked / slot.capacity : 0), [slots]);
  const byHour = useMemo(() => {
    const result = new Map<number, OwnerBooking[]>();
    for (const booking of bookings) {
      const hourText = new Intl.DateTimeFormat("en", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(new Date(booking.slotStart));
      const hour = Number(hourText);
      const existing = result.get(hour) ?? [];
      existing.push(booking);
      result.set(hour, existing);
    }
    return result;
  }, [bookings, timezone]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`owner-bookings-${gymId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "bookings",
        filter: `gym_id=eq.${gymId}`,
      }, (payload) => {
        const parsed = realtimeBookingSchema.safeParse(payload.new);
        if (!parsed.success) return;
        setPulseId(parsed.data.id);
        router.refresh();
        window.setTimeout(() => setPulseId(""), 2500);
      })
      .subscribe((status) => setRealtimeError(status === "CHANNEL_ERROR" || status === "TIMED_OUT"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gymId, router]);

  return (
    <GlassCard className="mt-6 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-cyan">{copy.owner.hourlyTimeline}</p><p className="mt-1 text-xs text-white/45">Capacity usage · local gym time</p></div>
        <span className={`size-2 rounded-full bg-lime ${pulseId ? "animate-ping" : "animate-pulse"}`} aria-label="Live bookings" />
      </div>
      {realtimeError && <p role="status" className="mt-3 text-xs text-magenta">Live updates are temporarily unavailable.</p>}
      <div className="mt-4"><HeatStrip values={values} /></div>
      {slots.length ? (
        <ul className="mt-4 space-y-2">
          {slots.map((slot, index) => {
            const slotBookings = byHour.get(slot.hour) ?? [];
            return (
              <li key={slot.hour} className={`rounded-xl border px-3 py-3 ${slotBookings.some((booking) => booking.id === pulseId) ? "animate-pulse border-lime/45 bg-lime/[0.06]" : "border-white/[0.06] bg-white/[0.02]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-white/70">{hourLabel(slot.hour)}</span>
                  <span className="font-mono text-[10px] text-white/45">{slot.booked}/{slot.capacity}{slot.open ? "" : " · closed"}</span>
                </div>
                {slotBookings.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{slotBookings.map((booking) => <span key={booking.id} className={`rounded-full px-2 py-1 text-[10px] ${booking.status === "checked_in" ? "bg-lime/10 text-lime" : "bg-white/[0.06] text-white/60"}`}>{booking.displayName}</span>)}</div>}
                {slotBookings.length === 0 && slot.booked === 0 && index === 0 && slots.every((entry) => entry.booked === 0) && <p className="mt-2 text-[10px] text-white/35">{copy.owner.noBookings}</p>}
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-4 text-sm text-white/45">{copy.owner.noBookings}</p>}
    </GlassCard>
  );
}
