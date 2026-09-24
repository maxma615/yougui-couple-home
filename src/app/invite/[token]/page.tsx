"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { HeartHandshake, LoaderCircle } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { PublicShell } from "@/components/app-shell";
import { ErrorState, FieldError, LoadingState, StatusMessage } from "@/components/ui";

type InvitationPreview = { homeName: string; inviterName: string };

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<InvitationPreview>(`/api/invites/${encodeURIComponent(token)}`)
      .then((data) => active && setPreview(data))
      .catch((requestError) => active && setLoadError(errorMessage(requestError)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
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
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PublicShell>
      <section className="auth-card auth-card--wide" aria-labelledby="invite-title">
        {loading ? <LoadingState label="正在查看邀请…" /> : loadError || !preview ? (
          <ErrorState message={loadError || "这个邀请现在无法使用"} />
        ) : (
          <>
            <p className="eyebrow">只差你啦</p>
            <h1 id="invite-title">加入「{preview.homeName}」</h1>
            <p className="auth-card__intro">{preview.inviterName} 邀请你一起记录两个人的生活。请设置你自己的账号和密码。</p>
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
                {saving ? "正在加入…" : "加入小屋"}
              </button>
            </form>
          </>
        )}
      </section>
    </PublicShell>
  );
}
