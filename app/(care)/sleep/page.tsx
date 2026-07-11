import type { Metadata } from "next";
import { SleepTracker } from "@/components/SleepTracker";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "睡眠记录" };

export default async function SleepPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <SleepTracker baby={baby} />;
}
