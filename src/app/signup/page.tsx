import Link from "next/link";
import { signUp } from "../actions";
import { NeonButton, GlassCard, SectionTitle } from "@/components/ui-gg";
export default function SignupPage() {
  return <div className="mx-auto max-w-md py-12"><SectionTitle eyebrow="Start moving" title="Create your account" /><GlassCard className="p-6"><form action={signUp} className="space-y-4"><input name="email" type="email" required placeholder="you@example.com" className="w-full rounded-xl border border-white/10 bg-white/5 p-3 outline-none" /><input name="password" type="password" minLength={8} required placeholder="8+ character password" className="w-full rounded-xl border border-white/10 bg-white/5 p-3 outline-none" /><NeonButton className="w-full" type="submit">Create account</NeonButton></form><p className="mt-6 text-center text-sm text-white/50">Already a member? <Link className="text-lime" href="/login">Sign in</Link></p></GlassCard></div>;
}
