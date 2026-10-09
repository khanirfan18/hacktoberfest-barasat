"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });
export async function signIn(formData: FormData) {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login");
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login");
  redirect("/explore");
}
export async function signUp(formData: FormData) {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/signup");
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) redirect("/signup");
  redirect("/explore");
}
export async function demoSignIn(formData: FormData) {
  const role = z.enum(["traveller", "owner", "admin"]).parse(formData.get("role"));
  const email = `${role === "traveller" ? "traveller" : role}@gymgo.demo`;
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
  if (error) redirect("/login");
  redirect(role === "owner" ? "/owner" : role === "admin" ? "/admin" : "/explore");
}
