import { requireRole } from "@/lib/auth";
import { GlassCard, SectionTitle } from "@/components/ui-gg";
export const dynamic = "force-dynamic";
export default async function ClaimPage({ params }: { params: Promise<{ gymId: string }> }) { await requireRole("owner"); const { gymId } = await params; return <div className="mx-auto max-w-lg py-8"><SectionTitle eyebrow="Claim a gym" title={`Make ${gymId} yours.`} /><GlassCard className="p-6"><p className="text-sm text-white/60">Submit proof of ownership and we&apos;ll review it.</p><button className="mt-6 rounded-full bg-lime px-5 py-3 font-semibold text-noir">Start claim</button></GlassCard></div>; }
