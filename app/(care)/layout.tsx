import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BabySetup } from "@/components/BabySetup";
import { isAuthenticated } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { getQuickModules } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export default async function CareLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAuthenticated())) redirect("/login");
  const [baby, quickModules] = await Promise.all([getCurrentBaby(), getQuickModules()]);
  if (!baby) return <BabySetup />;
  return <AppShell baby={baby} quickModules={quickModules}>{children}</AppShell>;
}
