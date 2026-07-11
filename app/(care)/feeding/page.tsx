import type { Metadata } from "next";
import { FeedingTracker } from "@/components/FeedingTracker";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "喂养记录" };

export default async function FeedingPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <FeedingTracker baby={baby} />;
}
