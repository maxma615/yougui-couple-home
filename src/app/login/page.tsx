"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, LogIn } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { PublicShell } from "@/components/app-shell";
import type { SessionData } from "@/components/home-types";
import { FieldError, StatusMessage } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await apiRequest<{ ok: true }>("/api/auth/login", {
        method: "POST",
        body: jsonBody({ identifier, password }),
      });
      const session = await apiRequest<SessionData>("/api/session");
      router.replace(session.user.role === "admin" ? "/admin" : "/home");
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PublicShell>
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">欢迎回来</p>
        <h1 id="login-title">回到我们的空间</h1>
        <p className="auth-card__intro">使用为你配置的手机号和密码登录；原有邮箱账号仍可继续使用。</p>
        <form className="form-stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="login-identifier">登录账号（手机号或邮箱）</label>
            <input id="login-identifier" name="identifier" type="text" inputMode="tel" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} aria-invalid={Boolean(fields.identifier || fields.email)} />
            <FieldError message={fields.identifier || fields.email} />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fields.password)} />
            <FieldError message={fields.password} />
          </div>
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          <button className="button button--wide" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
            {saving ? "正在登录…" : "登录"}
          </button>
          <p className="field-help"><KeyRound size={14} aria-hidden="true" /> 忘记密码时，请联系管理员在管理面板重置。</p>
        </form>
        <section className="entry-guide" aria-labelledby="registration-help">
          <h2 id="registration-help">账号使用说明</h2>
          <p><strong>已有空间：</strong>两位成员的账号由管理员创建并绑定到同一个情侣空间，收到登录信息后即可进入共同空间。</p>
          <p><strong>登录方式：</strong>新账号使用手机号；原有邮箱账号也可继续使用。账号仅供对应成员本人使用。</p>
        </section>
      </section>
    </PublicShell>
  );
}
