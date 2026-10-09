import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export type Role = "user" | "owner" | "super_admin";

export async function requireRole(role: Role) {
  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Check authorization session: ${userError.message}`);
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Load authorization role: ${profileError.message}`);
  const userRole = profile?.role;
  if (userRole !== role && !(role === "user" && userRole === "owner")) redirect("/");
  return user;
}
