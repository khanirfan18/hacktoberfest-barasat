import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getPricingText } from "@/lib/scrape";
import { extractPrice } from "@/lib/price";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the 10 stalest gyms with websites not having owner prices
  const { data: stalestGyms, error } = await adminClient
    .from("gyms")
    .select("id, name, website, price_source, price_scraped_at")
    .not("website", "is", null)
    .neq("price_source", "owner")
    .order("price_scraped_at", { ascending: true, nullsFirst: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const gymsToScrape = (stalestGyms || []).filter((g) => g.website);
  let processed = 0;

  for (const gym of gymsToScrape) {
    try {
      const text = await getPricingText(gym.website, gym.id);
      if (text) {
        await extractPrice(text, { gymId: gym.id, sourceUrl: gym.website });
      }
      processed++;
    } catch {}
  }

  return NextResponse.json({ ok: true, processed });
}
