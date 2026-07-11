import type { Metadata } from "next";
import { GrowthTracker } from "@/components/GrowthTracker";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "生长记录" };

export default async function GrowthPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <GrowthTracker baby={baby} />;
}
