"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { HeartHandshake, HeartOff, LoaderCircle, LogIn, ShieldQuestion } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { PublicShell } from "@/components/app-shell";
import { FieldError, LoadingState, StatusMessage } from "@/components/ui";

type InvitationPreview = { homeName: string; inviterName: string };

type InvitationPhase =
  | { kind: "loading" }
  | { kind: "invalid"; reason: string }
  | { kind: "ready"; preview: InvitationPreview }
  | { kind: "full"; homeName: string };

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<InvitationPhase>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setPhase({ kind: "loading" });
    apiRequest<InvitationPreview>(`/api/invites/${encodeURIComponent(token)}`)
      .then((data) => active && setPhase({ kind: "ready", preview: data }))
      .catch((requestError) => active && setPhase({ kind: "invalid", reason: errorMessage(requestError) }));
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await apiRequest<{ ok: true }>(`/api/invites/${encodeURIComponent(token)}`, {
        method: "POST",
        body: jsonBody({ email, displayName, password }),
      });
      router.replace("/home");
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFields(requestError.fields);
        // 满员是终态：展示原因并移除加入表单，避免继续尝试。
        if (requestError.status === 409 && requestError.code === "home_full") {
          setPhase((current) => ({ kind: "full", homeName: current.kind === "ready" ? current.preview.homeName : "空间" }));
          setSaving(false);
          return;
        }
      }
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PublicShell>
      <section className="auth-card auth-card--wide" aria-labelledby="invite-title">
        {phase.kind === "loading" ? <LoadingState label="正在查看邀请…" /> : null}
        {phase.kind === "invalid" ? (
          <div className="invite-closed" role="alert">
            <ShieldQuestion size={30} aria-hidden="true" />
            <h1 id="invite-title">这个邀请无法加入</h1>
            <p className="auth-card__intro">{phase.reason}。邀请链接只能使用一次，过期或加入后都会失效。</p>
            <p className="field-help">空间内容不会在这里显示。请让空间里的成员重新生成一条邀请，或直接用你已有的账号进入。</p>
            <Link className="button button--secondary" href="/login"><LogIn size={17} /> 去登录</Link>
          </div>
        ) : null}
        {phase.kind === "full" ? (
          <div className="invite-closed" role="alert">
            <HeartOff size={30} aria-hidden="true" />
            <h1 id="invite-title">空间已经满员</h1>
            <p className="auth-card__intro">「{phase.homeName}」已有两位成员。一条邀请只能加入一人，晚到的人无法再进入。</p>
            <p className="field-help">这个空间的内容不会在这里显示。如果你是成员之一，直接登录即可。</p>
            <Link className="button button--secondary" href="/login"><LogIn size={17} /> 去登录</Link>
          </div>
        ) : null}
        {phase.kind === "ready" ? (
          <>
            <p className="eyebrow">只差你啦</p>
            <h1 id="invite-title">加入「{phase.preview.homeName}」</h1>
            <p className="auth-card__intro">{phase.preview.inviterName} 邀请你一起记录两个人的生活。请设置你自己的账号和密码。</p>
            <form className="form-stack" onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="invite-name">你的名字</label>
                <input id="invite-name" maxLength={60} autoComplete="name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} aria-invalid={Boolean(fields.displayName)} />
                <FieldError message={fields.displayName} />
              </div>
              <div className="field">
                <label htmlFor="invite-email">邮箱</label>
                <input id="invite-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fields.email)} />
                <FieldError message={fields.email} />
              </div>
              <div className="field">
                <label htmlFor="invite-password">设置密码</label>
                <input id="invite-password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fields.password)} />
                <p className="field-help">至少 12 个字符，仅用于你的独立账号。</p>
                <FieldError message={fields.password} />
              </div>
              {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
              <button className="button button--wide" type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={18} /> : <HeartHandshake size={18} />}
                {saving ? "正在加入…" : "加入空间"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </PublicShell>
  );
}
