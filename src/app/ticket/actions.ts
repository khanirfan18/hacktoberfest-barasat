"use server";

import { z } from "zod";
import { copy } from "@/lib/copy";
import { createServerClient } from "@/lib/supabase/server";

export type CancelBookingResult = { success: true } | { success: false; message: string };

export async function cancelTicketBooking(bookingId: string): Promise<CancelBookingResult> {
  const parsedId = z.string().uuid().safeParse(bookingId);
  if (!parsedId.success) return { success: false, message: copy.bookingTicket.bookingNotFound };

  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Check cancellation session: ${userError.message}`);
  if (!user) return { success: false, message: copy.bookingTicket.bookingNotFound };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Check cancellation role: ${profileError.message}`);
  if (profile?.role !== "user") return { success: false, message: copy.bookingTicket.bookingNotFound };

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, user_id")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (bookingError) throw new Error(`Load booking for cancellation: ${bookingError.message}`);
  if (!booking || booking.user_id !== user.id) return { success: false, message: copy.bookingTicket.bookingNotFound };

  const { data: cancelled, error } = await supabase.rpc("cancel_booking", { p_id: parsedId.data });
  if (error || !cancelled) {
    const message = error?.message ?? "";
    if (message.includes("CANCEL_TOO_LATE")) return { success: false, message: copy.bookingTicket.cancelTooLate };
    return { success: false, message: copy.bookingTicket.cancelFailed };
  }
  return { success: true };
}
