import {
  Baby as BabyIcon,
  ChartNoAxesCombined,
  Milk,
  MoonStar,
  Pill,
  Syringe,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "@/lib/navigation-preferences";

export type ModuleNavigationItem = {
  id: ModuleId;
  href: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
};

export const MODULE_NAV_ITEMS: ModuleNavigationItem[] = [
  { id: "food", href: "/food", label: "辅食", title: "辅食日记", description: "计划、食材与实际反馈", icon: Utensils, tone: "food" },
  { id: "feeding", href: "/feeding", label: "喂养", title: "喂养记录", description: "亲喂时长与奶量", icon: Milk, tone: "feeding" },
  { id: "sleep", href: "/sleep", label: "睡眠", title: "睡眠记录", description: "入睡、醒来与每日汇总", icon: MoonStar, tone: "sleep" },
  { id: "diapers", href: "/diapers", label: "尿布", title: "尿布记录", description: "小便、大便与观察", icon: BabyIcon, tone: "diaper" },
  { id: "medications", href: "/medications", label: "用药", title: "用药记录", description: "计划、剂量与实际服用", icon: Pill, tone: "medication" },
  { id: "growth", href: "/growth", label: "生长", title: "生长记录", description: "体重、身高与头围趋势", icon: ChartNoAxesCombined, tone: "growth" },
  { id: "vaccines", href: "/vaccines", label: "疫苗", title: "疫苗记录", description: "接种计划与接种事实", icon: Syringe, tone: "vaccine" },
];

export function navigationItem(id: ModuleId) {
  return MODULE_NAV_ITEMS.find((item) => item.id === id)!;
}
