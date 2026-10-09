import { notFound } from "next/navigation";
import { z } from "zod";
import { TicketPass } from "@/components/ticket/TicketPass";
import { copy } from "@/lib/copy";
import { formatMoney } from "@/lib/format";
import { signToken } from "@/lib/qr";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ticketIdSchema = z.string().uuid();

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = ticketIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Check ticket session: ${userError.message}`);
  if (!user) notFound();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, user_id, slot_start, slot_end, price_minor, currency, status, qr_nonce, checked_in_at, gyms(name, address, cities(timezone))")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Load ticket: ${error.message}`);
  if (!booking) notFound();

  const gym = Array.isArray(booking.gyms) ? booking.gyms[0] : booking.gyms;
  const city = gym && (Array.isArray(gym.cities) ? gym.cities[0] : gym.cities);
  if (!gym || !city?.timezone) notFound();
  const status = z.enum(["confirmed", "checked_in", "cancelled"]).safeParse(booking.status);
  if (!status.success) notFound();

  return (
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      <TicketPass
        bookingId={booking.id}
        gymName={gym.name}
        address={gym.address}
        timezone={city.timezone}
        slotStart={booking.slot_start}
        slotEnd={booking.slot_end}
        price={formatMoney(booking.price_minor, booking.currency)}
        token={status.data === "confirmed" ? signToken(booking) : null}
        initialStatus={status.data}
        initialCheckedInAt={booking.checked_in_at}
      />
      <p className="mt-4 text-center text-xs text-white/35">{copy.bookingTicket.ticketTitle} · {booking.id.slice(0, 8).toUpperCase()}</p>
    </div>
  );
}
