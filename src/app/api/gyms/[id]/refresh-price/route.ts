import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getPricingText } from "@/lib/scrape";
import { extractPrice } from "@/lib/price";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing gym id" }, { status: 400 });
  }

  // Session authentication check
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Profile check
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Gym lookup
  const { data: gym } = await adminClient
    .from("gyms")
    .select("*")
    .eq("id", id)
    .single();

  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  const isOwner = gym.owner_id === user.id;
  const isSuperAdmin = profile?.role === "super_admin";
  if (!isOwner && !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden: Not gym owner or super admin" }, { status: 403 });
  }

  // Rate limit: min 10 min between runs per gym via scrape_log
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentScrapes } = await adminClient
    .from("scrape_log")
    .select("created_at")
    .eq("gym_id", id)
    .gte("created_at", tenMinutesAgo)
    .limit(1);

  if (recentScrapes && recentScrapes.length > 0) {
    return NextResponse.json(
      { error: "Rate limit: min 10 minutes between scrapes for this gym" },
      { status: 429 }
    );
  }

  if (!gym.website) {
    return NextResponse.json({ error: "Gym does not have a website" }, { status: 400 });
  }

  const isDry = req.nextUrl.searchParams.get("dry") === "1";

  try {
    const pricingText = await getPricingText(gym.website, isDry ? undefined : gym.id);
    if (!pricingText) {
      return NextResponse.json(
        { error: "No pricing information found on website" },
        { status: 404 }
      );
    }

    const priceResult = await extractPrice(
      pricingText,
      isDry ? undefined : { gymId: id, sourceUrl: gym.website }
    );

    if (!priceResult) {
      return NextResponse.json(
        { error: "Could not extract verified price from website" },
        { status: 422 }
      );
    }

    if (isDry) {
      return NextResponse.json({ suggestion: priceResult });
    }

    return NextResponse.json({ ok: true, price: priceResult });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to refresh price" },
      { status: 500 }
    );
  }
}
