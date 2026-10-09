import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export type Role = "user" | "owner" | "super_admin";

export async function requireRole(role: Role) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const userRole = (user.user_metadata?.role as Role | undefined) ?? "user";
  if (userRole !== role && !(role === "user" && userRole !== "super_admin")) redirect("/");
  return user;
}
