import type { Metadata } from "next";
import { SettingsPageClient } from "@/components/SettingsPageClient";
import { getAgentAccessStatus } from "@/lib/agent-access";
import { getCurrentBaby } from "@/lib/meals";
import { getQuickModules } from "@/lib/navigation";

export const metadata: Metadata = { title: "设置" };

export default async function SettingsPage() {
  const [baby, quickModules] = await Promise.all([getCurrentBaby(), getQuickModules()]);
  if (!baby) return null;
  return <SettingsPageClient initialBaby={baby} initialQuickModules={quickModules} initialAgentAccess={getAgentAccessStatus()} />;
}
