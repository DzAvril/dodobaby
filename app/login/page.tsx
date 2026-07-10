import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { isAuthenticated } from "@/lib/auth";

export const metadata: Metadata = { title: "家庭登录" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark" aria-hidden="true"><span>辅</span></div>
        <p className="eyebrow">FAMILY FOOD DIARY</p>
        <h1>宝宝辅食日记</h1>
        <p className="login-intro">把每天的小菜单和小反应，认真留在一处。</p>
        <LoginForm />
        <p className="login-note">这是家庭共享空间，请使用部署时设置的家庭密码。</p>
      </section>
    </main>
  );
}
