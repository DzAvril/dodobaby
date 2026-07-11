import type { Metadata } from "next";
import { HomeDashboard } from "@/components/HomeDashboard";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "今日首页" };

export default async function HomePage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <HomeDashboard baby={baby} />;
}
