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

async function main(): Promise<void> {
  const supabase = adminClient();
  const cityCount = await seedCities(supabase);
  const equipmentCount = await seedEquipment(supabase);
  const userCount = await seedUsers(supabase);
  console.log(`Seed complete: cities=${cityCount}, equipment_types=${equipmentCount}, users=${userCount}.`);
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
