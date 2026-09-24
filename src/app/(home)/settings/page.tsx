"use client";

import { useState, type FormEvent } from "react";
import { Check, Clipboard, KeyRound, LoaderCircle, Send, Settings2 } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { ConflictForm, type ConflictRecord } from "@/components/conflict-form";
import type { Home } from "@/components/home-types";
import { FieldError, PageHeader, StatusMessage, formatShanghaiTime } from "@/components/ui";
import { useSession } from "@/hooks/use-session";
import { shanghaiToday } from "@/lib/local-date";

type HomeDraft = ConflictRecord & {
  name: string;
  startDate: string;
  firstMember: string;
  secondMember: string;
};

function toDraft(home: Home): HomeDraft {
  return {
    name: home.name,
    startDate: home.startDate,
    firstMember: home.members[0]?.displayName || "",
    secondMember: home.members[1]?.displayName || "",
  };
}

export default function SettingsPage() {
  const { session } = useSession();
  if (!session?.home) return null;
  return (
    <>
      <PageHeader eyebrow="两个人的小屋" title="设置" description="管理小屋资料、邀请和你的账号密码。" />
      <div className="settings-grid">
        <HomeSettings home={session.home} />
        <div className="detail-stack">
          <InviteSettings home={session.home} />
          <PasswordSettings />
        </div>
      </div>
    </>
  );
}

function HomeSettings({ home }: { home: Home }) {
  const { refreshSession } = useSession();
  const [draft, setDraft] = useState<HomeDraft>(() => toDraft(home));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Home | null>(null);
  const [baseVersion, setBaseVersion] = useState(home.version);
  const firstMemberError = fields["members.0.displayName"] || fields.firstMember || fields.members;
  const secondMemberError = fields["members.1.displayName"] || fields.secondMember || fields.members;

  async function save(version = baseVersion) {
    setSaving(true);
    setMessage(null);
    setFields({});
    try {
      const updated = await apiRequest<Home>("/api/home", {
        method: "PATCH",
        body: jsonBody({
          name: draft.name,
          startDate: draft.startDate,
          members: home.members.map((member, index) => ({
            id: member.id,
            displayName: index === 0 ? draft.firstMember : draft.secondMember,
          })),
          version,
        }),
      });
      setDraft(toDraft(updated));
      setBaseVersion(updated.version);
      setTone("success");
      setMessage("小屋资料已保存。");
      setConflict(null);
      await refreshSession();
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFields(requestError.fields);
        if (requestError.status === 409 && requestError.current) setConflict(requestError.current as Home);
      }
      setTone("error");
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-card form-card--wide">
      <div className="settings-heading"><div><p className="eyebrow">共同资料</p><h2>小屋信息</h2></div><Settings2 size={25} color="var(--home-accent)" /></div>
      <form className="form-stack" style={{ marginTop: "1rem" }} onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }} noValidate>
        <div className="field">
          <label htmlFor="settings-home-name">小屋名称</label>
          <input id="settings-home-name" maxLength={120} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} aria-invalid={Boolean(fields.name)} />
          <FieldError message={fields.name} />
        </div>
        <div className="field">
          <label htmlFor="settings-start-date">恋爱开始日期</label>
          <input id="settings-start-date" type="date" max={shanghaiToday()} required value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} aria-invalid={Boolean(fields.startDate)} />
          <FieldError message={fields.startDate} />
        </div>
        <div className="field">
          <label htmlFor="settings-first-member">第一位成员</label>
          <input id="settings-first-member" maxLength={60} required value={draft.firstMember} onChange={(event) => setDraft({ ...draft, firstMember: event.target.value })} aria-invalid={Boolean(firstMemberError)} />
          <FieldError message={firstMemberError} />
        </div>
        {home.members[1] ? (
          <div className="field">
            <label htmlFor="settings-second-member">第二位成员</label>
            <input id="settings-second-member" maxLength={60} required value={draft.secondMember} onChange={(event) => setDraft({ ...draft, secondMember: event.target.value })} aria-invalid={Boolean(secondMemberError)} />
            <FieldError message={secondMemberError} />
          </div>
        ) : null}
        {message ? <StatusMessage tone={tone}>{message}</StatusMessage> : null}
        <button className="button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{saving ? "正在保存…" : "保存小屋资料"}</button>
      </form>
      {conflict ? (
        <ConflictForm
          current={toDraft(conflict)}
          mine={draft}
          currentVersion={conflict.version}
          fields={[
            { key: "name", label: "小屋名称" },
            { key: "startDate", label: "恋爱开始日期" },
            { key: "firstMember", label: "第一位成员" },
            { key: "secondMember", label: "第二位成员" },
          ]}
          onReload={() => { setDraft(toDraft(conflict)); setBaseVersion(conflict.version); setConflict(null); setMessage(null); }}
          onRetry={(version) => save(version)}
          retrying={saving}
        />
      ) : null}
    </section>
  );
}

function InviteSettings({ home }: { home: Home }) {
  const [invitation, setInvitation] = useState<{ token: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const full = home.members.length >= 2;
  const inviteUrl = invitation && typeof window !== "undefined" ? `${window.location.origin}/invite/${invitation.token}` : "";

  async function createInvitation() {
    setSaving(true);
    setMessage(null);
    try {
      setInvitation(await apiRequest<{ token: string; expiresAt: string }>("/api/invites", { method: "POST", body: jsonBody({}) }));
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setMessage("无法自动复制，请长按邀请链接手动复制。");
    }
  }

  return (
    <section className="detail-card">
      <div className="settings-heading"><div><p className="eyebrow">第二位成员</p><h2>邀请加入</h2></div><Send size={24} color="var(--home-accent)" /></div>
      <p className="muted-copy">{full ? "小屋已经有两位成员。" : "邀请链接默认 24 小时有效且只能成功使用一次。"}</p>
      {message ? <StatusMessage tone="error">{message}</StatusMessage> : null}
      {!full && !invitation ? <button className="button button--wide" type="button" disabled={saving} onClick={() => void createInvitation()}>{saving ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}{saving ? "正在生成…" : "生成邀请链接"}</button> : null}
      {!full && invitation ? (
        <div className="invite-box">
          <a className="invite-link" href={inviteUrl}>{inviteUrl}</a>
          <small>有效至 {formatShanghaiTime(invitation.expiresAt)}</small>
          <button className="button button--secondary" type="button" onClick={() => void copy()}><Clipboard size={17} />{copied ? "已复制" : "复制链接"}</button>
        </div>
      ) : null}
    </section>
  );
}

function PasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFields({});
    if (newPassword !== confirmPassword) {
      setFields({ confirmPassword: "两次输入的新密码不一致" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest<{ ok: true }>("/api/auth/password", { method: "POST", body: jsonBody({ currentPassword, newPassword }) });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTone("success");
      setMessage("密码已修改，当前会话也已安全轮换。");
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setTone("error");
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="detail-card">
      <div className="settings-heading"><div><p className="eyebrow">你的账号</p><h2>修改密码</h2></div><KeyRound size={24} color="var(--home-accent)" /></div>
      <form className="form-stack" style={{ marginTop: "1rem" }} onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="current-password">当前密码</label><input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} aria-invalid={Boolean(fields.currentPassword)} /><FieldError message={fields.currentPassword} /></div>
        <div className="field"><label htmlFor="new-password">新密码</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-invalid={Boolean(fields.newPassword)} /><FieldError message={fields.newPassword} /></div>
        <div className="field"><label htmlFor="confirm-password">再输入一次</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={Boolean(fields.confirmPassword)} /><FieldError message={fields.confirmPassword} /></div>
        {message ? <StatusMessage tone={tone}>{message}</StatusMessage> : null}
        <button className="button button--wide" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{saving ? "正在修改…" : "修改密码"}</button>
      </form>
    </section>
  );
}
