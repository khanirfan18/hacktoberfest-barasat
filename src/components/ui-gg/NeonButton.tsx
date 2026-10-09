import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function NeonButton({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return <button className={cn("rounded-full px-5 py-3 font-semibold transition hover:-translate-y-0.5", variant === "primary" ? "bg-lime text-noir shadow-[0_0_24px_rgba(198,255,61,0.3)]" : "border border-white/10 bg-white/[0.04] text-white", className)} {...props} />;
}
