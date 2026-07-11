import type { Metadata } from "next";
import { SettingsPageClient } from "@/components/SettingsPageClient";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "设置" };

export default async function SettingsPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <SettingsPageClient initialBaby={baby} />;
}
