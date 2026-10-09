import { formatMoney } from "@/lib/format";
import { Pill } from "./Pill";
export function PriceTag({ amount, currency = "INR", source }: { amount: number | null; currency?: string; source: "Scraped" | "Owner" | "Estimated" }) {
  return <div><p className="font-display text-xl">{formatMoney(amount, currency)}</p><Pill tone={source === "Owner" ? "lime" : source === "Scraped" ? "cyan" : "magenta"}>{source}</Pill></div>;
}
