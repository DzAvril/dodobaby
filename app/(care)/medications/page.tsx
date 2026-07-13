import type { Metadata } from "next";
import { MedicationTracker } from "@/components/MedicationTracker";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "用药记录" };

export default async function MedicationsPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <MedicationTracker baby={baby} />;
}
