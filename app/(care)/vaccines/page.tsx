import type { Metadata } from "next";
import { VaccinationTracker } from "@/components/VaccinationTracker";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "疫苗记录" };

export default async function VaccinesPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <VaccinationTracker baby={baby} />;
}
