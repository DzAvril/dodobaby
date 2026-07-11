"use client";

import { useRouter } from "next/navigation";
import { BabyForm } from "@/components/DiaryApp";

export function BabySetup() {
  const router = useRouter();
  return (
    <main className="setup-page">
      <section className="setup-card">
        <div className="setup-copy"><p className="eyebrow">WELCOME HOME</p><h1>陪宝宝长大，<br />从认真记录开始。</h1><p>先添加宝宝资料，之后可以分别记录辅食、生长和更多照护事项。</p></div>
        <BabyForm onSaved={() => router.refresh()} />
      </section>
    </main>
  );
}
