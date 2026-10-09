import Link from "next/link";
import { GlassCard, SectionTitle } from "@/components/ui-gg";
import { copy } from "@/lib/copy";
import { formatMoney } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";

type BookingRow = {
  id: string;
  slot_start: string;
  slot_end: string;
  price_minor: number;
  currency: string;
  status: "confirmed" | "checked_in" | "cancelled";
  gyms: Array<{ name: string; cities: Array<{ name: string; timezone: string }> | null }> | null;
};

function localDateTime(start: string, end: string, timezone: string) {
  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: timezone }).format(new Date(start));
  const startTime = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(start));
  const endTime = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(end));
  return `${date} · ${startTime}–${endTime}`;
}

function statusLabel(status: BookingRow["status"]) {
  if (status === "checked_in") return copy.bookingTicket.statusCheckedIn;
  if (status === "cancelled") return copy.bookingTicket.statusCancelled;
  return copy.bookingTicket.statusConfirmed;
}

function BookingList({ bookings, emptyText }: { bookings: BookingRow[]; emptyText: string }) {
  return bookings.length ? (
    <div className="mt-4 space-y-3">
      {bookings.map((booking) => {
        const gym = booking.gyms?.[0];
        const city = gym?.cities?.[0];
        const timezone = city?.timezone ?? "UTC";
        return (
          <article key={booking.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="min-w-0">
              <h3 className="truncate font-display text-sm">{gym?.name ?? "Gym session"}</h3>
              <p className="mt-1 text-xs text-white/50">{localDateTime(booking.slot_start, booking.slot_end, timezone)} · {city?.name ?? timezone}</p>
              <p className="mt-2 font-mono text-xs text-white/65">{formatMoney(booking.price_minor, booking.currency)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${booking.status === "checked_in" ? "border-lime/25 text-lime" : booking.status === "cancelled" ? "border-white/15 text-white/45" : "border-cyan/25 text-cyan"}`}>{statusLabel(booking.status)}</span>
              <Link href={`/ticket/${booking.id}`} className="rounded-full border border-lime/25 px-3 py-2 text-xs text-lime">{copy.bookingTicket.ticket}</Link>
            </div>
          </article>
        );
      })}
    </div>
  ) : (
    <div className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/45">{emptyText}</div>
  );
}

export default async function MePage() {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Check bookings session: ${userError.message}`);

  if (!user) {
    return (
      <div className="py-8">
        <SectionTitle eyebrow="Your journey" title="Keep showing up." />
        <GlassCard className="mt-6 p-6">
          <p className="text-sm text-white/60">Sign in to see your upcoming and past gym sessions.</p>
          <Link href="/login?next=%2Fme" className="mt-4 inline-flex rounded-full bg-lime px-4 py-2.5 text-xs font-semibold text-noir">Sign in</Link>
        </GlassCard>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id, slot_start, slot_end, price_minor, currency, status, gyms(name, cities(name, timezone))")
    .eq("user_id", user.id)
    .order("slot_start", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Load your bookings: ${error.message}`);
  const bookings = (data ?? []) as BookingRow[];
  const now = Date.now();
  const upcoming = bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.slot_start).getTime() > now);
  const past = bookings.filter((booking) => !upcoming.includes(booking));

  return (
    <div className="py-8">
      <SectionTitle eyebrow="Your journey" title="Keep showing up." />
      <GlassCard className="mt-6 p-5 sm:p-6">
        <h2 className="font-mono text-xs uppercase tracking-[.18em] text-lime">{copy.bookingTicket.upcoming}</h2>
        <BookingList bookings={upcoming} emptyText={copy.bookingTicket.noUpcoming} />
      </GlassCard>
      <GlassCard className="mt-4 p-5 sm:p-6">
        <h2 className="font-mono text-xs uppercase tracking-[.18em] text-white/50">{copy.bookingTicket.past}</h2>
        <BookingList bookings={past} emptyText={copy.bookingTicket.noPast} />
      </GlassCard>
    </div>
  );
}
