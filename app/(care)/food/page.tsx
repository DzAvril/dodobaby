import type { Metadata } from "next";
import { DiaryApp } from "@/components/DiaryApp";
import { getCurrentBaby } from "@/lib/meals";

export const metadata: Metadata = { title: "辅食日记" };

export default async function FoodPage() {
  const baby = await getCurrentBaby();
  if (!baby) return null;
  return <DiaryApp baby={baby} />;
}
