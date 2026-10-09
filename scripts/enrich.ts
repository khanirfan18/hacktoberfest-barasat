import { createClient } from "@supabase/supabase-js";
import { getPricingText } from "@/lib/scrape";
import { extractPrice } from "@/lib/price";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    await Promise.all(chunk.map((item) => fn(item)));
  }
}

async function main() {
  const supabase = getAdminClient();

  console.log("Starting GymGo enrichment...");

  // 1. Fetch all gyms with a website that do not have an owner price
  const { data: gyms, error: gymsError } = await supabase
    .from("gyms")
    .select("id, name, website, city_id, price_source, price_minor")
    .not("website", "is", null)
    .neq("price_source", "owner");

  if (gymsError) {
    console.error("Failed to query gyms:", gymsError.message);
    process.exit(1);
  }

  const eligibleGyms = (gyms || []).filter((g) => g.website && g.price_source !== "owner");
  console.log(`Found ${eligibleGyms.length} gyms with websites to scrape (concurrency 2)...`);

  // 2. Scrape with concurrency 2
  await runWithConcurrency(eligibleGyms, 2, async (gym) => {
    try {
      console.log(`[Scrape] Processing: ${gym.name} (${gym.website})`);
      const pricingText = await getPricingText(gym.website, gym.id);
      if (pricingText) {
        const extracted = await extractPrice(pricingText, {
          gymId: gym.id,
          sourceUrl: gym.website,
        });
        if (extracted) {
          console.log(
            `[Price] Saved for ${gym.name}: ${extracted.price_minor} ${extracted.price_currency}`
          );
        } else {
          console.log(`[Price] No valid price extracted for ${gym.name}`);
        }
      } else {
        console.log(`[Scrape] No pricing text found for ${gym.name}`);
      }
    } catch (err: any) {
      console.error(`[Error] Enriching ${gym.name}: ${err?.message || err}`);
    }
  });

  // 3. Fill gyms still without a price with the city median when city has >= 3 scraped prices
  const { data: cities } = await supabase.from("cities").select("id, name, slug, currency");

  for (const city of cities || []) {
    const { data: cityGyms } = await supabase
      .from("gyms")
      .select("id, name, price_minor, price_currency, price_source")
      .eq("city_id", city.id);

    if (!cityGyms) continue;

    const scrapedGyms = cityGyms.filter(
      (g) => g.price_source === "scraped" && g.price_minor !== null
    );

    console.log(
      `City ${city.name}: ${scrapedGyms.length} scraped prices available.`
    );

    if (scrapedGyms.length >= 3) {
      const prices = scrapedGyms.map((g) => g.price_minor as number).sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      const medianMinor =
        prices.length % 2 !== 0
          ? prices[mid]
          : Math.round((prices[mid - 1] + prices[mid]) / 2);

      const medianCurrency = scrapedGyms[0]?.price_currency || city.currency || "INR";

      // Gyms without a price (never overwrite owner price)
      const unpricedGyms = cityGyms.filter(
        (g) =>
          g.price_source !== "owner" &&
          (g.price_source === "none" || g.price_minor === null || !g.price_source)
      );

      console.log(
        `Applying city median ${medianMinor} ${medianCurrency} to ${unpricedGyms.length} unpriced gyms in ${city.name}...`
      );

      for (const unpriced of unpricedGyms) {
        await supabase
          .from("gyms")
          .update({
            price_minor: medianMinor,
            price_currency: medianCurrency,
            price_source: "estimated",
            price_evidence: `City median based on ${scrapedGyms.length} scraped gyms`,
            price_confidence: 0.5,
            price_scraped_at: new Date().toISOString(),
          })
          .eq("id", unpriced.id);
      }
    } else {
      console.log(
        `Skipping median estimation for ${city.name} (< 3 scraped prices).`
      );
    }
  }

  console.log("Enrichment complete.");
}

main().catch((err) => {
  console.error("Enrich failed:", err);
  process.exit(1);
});
