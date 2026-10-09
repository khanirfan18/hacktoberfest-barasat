import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[20px] border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl", className)} {...props} />;
}
