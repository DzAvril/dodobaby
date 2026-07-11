import type { Metadata } from "next";
import { DiaperTracker } from "@/components/DiaperTracker";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "尿布记录" };

export default async function DiapersPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <DiaperTracker baby={baby} />;
}
