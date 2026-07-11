"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BabyForm, FoodCatalogManager, PasswordForm, type Baby, type FoodCatalogItem } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";

export function SettingsPageClient({ initialBaby }: { initialBaby: Baby }) {
  const router = useRouter();
  const [baby, setBaby] = useState(initialBaby);
  const [foods, setFoods] = useState<FoodCatalogItem[]>([]);

  useEffect(() => {
    let active = true;
    jsonRequest<{ foods: FoodCatalogItem[] }>("/api/foods")
      .then((data) => { if (active) setFoods(data.foods); });
    return () => { active = false; };
  }, []);

  return (
    <div className="module-page settings-page">
      <header className="module-heading"><div><p className="eyebrow">FAMILY SPACE</p><h1>设置</h1><p>宝宝资料、辅食库和家庭安全分别维护，记录内容不会混在一起。</p></div></header>
      <div className="settings-layout">
        <section className="settings-card"><BabyForm baby={baby} onSaved={(saved) => { setBaby(saved); router.refresh(); }} /></section>
        <section className="settings-card"><FoodCatalogManager foods={foods} onChanged={setFoods} /></section>
        <section className="settings-card"><PasswordForm /></section>
      </div>
    </div>
  );
}
