"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, Home, LogOut, Settings } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import type { Baby } from "@/components/DiaryApp";
import { MODULE_NAV_ITEMS, navigationItem, type ModuleNavigationItem } from "@/components/navigation-config";
import { formatAge, todayInTimezone } from "@/lib/dates";
import type { ModuleId } from "@/lib/navigation-preferences";

const HOME_ITEM = { href: "/", label: "首页", description: "今日概览", icon: Home } as const;

const SETTINGS_ITEM = { href: "/settings", label: "设置" } as const;
const MORE_ITEM = { href: "/more", label: "更多", icon: Ellipsis } as const;
function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ baby, quickModules, children }: { baby: Baby; quickModules: ModuleId[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const quickItems = quickModules.map(navigationItem);
  const otherItems = MODULE_NAV_ITEMS.filter((item) => !quickModules.includes(item.id));
  const mobileItems = [HOME_ITEM, ...quickItems, MORE_ITEM];
  const current = [HOME_ITEM, ...MODULE_NAV_ITEMS].find((item) => isActive(pathname, item.href))
    ?? (isActive(pathname, SETTINGS_ITEM.href) ? SETTINGS_ITEM : isActive(pathname, MORE_ITEM.href) ? MORE_ITEM : HOME_ITEM);
  const age = formatAge(baby.birthDate, todayInTimezone(baby.timezone));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  function desktopLink(item: typeof HOME_ITEM | ModuleNavigationItem) {
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
          {desktopLink(HOME_ITEM)}
          <p className="care-nav-label">高频记录</p>
          {quickItems.map(desktopLink)}
          <p className="care-nav-label">其他记录</p>
          {otherItems.map(desktopLink)}
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
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === MORE_ITEM.href
            ? isActive(pathname, MORE_ITEM.href) || isActive(pathname, SETTINGS_ITEM.href) || otherItems.some((module) => isActive(pathname, module.href))
            : isActive(pathname, item.href);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon /><span>{item.label}</span></Link>;
        })}
      </nav>
    </main>
  );
}
