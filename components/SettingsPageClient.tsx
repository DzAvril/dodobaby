"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { BabyForm, FoodCatalogManager, PasswordForm, type Baby, type FoodCatalogItem } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";

export function SettingsPageClient({ initialBaby }: { initialBaby: Baby }) {
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
        <section className="settings-card"><FoodCatalogManager foods={foods} onChanged={setFoods} /></section>
        <section className="settings-card"><PasswordForm /></section>
        <section className="settings-card"><div className="settings-section settings-session"><div className="settings-heading"><h3>当前设备</h3><p>在共用或不再使用的设备上退出家庭空间，不会删除任何记录。</p></div>{logoutError && <p className="form-error" role="alert">{logoutError}</p>}<button type="button" className="secondary-button settings-logout-button" disabled={logoutPending} onClick={logout}><LogOut />{logoutPending ? "正在退出…" : "退出登录"}</button></div></section>
      </div>
    </div>
  );
}
