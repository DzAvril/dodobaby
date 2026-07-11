import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, Settings, Syringe, Utensils } from "lucide-react";

export const metadata: Metadata = { title: "更多功能" };

const SECTIONS = [
  { title: "日常记录", description: "计划与餐后补录", items: [
    { href: "/food", title: "辅食日记", description: "辅食计划、食材与实际反馈", icon: Utensils, tone: "food" },
  ] },
  { title: "成长与健康", description: "长期保存的事实档案", items: [
    { href: "/growth", title: "生长记录", description: "体重、身高与头围趋势", icon: ChartNoAxesCombined, tone: "growth" },
    { href: "/vaccines", title: "疫苗记录", description: "接种计划与接种事实", icon: Syringe, tone: "vaccine" },
  ] },
  { title: "家庭空间", description: "资料与家庭配置", items: [
    { href: "/settings", title: "家庭设置", description: "宝宝资料、密码与辅食库", icon: Settings, tone: "settings" },
  ] },
] as const;

export default function MorePage() {
  return <div className="module-page more-page"><header className="module-heading"><div><p className="eyebrow">MORE</p><h1>更多功能</h1><p>手机底栏保留最常即时记录的功能，其余模块仍各自拥有独立页面和清晰入口。</p></div></header><div className="more-sections">{SECTIONS.map((section) => <section className="more-module-section" key={section.title} aria-labelledby={`more-${section.title}`}><div className="more-section-heading"><h2 id={`more-${section.title}`}>{section.title}</h2><span>{section.description}</span></div><div className="more-module-grid">{section.items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`more-module-card ${item.tone}`}><div><Icon /></div><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight /></Link>; })}</div></section>)}</div></div>;
}
