import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import { MODULE_NAV_ITEMS } from "@/components/navigation-config";
import { getQuickModules } from "@/lib/navigation";

export const metadata: Metadata = { title: "更多功能" };

export default async function MorePage() {
  const quickModules = await getQuickModules();
  const otherItems = MODULE_NAV_ITEMS.filter((item) => !quickModules.includes(item.id));
  const sections = [
    { title: "其他记录", description: "未固定在手机底栏的模块", items: otherItems },
    { title: "家庭空间", description: "资料与家庭配置", items: [
      { href: "/settings", title: "家庭设置", description: "宝宝资料、导航、密码与辅食库", icon: Settings, tone: "settings" },
    ] },
  ];
  return <div className="module-page more-page"><header className="module-heading"><div><p className="eyebrow">MORE</p><h1>更多功能</h1><p>手机底栏保留当前最常用的三个模块，其余记录与家庭设置集中在这里。</p></div></header><div className="more-sections">{sections.map((section) => <section className="more-module-section" key={section.title} aria-labelledby={`more-${section.title}`}><div className="more-section-heading"><h2 id={`more-${section.title}`}>{section.title}</h2><span>{section.description}</span></div><div className="more-module-grid">{section.items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`more-module-card ${item.tone}`}><div><Icon /></div><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight /></Link>; })}</div></section>)}</div></div>;
}
