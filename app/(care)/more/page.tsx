import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, Settings, Syringe } from "lucide-react";

export const metadata: Metadata = { title: "更多功能" };

const ITEMS = [
  { href: "/growth", title: "生长记录", description: "体重、身高与头围趋势", icon: ChartNoAxesCombined, tone: "growth" },
  { href: "/vaccines", title: "疫苗记录", description: "接种计划与接种事实", icon: Syringe, tone: "vaccine" },
  { href: "/settings", title: "家庭设置", description: "宝宝资料、密码与辅食库", icon: Settings, tone: "settings" },
] as const;

export default function MorePage() {
  return <div className="module-page more-page"><header className="module-heading"><div><p className="eyebrow">MORE</p><h1>更多功能</h1><p>低频健康档案与家庭设置保持独立入口，日常高频记录留在手机底栏。</p></div></header><section className="more-module-grid" aria-label="更多功能">{ITEMS.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`more-module-card ${item.tone}`}><div><Icon /></div><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight /></Link>; })}</section></div>;
}
