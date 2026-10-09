"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const reviewInput = z.object({
  gymId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(600),
});

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
