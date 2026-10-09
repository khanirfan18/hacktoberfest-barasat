import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type CitySeed = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  currency: string;
  slug: string;
};

const requiredVariables = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_PASSWORD"] as const;
const missingVariables = requiredVariables.filter((name) => !process.env[name]);
if (missingVariables.length > 0) {
  console.error(`GymGo seed: missing ${missingVariables.join(", ")}.`);
  process.exit(1);
}

const cities: Record<string, CitySeed> = {
  barasat: { name: "Barasat", country: "West Bengal, India", lat: 22.7215, lng: 88.4829, timezone: "Asia/Kolkata", currency: "INR", slug: "barasat" },
  barrackpore: { name: "Barrackpore", country: "West Bengal, India", lat: 22.7665, lng: 88.3686, timezone: "Asia/Kolkata", currency: "INR", slug: "barrackpore" },
  kolkata: { name: "Kolkata", country: "West Bengal, India", lat: 22.5726, lng: 88.3639, timezone: "Asia/Kolkata", currency: "INR", slug: "kolkata" },
};

const equipmentTypes = [
  ["treadmill", "Treadmill", "cardio"], ["elliptical", "Elliptical Trainer", "cardio"], ["rower", "Rowing Machine", "cardio"],
  ["assault_bike", "Assault AirBike", "cardio"], ["spin_bike", "Spin Bike", "cardio"], ["stair_climber", "Stair Climber", "cardio"],
  ["squat_rack", "Squat Rack", "strength"], ["power_rack", "Power Rack", "strength"], ["smith_machine", "Smith Machine", "strength"],
  ["bench_press", "Flat Bench Press", "strength"], ["incline_bench", "Incline Bench Press", "strength"], ["dumbbells", "Dumbbells Set", "free_weights"],
  ["kettlebells", "Kettlebells", "free_weights"], ["barbells", "Olympic Barbells & Plates", "free_weights"], ["deadlift_platform", "Deadlift Platform", "free_weights"],
  ["cable_machine", "Cable Crossover Machine", "strength"], ["lat_pulldown", "Lat Pulldown", "strength"], ["leg_press", "Leg Press", "strength"],
  ["leg_curl", "Leg Curl / Extension", "strength"], ["chest_press", "Chest Press Machine", "strength"], ["shoulder_press", "Shoulder Press Machine", "strength"],
  ["pec_deck", "Pec Deck / Rear Delt Fly", "strength"], ["hack_squat", "Hack Squat", "strength"], ["calf_raise", "Calf Raise Machine", "strength"],
  ["preacher_curl", "Preacher Curl Bench", "strength"], ["pull_up_bar", "Pull-Up Bar", "strength"], ["dip_station", "Dip Station", "strength"],
  ["battle_ropes", "Battle Ropes", "functional"], ["plyo_box", "Plyo Box Set", "functional"], ["sled", "Push / Pull Sled", "functional"],
  ["trx", "TRX Suspension Trainer", "functional"], ["medicine_balls", "Medicine / Slam Balls", "functional"], ["yoga_mats", "Yoga Mats", "functional"],
  ["stretching_area", "Dedicated Stretching Area", "amenity"], ["sauna", "Infrared / Finnish Sauna", "recovery"], ["steam_room", "Steam Room", "recovery"],
  ["showers", "Private Showers", "amenity"], ["lockers", "Secure Lockers", "amenity"], ["free_wifi", "High-Speed Free Wi-Fi", "amenity"],
  ["parking", "Free Member Parking", "amenity"],
] as const;

const demoUsers = [
  { email: "traveller@gymgo.demo", role: "user", display_name: "Traveller" },
  { email: "owner@gymgo.demo", role: "owner", display_name: "Gym Owner" },
  { email: "admin@gymgo.demo", role: "super_admin", display_name: "Admin" },
] as const;

function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assertNoError(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function seedCities(supabase: SupabaseClient): Promise<number> {
  const configured = (process.env.DEMO_CITIES ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const names = [...new Set([...configured, "Kolkata"])];
  const rows: CitySeed[] = [];
  for (const name of names) {
    const city = cities[name.toLowerCase()];
    if (!city) {
      console.log(`Unknown city skipped: ${name}`);
      continue;
    }
    rows.push(city);
  }
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("cities").upsert(rows, { onConflict: "slug" });
  assertNoError("cities", error);
  return rows.length;
}

async function seedEquipment(supabase: SupabaseClient): Promise<number> {
  const rows = equipmentTypes.map(([key, name, category]) => ({ key, name, category }));
  const { error } = await supabase.from("equipment_types").upsert(rows, { onConflict: "key", ignoreDuplicates: false });
  assertNoError("equipment types", error);
  return rows.length;
}

async function seedUsers(supabase: SupabaseClient): Promise<number> {
  let created = 0;
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  assertNoError("list users", listError);
  for (const demoUser of demoUsers) {
    let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === demoUser.email);
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: demoUser.email,
        password: process.env.DEMO_PASSWORD!,
        email_confirm: true,
      });
      assertNoError(`create ${demoUser.role}`, error);
      if (!data.user) throw new Error(`create ${demoUser.role}: no user returned`);
      user = data.user;
      created += 1;
    }
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      role: demoUser.role,
      display_name: demoUser.display_name,
    }, { onConflict: "id" });
    assertNoError(`profile ${demoUser.role}`, error);
  }
  return created;
}

const DESCRIPTIONS = [
  "Premier fitness center offering heavy lifting platforms, dumbbells up to 50kg, and dedicated cardio zones.",
  "Community-driven strength gym equipped with Olympic barbells, power racks, functional turf, and private shower facilities.",
  "Modern athletic facility featuring calibrated weight plates, cable crossover stations, and dedicated recovery spaces.",
];

const DEFAULT_OPENING_HOURS = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["06:00", "22:00"]]])
);

const REALISTIC_PRICES = [15000, 22000, 30000, 18000, 25000, 35000, 20000, 28000, 40000];

async function seedClaims(supabase: SupabaseClient): Promise<{ count: number; claimedGyms: Array<{ id: string; name: string; slug: string; city: string; priceMinor: number }> }> {
  // Find owner user
  const { data: listed } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const ownerUser = listed?.users.find((u) => u.email?.toLowerCase() === "owner@gymgo.demo");
  if (!ownerUser) {
    console.warn("owner@gymgo.demo not found, skipping gym claims.");
    return { count: 0, claimedGyms: [] };
  }

  // Fetch available equipment types
  const { data: eqTypes, error: eqError } = await supabase.from("equipment_types").select("id, key, name");
  assertNoError("fetch equipment types for claims", eqError);
  if (!eqTypes || eqTypes.length === 0) {
    return { count: 0, claimedGyms: [] };
  }

  // Fetch all cities
  const { data: citiesList, error: citiesError } = await supabase.from("cities").select("id, name, slug");
  assertNoError("fetch cities for claims", citiesError);

  const claimedGyms: Array<{ id: string; name: string; slug: string; city: string; priceMinor: number }> = [];

  let globalClaimIdx = 0;
  for (const city of citiesList || []) {
    // Select up to 3 gyms in this city (deterministic order)
    const { data: cityGyms, error: gymsError } = await supabase
      .from("gyms")
      .select("id, name, slug, status, owner_id")
      .eq("city_id", city.id)
      .order("created_at", { ascending: true })
      .limit(3);

    assertNoError(`fetch gyms for city ${city.name}`, gymsError);

    const claimedIdsInCity: string[] = [];

    for (const gym of cityGyms || []) {
      claimedIdsInCity.push(gym.id);
      const description = DESCRIPTIONS[globalClaimIdx % DESCRIPTIONS.length];
      const priceMinor = REALISTIC_PRICES[globalClaimIdx % REALISTIC_PRICES.length];
      globalClaimIdx++;

      // Claim gym for owner@gymgo.demo with realistic price and opening hours
      const { error: updateError } = await supabase
        .from("gyms")
        .update({
          owner_id: ownerUser.id,
          status: "claimed",
          capacity_per_hour: 8,
          description,
          price_minor: priceMinor,
          price_currency: "INR",
          price_source: "owner",
          opening_hours: DEFAULT_OPENING_HOURS,
          hours_estimated: false,
        })
        .eq("id", gym.id);

      assertNoError(`claim gym ${gym.name}`, updateError);

      // Seed 4-6 equipment rows for this gym
      const numEquipment = 4 + (globalClaimIdx % 3); // 4, 5, or 6
      const startOffset = (globalClaimIdx * 5) % eqTypes.length;
      const selectedEquipment: Array<{ id: string; key: string; name: string }> = [];
      for (let i = 0; i < numEquipment; i++) {
        selectedEquipment.push(eqTypes[(startOffset + i) % eqTypes.length]);
      }

      const eqRows = selectedEquipment.map((eq) => ({
        gym_id: gym.id,
        equipment_type_id: eq.id,
        quantity: 2,
        source: "seed" as const,
        confirmed: true,
      }));

      const { error: insertEqError } = await supabase
        .from("gym_equipment")
        .upsert(eqRows, { onConflict: "gym_id,equipment_type_id" });

      assertNoError(`seed equipment for gym ${gym.name}`, insertEqError);

      claimedGyms.push({
        id: gym.id,
        name: gym.name,
        slug: gym.slug,
        city: city.name,
        priceMinor,
      });
    }

    // Unclaim any stray claimed gyms in this city to keep exactly 3 per city
    if (claimedIdsInCity.length > 0) {
      await supabase
        .from("gyms")
        .update({
          owner_id: null,
          status: "unclaimed",
          price_source: "none",
          price_minor: null,
          price_currency: null,
        })
        .eq("city_id", city.id)
        .not("id", "in", `(${claimedIdsInCity.join(",")})`)
        .eq("status", "claimed");
    }
  }

  return { count: claimedGyms.length, claimedGyms };
}

async function main(): Promise<void> {
  const supabase = adminClient();
  const cityCount = await seedCities(supabase);
  const equipmentCount = await seedEquipment(supabase);
  const userCount = await seedUsers(supabase);
  const { count: claimsCount, claimedGyms } = await seedClaims(supabase);
  console.log(`Seed complete: cities=${cityCount}, equipment_types=${equipmentCount}, users=${userCount}, claimed_gyms=${claimsCount}.`);

  if (claimedGyms.length > 0) {
    console.log("\nGyms to give real photos:");
    for (const g of claimedGyms) {
      console.log(`- [${g.city}] ${g.name} (slug: ${g.slug}, id: ${g.id})`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});

