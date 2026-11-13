"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(json.error ?? "登录失败");
      window.location.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
      setBusy(false);
    }
  };

  return (
    <main className="p-login">
      <form className="p-login-card" onSubmit={submit}>
        <div className="p-login-brand">
          <span className="p-mark" />
          <span>足迹</span>
        </div>
        <h1>进入学习系统</h1>
        <p>输入访问密码。数据只保存在这台设备上。</p>
        <label className="p-field">
          密码
          <input
            className="p-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入访问密码"
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error ? <p className="p-login-error">{error}</p> : null}
        <button className="p-button primary p-login-submit" type="submit" disabled={busy || !password}>
          {busy ? "正在进入…" : "进入"}
        </button>
        <small>访问密码由部署环境变量 `APP_PASSWORD` 控制。</small>
      </form>
    </main>
  );
}