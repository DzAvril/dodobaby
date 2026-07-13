"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, LogOut } from "lucide-react";
import { BabyForm, FoodCatalogManager, PasswordForm, type Baby, type FoodCatalogItem } from "@/components/DiaryApp";
import { MODULE_NAV_ITEMS } from "@/components/navigation-config";
import { jsonRequest } from "@/lib/client-api";
import type { ModuleId } from "@/lib/navigation-preferences";

function QuickModuleSettings({ initialModules, onSaved }: { initialModules: ModuleId[]; onSaved: () => void }) {
  const [modules, setModules] = useState(initialModules);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function changeSlot(index: number, next: ModuleId) {
    setSaved(false);
    setModules((current) => {
      const updated = [...current];
      const duplicateIndex = updated.indexOf(next);
      if (duplicateIndex >= 0) updated[duplicateIndex] = updated[index];
      updated[index] = next;
      return updated;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);
    try {
      await jsonRequest("/api/navigation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quickModules: modules }),
      });
      setSaved(true);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return <form className="settings-section quick-module-settings" onSubmit={submit}><div className="settings-heading"><p className="eyebrow">QUICK ACCESS</p><h3>高频模块</h3><p>三个位置对应手机底栏从左到右，也会决定桌面侧栏高频区域的顺序。</p></div><div className="quick-module-slots">{modules.map((moduleId, index) => <label key={index}><span><b>{index + 1}</b>位置 {index + 1}</span><select value={moduleId} onChange={(event) => changeSlot(index, event.target.value as ModuleId)}>{MODULE_NAV_ITEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>)}</div>{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="form-success" role="status">高频模块已更新</p>}<button type="submit" className="secondary-button" disabled={pending}><LayoutGrid />{pending ? "保存中…" : "保存模块位置"}</button></form>;
}

export function SettingsPageClient({ initialBaby, initialQuickModules }: { initialBaby: Baby; initialQuickModules: ModuleId[] }) {
  const router = useRouter();
  const [baby, setBaby] = useState(initialBaby);
  const [foods, setFoods] = useState<FoodCatalogItem[]>([]);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    let active = true;
    jsonRequest<{ foods: FoodCatalogItem[] }>("/api/foods")
      .then((data) => { if (active) setFoods(data.foods); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setLogoutPending(true);
    setLogoutError("");
    try {
      await jsonRequest("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (caught) {
      setLogoutError(caught instanceof Error ? caught.message : "退出失败，请稍后重试");
      setLogoutPending(false);
    }
  }

  return (
    <div className="module-page settings-page">
      <header className="module-heading"><div><p className="eyebrow">FAMILY SPACE</p><h1>设置</h1><p>宝宝资料、辅食库和家庭安全分别维护，记录内容不会混在一起。</p></div></header>
      <div className="settings-layout">
        <section id="baby-profile" className="settings-card"><BabyForm baby={baby} onSaved={(saved) => { setBaby(saved); router.refresh(); }} /></section>
        <section className="settings-card"><QuickModuleSettings initialModules={initialQuickModules} onSaved={() => router.refresh()} /></section>
        <section className="settings-card"><FoodCatalogManager foods={foods} onChanged={setFoods} /></section>
        <section className="settings-card"><PasswordForm /></section>
        <section className="settings-card"><div className="settings-section settings-session"><div className="settings-heading"><h3>当前设备</h3><p>在共用或不再使用的设备上退出家庭空间，不会删除任何记录。</p></div>{logoutError && <p className="form-error" role="alert">{logoutError}</p>}<button type="button" className="secondary-button settings-logout-button" disabled={logoutPending} onClick={logout}><LogOut />{logoutPending ? "正在退出…" : "退出登录"}</button></div></section>
      </div>
    </div>
  );
}
