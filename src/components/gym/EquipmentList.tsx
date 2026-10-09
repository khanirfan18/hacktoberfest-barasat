"use client";

import { useMemo, useState } from "react";
import { Activity, Bike, Dumbbell, Footprints, HeartPulse, Shield, Waves, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type GymEquipment = {
  key: string;
  name: string;
  category: string;
  icon: string | null;
  quantity: number;
  source: string;
  confirmed: boolean;
};

const categories = ["cardio", "strength", "free_weights", "functional", "recovery", "amenity"];
const iconMap: Record<string, LucideIcon> = {
  Activity, Bike, Dumbbell, Footprints, HeartPulse, Shield, Waves, Zap,
};

function categoryLabel(category: string) {
  return category.replaceAll("_", " ");
}

export function EquipmentList({ equipment, claimHref }: { equipment: GymEquipment[]; claimHref?: string }) {
  const [activeCategory, setActiveCategory] = useState("");
  const visible = useMemo(
    () => equipment.filter((item) => !activeCategory || item.category === activeCategory),
    [activeCategory, equipment],
  );
  const grouped = categories.map((category) => ({
    category,
    items: visible.filter((item) => item.category === category),
  })).filter((group) => group.items.length);

  return (
    <div>
      {equipment.length > 0 ? (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button type="button" aria-pressed={!activeCategory} onClick={() => setActiveCategory("")} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize ${!activeCategory ? "border-lime/35 bg-lime/10 text-lime" : "border-white/10 text-white/55"}`}>All</button>
            {categories.filter((category) => equipment.some((item) => item.category === category)).map((category) => (
              <button key={category} type="button" aria-pressed={activeCategory === category} onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize ${activeCategory === category ? "border-lime/35 bg-lime/10 text-lime" : "border-white/10 text-white/55"}`}>{categoryLabel(category)}</button>
            ))}
          </div>
          <div className="space-y-5">
            {grouped.map(({ category, items }) => (
              <section key={category} aria-label={categoryLabel(category)}>
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-white/40">{categoryLabel(category)}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => {
                    const Icon = item.icon ? iconMap[item.icon] : undefined;
                    return (
                      <div key={item.key} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan/10 text-cyan">{Icon ? <Icon size={17} /> : <Dumbbell size={17} />}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                        <span className="shrink-0 font-mono text-xs text-white/50">×{item.quantity}</span>
                        {item.source === "ai" && item.confirmed && <span className="rounded-full border border-cyan/25 px-2 py-1 text-[9px] text-cyan">AI-detected, owner-confirmed</span>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/55">
          Equipment hasn&apos;t been listed yet.
          {claimHref && <> <a href={claimHref} className="text-lime underline underline-offset-4">Help fill in the details.</a></>}
        </div>
      )}
    </div>
  );
}
