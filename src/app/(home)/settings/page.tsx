"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarHeart, Check, Clipboard, Heart, KeyRound, LoaderCircle, LockKeyhole, Pencil, Send, Settings2 } from "lucide-react";
import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { ConflictForm, type ConflictRecord } from "@/components/conflict-form";
import type { Home, User } from "@/components/home-types";
import { Modal } from "@/components/modal";
import { FieldError, StatusMessage, formatShanghaiTime } from "@/components/ui";
import { useSession } from "@/hooks/use-session";
import { shanghaiToday } from "@/lib/local-date";

import "@/components/space-settings.css";

type Panel = "home" | "me" | "partner" | "password" | "invite" | null;
type Invitation = { token: string; expiresAt: string };

function settingsErrorMessage(error: unknown) {
  return errorMessage(error).replaceAll("小屋", "空间");
}

export default function SettingsPage() {
  const { session, refreshSession } = useSession();
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const triggerRef = useRef<HTMLElement | null>(null);
  const full = (session?.home?.members.length ?? 0) >= 2;

  useEffect(() => {
    if (panel === "invite" && full) {
      setPanel(null);
      setInvitation(null);
      setNotice("配对完成，欢迎你们一起回到空间。");
    }
  }, [panel, full]);

  useEffect(() => {
    if (!invitation) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [invitation]);

  if (!session?.home) return null;
  const { home, user } = session;
  const me = home.members.find(member => member.id === user.id)!;
  const partner = home.members.find(member => member.id !== user.id);
  const invitationExpired = invitation ? Date.parse(invitation.expiresAt) <= clock : false;
  const pairingStatus = full
    ? "已配对"
    : invitation
      ? invitationExpired ? "邀请已过期" : "等待加入"
      : "等待配对";
  const invitationDetail = full
    ? "两个人各自使用自己的账号，在同一个空间里记录生活。"
    : invitation
      ? invitationExpired
        ? "这条邀请已经过期，可以重新生成一条。"
        : `邀请链接已创建 · 有效至 ${formatShanghaiTime(invitation.expiresAt)}`
      : "空间还没有完成配对。创建一次性邀请，对方加入后就能一起记录。";
  const open = (next: Panel, event: MouseEvent<HTMLElement>) => {
    triggerRef.current = event.currentTarget;
    setNotice(null);
    setPanel(next);
  };
  const done = (message: string) => {
    setPanel(null);
    setNotice(message);
    void refreshSession();
  };

  return (
    <div className="space-settings">
      <header className="space-settings__intro">
        <div className="space-settings__intro-copy">
          <p className="eyebrow">有归 <span aria-hidden="true">/</span> ABOUT US</p>
          <p className="space-settings__index">SHARED SPACE <span>·</span> 01</p>
          <h1 className="motion-title"><span className="motion-title__inner">我们的<span className="space-settings__title-accent">空间</span></span></h1>
          <p className="space-settings__lede">两个人的名字，一段共同的时间，还有正在发生的日常。</p>
        </div>
        <div className="space-settings__landscape" aria-hidden="true">
          <span className="space-settings__landscape-moon" />
          <span className="space-settings__landscape-ridge space-settings__landscape-ridge--far" />
          <span className="space-settings__landscape-ridge space-settings__landscape-ridge--near" />
          <span className="space-settings__landscape-glow" />
          <span className="space-settings__landscape-caption">A PLACE TO RETURN</span>
        </div>
        <p className="space-settings__intro-note">有归 · 两个人的日常</p>
      </header>

      {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}

      <section className="space-pairing" id="pairing" aria-label="配对与成员">
        <div className="space-section-heading">
          <div>
            <p className="eyebrow">THE TWO OF US</p>
            <h2>两个人，组成一个空间</h2>
          </div>
          <span className={`space-pairing__status${full ? " is-paired" : ""}`} data-state={full ? "paired" : invitation ? invitationExpired ? "expired" : "pending" : "unpaired"} role="status" aria-live="polite">
            <span className="space-pairing__status-dot" aria-hidden="true" />
            {pairingStatus}
          </span>
        </div>

        <div className={`space-pairing__people${full ? " is-paired" : ""}`}>
          <article className="space-person" data-member="me">
            <div className="space-person__portrait space-person__portrait--me" aria-hidden="true">
              <span>{me.displayName.slice(0, 1)}</span>
            </div>
            <div className="space-person__identity">
              <p className="space-person__role">本人 <span>·</span> 独立账号</p>
              <h3>{me.displayName}</h3>
              <p className="space-person__detail">{user.phone ? `手机号 · ${user.phone}` : user.email ? `邮箱 · ${user.email}` : "登录账号未设置"}</p>
              <button className="space-text-action" type="button" onClick={event => open("me", event)}>
                <Pencil size={14} /> 编辑我的昵称
              </button>
            </div>
          </article>

          <div className="space-pairing__bridge" aria-hidden="true">
            <span className="space-pairing__bridge-line" />
            <span className="space-pairing__bridge-heart"><Heart size={17} /></span>
            <span className="space-pairing__bridge-line" />
          </div>

          <article className={`space-person${partner ? "" : " is-waiting"}`} data-member="partner">
            <div className="space-person__portrait space-person__portrait--partner" aria-hidden="true">
              {partner ? <span>{partner.displayName.slice(0, 1)}</span> : <Heart size={21} />}
            </div>
            <div className="space-person__identity">
              <p className="space-person__role">另一半 <span>·</span> {partner ? "共同成员" : "等候加入"}</p>
              <h3>{partner?.displayName || "把这个位置留给你"}</h3>
              <p className="space-person__detail">{partner ? "一起记录生活" : "通过邀请加入这个空间"}</p>
              {partner
                ? <button className="space-text-action" type="button" onClick={event => open("partner", event)}><Pencil size={14} /> 编辑另一半昵称</button>
                : <button className="space-text-action space-text-action--invite" type="button" onClick={event => open("invite", event)}><Send size={15} /> 邀请另一半</button>}
            </div>
          </article>
        </div>

        <div className="space-pairing__foot" aria-live="polite">
          <p><LockKeyhole size={14} /> {invitationDetail}</p>
          {!full && invitation && invitationExpired
            ? <button className="space-inline-action" type="button" onClick={event => open("invite", event)}>重新生成邀请 <ArrowUpRight size={15} /></button>
            : null}
        </div>
      </section>

      <section className="space-settings__sections" aria-label="空间设置">
        <section className="space-setting-section space-setting-section--profile">
          <div className="space-setting-section__heading">
            <span className="space-setting-section__number">01</span>
            <div>
              <p className="eyebrow">THE PLACE</p>
              <h2>空间资料</h2>
              <p>给共同的日常，一个熟悉的名字。</p>
            </div>
            <Settings2 size={19} aria-hidden="true" />
          </div>
          <dl className="space-setting-facts">
            <div><dt>空间名称</dt><dd>{home.name}</dd></div>
            <div><dt>共同开始于</dt><dd>{home.startDate}</dd></div>
          </dl>
          <button className="space-setting-link" type="button" onClick={event => open("home", event)}>
            编辑空间资料 <ArrowUpRight size={17} />
          </button>
        </section>

        <section className="space-setting-section space-setting-section--security">
          <div className="space-setting-section__heading">
            <span className="space-setting-section__number">02</span>
            <div>
              <p className="eyebrow">YOUR ACCOUNT</p>
              <h2>账号安全</h2>
              <p>账号各自独立，密码只属于你本人。</p>
            </div>
            <KeyRound size={19} aria-hidden="true" />
          </div>
          <p className="space-setting-section__copy">修改密码后，你会保持登录，其他设备上的旧登录会失效。</p>
          <button className="space-setting-link" type="button" onClick={event => open("password", event)}>
            修改密码 <ArrowUpRight size={17} />
          </button>
        </section>

        <Link className="space-setting-section space-setting-section--anniversaries" href="/anniversaries" aria-label="纪念日">
          <div className="space-setting-section__heading">
            <span className="space-setting-section__number">03</span>
            <div>
              <p className="eyebrow">MILESTONES</p>
              <h2>纪念日</h2>
              <p>回到那些值得一起记住的日子。</p>
            </div>
            <CalendarHeart size={19} aria-hidden="true" />
          </div>
          <span className="space-setting-link">打开纪念日 <ArrowUpRight size={17} /></span>
        </Link>
      </section>

      {panel === "home" || panel === "me" || panel === "partner"
        ? <ProfileEditor home={home} user={user} mode={panel} returnFocusTo={triggerRef.current} onClose={() => setPanel(null)} onSaved={() => done("资料已保存。")} />
        : null}
      {panel === "password"
        ? <PasswordEditor returnFocusTo={triggerRef.current} onClose={() => setPanel(null)} onSaved={() => done("密码已修改。")} />
        : null}
      {panel === "invite" && !full
        ? <InviteEditor invitation={invitation} setInvitation={setInvitation} returnFocusTo={triggerRef.current} onClose={() => setPanel(null)} />
        : null}
    </div>
  );
}

function ProfileEditor({ home, user, mode, returnFocusTo, onClose, onSaved }: { home: Home; user: User; mode: "home" | "me" | "partner"; returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [base, setBase] = useState(home);
  const targetId = mode === "me" ? user.id : home.members.find(member => member.id !== user.id)?.id;
  const [draft, setDraft] = useState<ConflictRecord>({ name: home.name, startDate: home.startDate, nickname: home.members.find(member => member.id === targetId)?.displayName || "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [conflict, setConflict] = useState<Home | null>(null);
  const label = mode === "me" ? "我的昵称" : "另一半昵称";
  const title = mode === "home" ? "编辑空间资料" : `编辑${label}`;
  const toConflict = (value: Home): ConflictRecord => ({ name: value.name, startDate: value.startDate, nickname: value.members.find(member => member.id === targetId)?.displayName || "" });

  async function save(current = base) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await apiRequest<Home>("/api/home", { method: "PATCH", body: jsonBody({
        name: mode === "home" ? draft.name : current.name,
        startDate: mode === "home" ? draft.startDate : current.startDate,
        members: current.members.map(member => ({ id: member.id, displayName: mode !== "home" && member.id === targetId ? draft.nickname : member.displayName })),
        version: current.version,
      }) });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (e.status === 409 && e.current) setConflict(e.current as Home);
      }
      setError(settingsErrorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const index = base.members.findIndex(member => member.id === targetId);
  const nicknameError = fields[`members.${index}.displayName`] || fields.members;
  const spaceNameError = fields.name ? "空间名称不能为空，且最多 120 个字符。" : undefined;
  return (
    <Modal
      title={title}
      description={mode === "home" ? "为你们共同生活的地方命名，记录这段时间的起点。" : "这里只调整空间中的昵称，不会更换账号或共同成员关系。"}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      busy={saving}
    >
      <form className="form-stack space-profile-form" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); void save(); }}>
        {mode === "home"
          ? <>
              <div className="field"><label htmlFor="space-name-edit">空间名称</label><input disabled={saving} id="space-name-edit" value={String(draft.name ?? "")} maxLength={120} onChange={e => setDraft({ ...draft, name: e.target.value })} aria-invalid={!!spaceNameError} /><FieldError message={spaceNameError} /></div>
              <div className="field"><label htmlFor="space-date-edit">恋爱开始日期</label><input disabled={saving} id="space-date-edit" type="date" max={shanghaiToday()} value={String(draft.startDate ?? "")} onChange={e => setDraft({ ...draft, startDate: e.target.value })} aria-invalid={!!fields.startDate} /><FieldError message={fields.startDate} /></div>
            </>
          : <div className="field"><label htmlFor="nickname-edit">{label}</label><input disabled={saving} id="nickname-edit" maxLength={60} value={String(draft.nickname ?? "")} onChange={e => setDraft({ ...draft, nickname: e.target.value })} aria-invalid={!!nicknameError} /><FieldError message={nicknameError} /></div>}
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <button className="button button--wide space-modal-submit" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
          {saving ? "正在保存…" : "保存修改"}
        </button>
      </form>
      {conflict
        ? <ConflictForm
            current={toConflict(conflict)}
            mine={draft}
            currentVersion={conflict.version}
            fields={mode === "home" ? [{ key: "name", label: "空间名称" }, { key: "startDate", label: "恋爱开始日期" }] : [{ key: "nickname", label }]}
            onReload={() => { setDraft(toConflict(conflict)); setBase(conflict); setConflict(null); setError(null); }}
            onRetry={() => save(conflict)}
            retrying={saving}
          />
        : null}
    </Modal>
  );
}

function PasswordEditor({ returnFocusTo, onClose, onSaved }: { returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    setFields({});
    setError(null);
    if (password !== confirm) {
      setFields({ confirm: "两次输入的新密码不一致" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await apiRequest("/api/auth/password", { method: "POST", body: jsonBody({ currentPassword: current, newPassword: password }) });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setError(settingsErrorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title="修改密码" description="请使用至少 12 个字符。保存成功后，你会保持登录，其他设备需要重新登录。" onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
      <form className="form-stack space-profile-form" noValidate onSubmit={submit}>
        <div className="field"><label htmlFor="password-current">当前密码</label><input disabled={saving} id="password-current" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} aria-invalid={!!fields.currentPassword} /><FieldError message={fields.currentPassword} /></div>
        <div className="field"><label htmlFor="password-new">新密码</label><input disabled={saving} id="password-new" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!fields.newPassword} /><FieldError message={fields.newPassword} /></div>
        <div className="field"><label htmlFor="password-confirm">确认新密码</label><input disabled={saving} id="password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} aria-invalid={!!fields.confirm} /><FieldError message={fields.confirm} /></div>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        <button className="button button--wide space-modal-submit" type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
          {saving ? "正在保存…" : "保存新密码"}
        </button>
      </form>
    </Modal>
  );
}

function InviteEditor({ invitation, setInvitation, returnFocusTo, onClose }: { invitation: Invitation | null; setInvitation: (value: Invitation) => void; returnFocusTo: HTMLElement | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteUrl = invitation ? `${window.location.origin}/invite/${invitation.token}` : "";

  async function create() {
    setSaving(true);
    setError(null);
    setCopied(false);
    try {
      setInvitation(await apiRequest<Invitation>("/api/invites", { method: "POST", body: jsonBody({}) }));
    } catch (e) {
      setError(settingsErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setError("无法自动复制，请长按下方链接手动复制。");
    }
  }

  const expired = invitation ? Date.parse(invitation.expiresAt) <= Date.now() : false;
  return (
    <Modal title="邀请另一半" description="一人一个账号，共享同一个空间。" onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
      <ol className="space-invite-steps"><li>生成并复制一次性邀请链接。</li><li>对方打开链接，设置自己的昵称、邮箱和密码。</li><li>加入后，两人就能一起记录日常。</li></ol>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {invitation && !expired
        ? <div className="space-invite-linkbox">
            <span className="space-invite-linkbox__status"><span className="space-pairing__status-dot" aria-hidden="true" />等待对方加入</span>
            <a className="space-invite-linkbox__url" href={inviteUrl}>{inviteUrl}</a>
            <small>有效至 {formatShanghaiTime(invitation.expiresAt)}，仅限一人使用。</small>
            <button className="button button--wide space-modal-submit" type="button" onClick={() => void copy()}><Clipboard size={17} />{copied ? "已复制" : "复制邀请链接"}</button>
          </div>
        : <div className="space-invite-create">
            {expired ? <p>上一条邀请已经过期，可以生成新的邀请链接。</p> : null}
            <button className="button button--wide space-modal-submit" type="button" disabled={saving} onClick={() => void create()}>
              {saving ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
              {saving ? "正在生成…" : expired ? "重新生成邀请" : "生成邀请链接"}
            </button>
          </div>}
      {["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)
        ? <p className="field-help space-invite-help">当前是本机预览，邀请链接只能在这台电脑打开。可用另一浏览器或无痕窗口体验，跨设备使用需要双方可访问的部署地址。</p>
        : null}
    </Modal>
  );
}
