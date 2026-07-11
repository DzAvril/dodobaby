import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/components/LoginForm";
import { isAuthenticated } from "@/lib/auth";

export const metadata: Metadata = { title: "家庭登录" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  return (
    <main className="login-page">
      <section className="login-card">
        <BrandMark />
        <p className="eyebrow">FAMILY BABY JOURNAL</p>
        <h1>小芽日记</h1>
        <p className="login-intro">把吃饭、成长和每一次用心照护，安心记在一起。</p>
        <LoginForm />
        <p className="login-note">这是家庭共享空间，请使用部署时设置的家庭密码。</p>
      </section>
    </main>
  );
}
