"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, LogIn } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { PublicShell } from "@/components/app-shell";
import { FieldError, StatusMessage } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        body: jsonBody({ email, password }),
      });
      router.replace("/home");
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
        <h1 id="login-title">回到我们的小屋</h1>
        <p className="auth-card__intro">使用管理员创建或邀请加入时设置的独立账号登录。</p>
        <form className="form-stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">邮箱</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fields.email)} />
            <FieldError message={fields.email} />
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
          <p className="field-help"><KeyRound size={14} aria-hidden="true" /> 忘记密码时，请由服务器管理员执行密码重置命令。</p>
        </form>
      </section>
    </PublicShell>
  );
}
