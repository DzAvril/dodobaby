"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, Home, LogOut, Settings, Utensils } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { Baby } from "@/components/DiaryApp";
import { formatAge, todayInTimezone } from "@/lib/dates";

const NAV_ITEMS = [
  { href: "/", label: "首页", description: "今日概览", icon: Home },
  { href: "/food", label: "辅食", description: "计划与反馈", icon: Utensils },
  { href: "/growth", label: "生长", description: "测量与趋势", icon: ChartNoAxesCombined },
  { href: "/settings", label: "设置", description: "宝宝与家庭", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ baby, children }: { baby: Baby; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href)) ?? NAV_ITEMS[0];
  const age = formatAge(baby.birthDate, todayInTimezone(baby.timezone));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <main className="care-app">
      <aside className="care-sidebar">
        <Link className="care-brand" href="/" aria-label="小芽日记首页">
          <BrandMark small />
          <span><strong>小芽日记</strong><small>{baby.name} · {age}</small></span>
        </Link>
        <nav className="care-nav" aria-label="主要功能">
          {NAV_ITEMS.slice(0, 3).map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon /><span><strong>{item.label}</strong><small>{item.description}</small></span></Link>;
          })}
        </nav>
        <div className="care-sidebar-footer">
          <Link href="/settings" className={isActive(pathname, "/settings") ? "active" : ""} aria-current={isActive(pathname, "/settings") ? "page" : undefined}><Settings /><span>设置</span></Link>
          <button type="button" onClick={logout}><LogOut /><span>退出登录</span></button>
        </div>
      </aside>

      <div className="care-workspace">
        <header className="care-mobile-header">
          <Link href="/" aria-label="小芽日记首页"><BrandMark small /></Link>
          <div><strong>{current.label}</strong><span>{baby.name} · {age}</span></div>
          <Link href="/settings" aria-label="打开设置"><Settings /></Link>
        </header>
        {children}
      </div>

      <nav className="care-bottom-nav" aria-label="主要功能">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon /><span>{item.label}</span></Link>;
        })}
      </nav>
    </main>
  );
}
