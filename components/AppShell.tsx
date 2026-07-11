"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Baby as BabyIcon, ChartNoAxesCombined, Ellipsis, Home, LogOut, Milk, Settings, Syringe, Utensils } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { Baby } from "@/components/DiaryApp";
import { formatAge, todayInTimezone } from "@/lib/dates";

const NAV_ITEMS = [
  { href: "/", label: "首页", description: "今日概览", icon: Home },
  { href: "/food", label: "辅食", description: "计划与反馈", icon: Utensils },
  { href: "/feeding", label: "喂养", description: "亲喂与奶量", icon: Milk },
  { href: "/diapers", label: "尿布", description: "小便与大便", icon: BabyIcon },
  { href: "/growth", label: "生长", description: "测量与趋势", icon: ChartNoAxesCombined },
  { href: "/vaccines", label: "疫苗", description: "计划与接种事实", icon: Syringe },
] as const;

const SETTINGS_ITEM = { href: "/settings", label: "设置" } as const;
const MORE_ITEM = { href: "/more", label: "更多", icon: Ellipsis } as const;
const MOBILE_NAV_ITEMS = [NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2], NAV_ITEMS[3], MORE_ITEM] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function isMoreActive(pathname: string) {
  return [MORE_ITEM.href, "/growth", "/vaccines", SETTINGS_ITEM.href].some((href) => isActive(pathname, href));
}

export function AppShell({ baby, children }: { baby: Baby; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href))
    ?? (isActive(pathname, SETTINGS_ITEM.href) ? SETTINGS_ITEM : isActive(pathname, MORE_ITEM.href) ? MORE_ITEM : NAV_ITEMS[0]);
  const age = formatAge(baby.birthDate, todayInTimezone(baby.timezone));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  function desktopLink(item: (typeof NAV_ITEMS)[number]) {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon /><span><strong>{item.label}</strong><small>{item.description}</small></span></Link>;
  }

  return (
    <main className="care-app">
      <aside className="care-sidebar">
        <Link className="care-brand" href="/" aria-label="小芽日记首页">
          <BrandMark small />
          <span><strong>小芽日记</strong><small>{baby.name} · {age}</small></span>
        </Link>
        <nav className="care-nav" aria-label="主要功能">
          {desktopLink(NAV_ITEMS[0])}
          <p className="care-nav-label">日常记录</p>
          {NAV_ITEMS.slice(1, 4).map(desktopLink)}
          <p className="care-nav-label">健康档案</p>
          {NAV_ITEMS.slice(4).map(desktopLink)}
        </nav>
        <div className="care-sidebar-footer">
          <Link href={SETTINGS_ITEM.href} className={isActive(pathname, SETTINGS_ITEM.href) ? "active" : ""} aria-current={isActive(pathname, SETTINGS_ITEM.href) ? "page" : undefined}><Settings /><span>{SETTINGS_ITEM.label}</span></Link>
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
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.href === MORE_ITEM.href ? isMoreActive(pathname) : isActive(pathname, item.href);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon /><span>{item.label}</span></Link>;
        })}
      </nav>
    </main>
  );
}
