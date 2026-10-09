"use server";

import { z } from "zod";
import { copy } from "@/lib/copy";
import { captureError } from "@/lib/monitoring";
import { createServerClient } from "@/lib/supabase/server";

const bookingInput = z.object({
  gymId: z.string().uuid(),
  slotStart: z.string().datetime({ offset: true }),
  returnTo: z.string().max(500),
});

const reviewInput = z.object({
  gymId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(600),
});

export type BookingSubmissionResult =
  | { success: true; bookingId: string }
  | { success: false; message: string; loginUrl?: string };

function bookingErrorMessage(message: string): string {
  if (message.includes("SLOT_FULL")) return copy.bookingTicket.slotFull;
  if (message.includes("OUTSIDE_OPENING_HOURS")) return copy.bookingTicket.closedHour;
  if (message.includes("SLOT_IN_PAST")) return copy.bookingTicket.inPast;
  if (message.includes("EXCEEDS_7_DAYS")) return copy.bookingTicket.tooFarAhead;
  if (message.includes("ALREADY_BOOKED")) return copy.bookingTicket.alreadyBooked;
  if (message.includes("PRICE_NOT_AVAILABLE")) return copy.bookingTicket.priceUnavailable;
  return copy.bookingTicket.bookingFailed;
}

function safeGymReturnPath(value: string, slotStart: string): string {
  try {
    const destination = new URL(value, "https://gymgo.invalid");
    if (destination.origin !== "https://gymgo.invalid" || !destination.pathname.startsWith("/gym/")) return "/explore";
    destination.searchParams.set("slotStart", slotStart);
    return `${destination.pathname}${destination.search}`;
  } catch {
    return "/explore";
  }
}

export async function bookGymSlot(input: {
  gymId: string;
  slotStart: string;
  returnTo: string;
}): Promise<BookingSubmissionResult> {
  const parsed = bookingInput.safeParse(input);
  if (!parsed.success) return { success: false, message: copy.bookingTicket.bookingFailed };

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw new Error(`Check booking session: ${userError.message}`);
    if (!user) {
      const destination = safeGymReturnPath(parsed.data.returnTo, parsed.data.slotStart);
      return {
        success: false,
        message: copy.bookingTicket.signInRequired,
        loginUrl: `/login?next=${encodeURIComponent(destination)}`,
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(`Check booking role: ${profileError.message}`);
    if (profile?.role !== "user") return { success: false, message: copy.bookingTicket.travellerOnly };

    const { data: bookingId, error } = await supabase.rpc("book_slot", {
      p_gym: parsed.data.gymId,
      p_start: parsed.data.slotStart,
    });
    if (error || !bookingId) {
      const message = error?.message ?? "";
      if (message.includes("AUTH_REQUIRED")) {
        const destination = safeGymReturnPath(parsed.data.returnTo, parsed.data.slotStart);
        return {
          success: false,
          message: copy.bookingTicket.signInRequired,
          loginUrl: `/login?next=${encodeURIComponent(destination)}`,
        };
      }
      return { success: false, message: bookingErrorMessage(message) };
    }
    return { success: true, bookingId };
  } catch (error) {
    captureError("booking", error, {
      gym_id: parsed.data.gymId,
      route: "/gym/[slug]",
    });
    return { success: false, message: copy.bookingTicket.bookingFailed };
  }
}

export type ReviewSubmissionResult =
  | { success: true; review: { id: string; rating: number; body: string; verified: boolean; createdAt: string } }
  | { success: false; message: string };

export async function submitGymReview(formData: FormData): Promise<ReviewSubmissionResult> {
  const parsed = reviewInput.safeParse({
    gymId: formData.get("gymId"),
    rating: formData.get("rating"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { success: false, message: "Check the rating and review text, then try again." };

  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Check review session: ${userError.message}`);
  if (!user) return { success: false, message: "Sign in to write a review." };
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Check review role: ${profileError.message}`);
  if (!profile || profile.role !== "user") return { success: false, message: "Only traveller accounts can review gyms." };

  const { data: reviewId, error } = await supabase.rpc("submit_review", {
    p_gym: parsed.data.gymId,
    p_rating: parsed.data.rating,
    p_body: parsed.data.body || null,
  });
  if (error || !reviewId) {
    return { success: false, message: error?.message ?? "The review could not be saved." };
  }

  const { data: review, error: reviewError } = await supabase
    .from("reviews")
    .select("id, rating, body, verified, created_at")
    .eq("id", reviewId)
    .maybeSingle();
  if (reviewError) throw new Error(`Load submitted review: ${reviewError.message}`);
  if (!review) throw new Error("Load submitted review: no review returned");
  return {
    success: true,
    review: {
      id: review.id,
      rating: review.rating,
      body: review.body ?? "",
      verified: review.verified,
      createdAt: review.created_at,
    },
  };
}
