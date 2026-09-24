"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { HeartHandshake, LoaderCircle } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { PublicShell } from "@/components/app-shell";
import type { Home } from "@/components/home-types";
import { FieldError, LoadingState, StatusMessage } from "@/components/ui";
import { SessionProvider, useSession } from "@/hooks/use-session";
import { shanghaiToday } from "@/lib/local-date";

export default function SetupPage() {
  return (
    <SessionProvider requireHome={false}>
      <PublicShell><SetupForm /></PublicShell>
    </SessionProvider>
  );
}

function SetupForm() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.home) router.replace("/home");
    if (session?.user.displayName && !displayName) setDisplayName(session.user.displayName);
  }, [session, router, displayName]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await apiRequest<Home>("/api/home", {
        method: "POST",
        body: jsonBody({ name, displayName, startDate }),
      });
      router.replace("/home");
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="auth-card"><LoadingState label="正在确认账号…" /></section>;
  if (!session || session.home) return null;

  return (
    <section className="auth-card auth-card--wide" aria-labelledby="setup-title">
      <p className="eyebrow">第一次见面</p>
      <h1 id="setup-title">为你们建一间小屋</h1>
      <p className="auth-card__intro">这些内容会出现在共同首页，之后仍可在设置中修改。</p>
      <form className="form-stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="home-name">小屋名称</label>
          <input id="home-name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：我们的海边小屋" aria-invalid={Boolean(fields.name)} />
          <FieldError message={fields.name} />
        </div>
        <div className="field">
          <label htmlFor="display-name">你的名字</label>
          <input id="display-name" maxLength={60} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" aria-invalid={Boolean(fields.displayName)} />
          <FieldError message={fields.displayName} />
        </div>
        <div className="field">
          <label htmlFor="start-date">恋爱开始日期</label>
          <input id="start-date" type="date" max={shanghaiToday()} required value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-invalid={Boolean(fields.startDate)} />
          <p className="field-help">以中国标准时间的日历日期计算，当天记为第 1 天。</p>
          <FieldError message={fields.startDate} />
        </div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <button className="button button--wide" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={18} /> : <HeartHandshake size={18} />}
          {saving ? "正在创建…" : "创建小屋"}
        </button>
      </form>
    </section>
  );
}
