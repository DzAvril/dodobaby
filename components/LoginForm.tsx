"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error || "暂时无法登录，请稍后重试");
      setPending(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="family-password">家庭密码</label>
      <div className="password-field">
        <LockKeyhole size={18} aria-hidden="true" />
        <input
          id="family-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="请输入家庭密码"
          required
          autoFocus
        />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button login-button" disabled={pending}>
        {pending ? "正在进入…" : "进入日记"}<ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
