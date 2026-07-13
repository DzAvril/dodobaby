"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, KeyRound, LayoutGrid, LogOut, RotateCw, ShieldOff } from "lucide-react";
import { BabyForm, FoodCatalogManager, PasswordForm, type Baby, type FoodCatalogItem } from "@/components/DiaryApp";
import { MODULE_NAV_ITEMS } from "@/components/navigation-config";
import type { AgentAccessStatus } from "@/lib/agent-access";
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

function formatAgentTokenTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function AgentAccessSettings({ initialStatus }: { initialStatus: AgentAccessStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState<"toggle" | "generate" | "revoke" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const updatedAt = formatAgentTokenTime(status.updatedAt);

  async function changeEnabled(enabled: boolean) {
    setPending("toggle");
    setError("");
    try {
      const data = await jsonRequest<{ status: AgentAccessStatus }>("/api/agent-access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setStatus(data.status);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新失败，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  async function generate() {
    if (status.configured && !window.confirm("生成新 token 后，当前 token 会立即失效。确定继续吗？")) return;
    setPending("generate");
    setError("");
    setCopied(false);
    try {
      const data = await jsonRequest<{ token: string; status: AgentAccessStatus }>("/api/agent-access", { method: "POST" });
      setStatus(data.status);
      setToken(data.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  async function revoke() {
    if (!window.confirm("撤销后，当前 token 将无法继续访问。确定撤销吗？")) return;
    setPending("revoke");
    setError("");
    try {
      const data = await jsonRequest<{ status: AgentAccessStatus }>("/api/agent-access", { method: "DELETE" });
      setStatus(data.status);
      setToken(null);
      setCopied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "撤销失败，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setError("");
    } catch {
      setError("复制失败，请手动选择 token");
    }
  }

  return <div className="settings-section agent-access-settings"><div className="settings-heading"><p className="eyebrow">AGENT ACCESS</p><h3>Agent / MCP 访问</h3><p>使用独立 token 让 Codex MCP 访问记录接口，不影响家庭网页登录。</p></div><div className="agent-access-controls"><label className="agent-access-toggle"><input type="checkbox" role="switch" aria-label="启用 Agent 访问" checked={status.enabled} disabled={pending !== null} onChange={(event) => changeEnabled(event.target.checked)} /><span className="agent-toggle-track" aria-hidden="true"><i /></span><span><strong>Agent 访问</strong><small>{status.enabled ? "已启用" : "已停用"}</small></span></label><div className={`agent-token-status ${status.configured ? "configured" : "empty"}`}><KeyRound /><div><span>Token 状态</span><strong>{status.configured ? "已配置 token" : "未配置 token"}</strong>{status.source === "environment" && <small>当前使用服务器环境变量中的兼容配置</small>}{status.source === "database" && updatedAt && <small>更新于 {updatedAt}</small>}</div></div></div>{token && <div className="agent-token-reveal" role="status"><Bot /><div><strong>新 token 只显示这一次</strong><p>请立即复制到 Codex MCP 配置或本机 token 文件，关闭或刷新后无法找回。</p><code>{token}</code></div><button type="button" className="icon-button" aria-label="复制 Agent token" title="复制 Agent token" onClick={copyToken}>{copied ? <Check /> : <Copy />}</button></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="agent-access-actions"><button type="button" className="secondary-button" disabled={pending !== null} onClick={generate}><RotateCw />{pending === "generate" ? "生成中…" : status.configured ? "生成新 token" : "生成 token"}</button><button type="button" className="secondary-button danger" disabled={pending !== null || !status.configured} onClick={revoke}><ShieldOff />{pending === "revoke" ? "撤销中…" : "撤销 token"}</button></div></div>;
}

export function SettingsPageClient({ initialBaby, initialQuickModules, initialAgentAccess }: { initialBaby: Baby; initialQuickModules: ModuleId[]; initialAgentAccess: AgentAccessStatus }) {
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
        <section className="settings-card"><AgentAccessSettings initialStatus={initialAgentAccess} /></section>
        <section className="settings-card"><div className="settings-section settings-session"><div className="settings-heading"><h3>当前设备</h3><p>在共用或不再使用的设备上退出家庭空间，不会删除任何记录。</p></div>{logoutError && <p className="form-error" role="alert">{logoutError}</p>}<button type="button" className="secondary-button settings-logout-button" disabled={logoutPending} onClick={logout}><LogOut />{logoutPending ? "正在退出…" : "退出登录"}</button></div></section>
      </div>
    </div>
  );
}
