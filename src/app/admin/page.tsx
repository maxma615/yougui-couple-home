"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, BadgeCheck, Heart, KeyRound, LoaderCircle, LogOut, Plus, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import type { SessionData } from "@/components/home-types";
import { Modal } from "@/components/modal";
import { FieldError } from "@/components/ui";
import { SessionProvider, useSession } from "@/hooks/use-session";

import "./admin.css";

type AdminUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  role: "member" | "admin";
  disabled: boolean;
  createdAt: string;
  homeId: string | null;
  homeName: string | null;
  slot: number | null;
};

type AdminHome = {
  id: string;
  name: string;
  startDate: string;
  memberCount: number;
};

type AdminOverview = { users: AdminUser[]; homes: AdminHome[] };
type AdminDialog =
  | { kind: "create" }
  | { kind: "reset-password"; user: AdminUser }
  | { kind: "disabled"; user: AdminUser; disabled: boolean }
  | { kind: "bind"; user: AdminUser }
  | { kind: "own-password" }
  | null;

function availableSlots(home: AdminHome, users: AdminUser[]) {
  if (home.memberCount >= 2) return [];
  const occupied = new Set(users.filter(user => user.role === "member" && user.homeId === home.id).map(user => user.slot).filter((slot): slot is number => slot === 1 || slot === 2));
  return ([1, 2] as const).filter(slot => !occupied.has(slot));
}

function accountText(user: Pick<AdminUser, "phone" | "email">) {
  return user.phone ? `手机号 · ${user.phone}` : user.email ? `邮箱 · ${user.email}` : "登录账号未设置";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export default function AdminPage() {
  return (
    <SessionProvider requireHome={false}>
      <AdminDashboard />
    </SessionProvider>
  );
}

function AdminDashboard() {
  const router = useRouter();
  const { session, loading: sessionLoading, error: sessionError } = useSession();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<AdminDialog>(null);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const refreshOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      setOverview(await apiRequest<AdminOverview>("/api/admin/overview"));
    } catch (error) {
      setOverviewError(errorMessage(error));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user.role === "admin") void refreshOverview();
  }, [refreshOverview, session?.user.role]);

  const users = overview?.users ?? [];
  const members = users.filter(user => user.role === "member");
  const homes = overview?.homes ?? [];
  const activeMembers = members.filter(user => !user.disabled).length;
  const unpairedMembers = members.filter(user => !user.homeId).length;
  const visibleMembers = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return members;
    return members.filter(user => [user.displayName, user.phone ?? "", user.email ?? "", user.homeName ?? ""].some(value => value.toLocaleLowerCase().includes(search)));
  }, [members, query]);

  function openDialog(next: Exclude<AdminDialog, null>, event: MouseEvent<HTMLButtonElement>) {
    setReturnFocusTo(event.currentTarget);
    setNotice(null);
    setDialog(next);
  }

  function completeAction(message: string) {
    setDialog(null);
    setNotice(message);
    void refreshOverview();
  }

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError(null);
    try {
      await apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST", body: jsonBody({}) });
      router.replace("/login");
    } catch (error) {
      setLogoutError(errorMessage(error));
      setLogoutBusy(false);
    }
  }

  if (sessionLoading || !session) {
    return <AdminLoadingScreen message={sessionError ? "无法读取当前账号状态" : "正在核验账号…"} error={sessionError ?? undefined} />;
  }
  if (session.user.role !== "admin") return <AdminLoadingScreen message="正在返回情侣空间…" />;

  return (
    <main className="admin-page">
      <div className="admin-page__ambient" aria-hidden="true"><span /><i /><b /></div>
      <div className="admin-page__shell">
        <header className="admin-header">
          <a className="admin-brand" href="/admin" aria-label="有归管理首页">
            <span className="admin-brand__mark"><Heart size={20} fill="currentColor" /></span>
            <span><strong>有归</strong><small>账号与空间</small></span>
          </a>
          <div className="admin-header__account">
            <span className="admin-header__identity"><ShieldCheck size={15} /> 管理员 · {session.user.phone || session.user.email || "有归"}</span>
            <button className="admin-button admin-button--quiet" type="button" onClick={event => openDialog({ kind: "own-password" }, event)}>
              <KeyRound size={16} /> 修改我的密码
            </button>
            <button className="admin-button admin-button--quiet" type="button" onClick={() => void logout()} disabled={logoutBusy}>
              {logoutBusy ? <LoaderCircle className="admin-spin" size={16} /> : <LogOut size={16} />} 退出
            </button>
          </div>
        </header>

        <section className="admin-intro">
          <div>
            <p className="admin-kicker">有归 · 管理</p>
            <h1>账号与空间</h1>
            <p>在这里配置成员账号、查看配对状态并维护登录安全。</p>
          </div>
          <div className="admin-intro__seal" aria-hidden="true"><span>PRIVATE</span><Heart size={22} /><small>只管理账号，不查看生活记录</small></div>
        </section>

        {notice ? <p className="admin-notice" role="status"><BadgeCheck size={17} />{notice}</p> : null}
        {logoutError ? <p className="admin-error" role="alert">退出失败：{logoutError}</p> : null}

        <section className="admin-overview" aria-label="概览">
          <div className="admin-overview__heading"><div><p className="admin-kicker">概览</p><h2>此刻的空间</h2></div><button className="admin-icon-action" type="button" onClick={() => void refreshOverview()} disabled={loadingOverview} aria-label="刷新概览">{loadingOverview ? <LoaderCircle className="admin-spin" size={17} /> : <ArrowDownLeft size={17} />}</button></div>
          <div className="admin-stat-grid">
            <article className="admin-stat"><span>成员账号</span><strong>{loadingOverview && !overview ? "—" : members.length}</strong><small>由管理员创建</small></article>
            <article className="admin-stat"><span>正常账号</span><strong>{loadingOverview && !overview ? "—" : activeMembers}</strong><small>当前可登录</small></article>
            <article className="admin-stat"><span>情侣空间</span><strong>{loadingOverview && !overview ? "—" : homes.length}</strong><small>最多两位成员</small></article>
            <article className="admin-stat"><span>等待配对</span><strong>{loadingOverview && !overview ? "—" : unpairedMembers}</strong><small>尚未加入空间</small></article>
          </div>
          {overviewError ? <div className="admin-inline-error" role="alert">{overviewError}<button className="admin-text-button" type="button" onClick={() => void refreshOverview()}>再试一次</button></div> : null}
        </section>

        <section className="admin-members" aria-labelledby="admin-members-title">
          <div className="admin-section-heading">
            <div><p className="admin-kicker">成员</p><h2 id="admin-members-title">成员账号</h2><p>手机号优先用于登录；旧邮箱账号仍可继续使用。</p></div>
            <button className="admin-button admin-button--primary" type="button" onClick={event => openDialog({ kind: "create" }, event)}><Plus size={17} /> 新增成员</button>
          </div>
          <div className="admin-list-toolbar">
            <label className="admin-search"><Search size={16} /><span className="admin-visually-hidden">搜索成员</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名、手机号或空间" /></label>
            <span>{visibleMembers.length} 位成员</span>
          </div>

          {loadingOverview && !overview
            ? <div className="admin-empty-state" role="status"><LoaderCircle className="admin-spin" size={20} />正在读取成员与空间…</div>
            : visibleMembers.length
              ? <div className="admin-member-list">
                  {visibleMembers.map(user => {
                    const canBind = !user.homeId && homes.some(home => availableSlots(home, users).length > 0);
                    return (
                      <article className="admin-member" key={user.id}>
                        <div className="admin-member__identity">
                          <span className="admin-member__avatar" aria-hidden="true">{user.displayName.slice(0, 1) || <UserRound size={20} />}</span>
                          <div className="admin-member__name"><h3>{user.displayName || "未填写姓名"}</h3><span className={`admin-status${user.disabled ? " is-disabled" : ""}`}><i aria-hidden="true" />{user.disabled ? "已停用" : "正常"}</span></div>
                        </div>
                        <dl className="admin-member__details">
                          <div><dt>登录账号</dt><dd>{accountText(user)}</dd></div>
                          <div><dt>所在空间</dt><dd>{user.homeName || "尚未配对"}</dd></div>
                          <div><dt>空间位置</dt><dd>{user.homeId && user.slot ? `位置 ${user.slot} / 2` : "—"}</dd></div>
                          <div><dt>创建于</dt><dd>{formatDate(user.createdAt)}</dd></div>
                        </dl>
                        <div className="admin-member__actions" aria-label={`${user.displayName}的账号操作`}>
                          <button className="admin-button admin-button--secondary" type="button" onClick={event => openDialog({ kind: "reset-password", user }, event)}><KeyRound size={15} /> 重置密码</button>
                          {!user.homeId
                            ? <button className="admin-button admin-button--secondary" type="button" disabled={!canBind} onClick={event => openDialog({ kind: "bind", user }, event)}><UsersRound size={15} /> 绑定空间</button>
                            : null}
                          <button className={`admin-button ${user.disabled ? "admin-button--secondary" : "admin-button--danger"}`} type="button" onClick={event => openDialog({ kind: "disabled", user, disabled: !user.disabled }, event)}>
                            {user.disabled ? <BadgeCheck size={15} /> : <X size={15} />}{user.disabled ? "启用账号" : "停用账号"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              : <div className="admin-empty-state"><UsersRound size={21} />{members.length ? "没有符合条件的成员。" : "目前还没有成员账号。"}</div>}
        </section>

        <section className="admin-spaces" aria-labelledby="admin-spaces-title">
          <div className="admin-section-heading"><div><p className="admin-kicker">空间</p><h2 id="admin-spaces-title">情侣空间</h2><p>查看名称、开始日期与成员数量。</p></div><span className="admin-count">{homes.length} 个</span></div>
          {homes.length
            ? <div className="admin-space-list">{homes.map(home => <article className="admin-space" key={home.id}><div><h3>{home.name}</h3><p>共同开始于 {home.startDate}</p></div><span className="admin-space__count"><UsersRound size={16} />{home.memberCount} / 2</span></article>)}</div>
            : <div className="admin-space-empty">还没有创建情侣空间。成员可在首次登录后完成设置。</div>}
        </section>
      </div>

      {dialog?.kind === "create" ? <CreateMemberDialog homes={homes} users={users} returnFocusTo={returnFocusTo} onClose={() => setDialog(null)} onSaved={() => completeAction("成员账号已创建。")} /> : null}
      {dialog?.kind === "reset-password" ? <ResetMemberPasswordDialog user={dialog.user} returnFocusTo={returnFocusTo} onClose={() => setDialog(null)} onSaved={() => completeAction("成员密码已重置。")} /> : null}
      {dialog?.kind === "disabled" ? <SetDisabledDialog user={dialog.user} disabled={dialog.disabled} returnFocusTo={returnFocusTo} onClose={() => setDialog(null)} onSaved={() => completeAction(dialog.disabled ? "账号已停用。" : "账号已启用。")} /> : null}
      {dialog?.kind === "bind" ? <BindMemberDialog user={dialog.user} homes={homes} users={users} returnFocusTo={returnFocusTo} onClose={() => setDialog(null)} onSaved={() => completeAction("成员已加入空间。")} /> : null}
      {dialog?.kind === "own-password" ? <AdminPasswordDialog returnFocusTo={returnFocusTo} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice("管理员密码已更新。"); }} /> : null}
    </main>
  );
}

function AdminLoadingScreen({ message, error }: { message: string; error?: string }) {
  return <main className="admin-page"><div className="admin-loading"><span className="admin-brand__mark"><Heart size={20} fill="currentColor" /></span><h1>有归</h1><p role={error ? "alert" : "status"}>{error || message}</p></div></main>;
}

function CreateMemberDialog({ homes, users, returnFocusTo, onClose, onSaved }: { homes: AdminHome[]; users: AdminUser[]; returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [homeId, setHomeId] = useState("");
  const [slot, setSlot] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const bindableHomes = homes.filter(home => availableSlots(home, users).length > 0);
  const selectedHome = bindableHomes.find(home => home.id === homeId);
  const slots = selectedHome ? availableSlots(selectedHome, users) : [];

  function chooseHome(value: string) {
    setHomeId(value);
    const selected = bindableHomes.find(home => home.id === value);
    setSlot(selected ? String(availableSlots(selected, users)[0] ?? "") : "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (password.length < 12 || password.length > 128) {
      setFields({ password: "密码长度必须为 12–128 个字符" });
      setError(null);
      return;
    }
    if (homeId && !slot) {
      setFields({ slot: "请选择一个可用位置。" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFields({});
    setError(null);
    try {
      await apiRequest("/api/admin/users", { method: "POST", body: jsonBody({
        phone: phone.trim(),
        displayName: displayName.trim(),
        password,
        ...(homeId ? { homeId, slot: Number(slot) } : {}),
      }) });
      onSaved();
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title="新增成员账号" description="创建独立登录账号，可稍后加入已有空间。" onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
      <form className="admin-form" noValidate onSubmit={submit}>
        <div className="admin-field"><label htmlFor="admin-create-phone">手机号</label><input disabled={saving} id="admin-create-phone" type="text" inputMode="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} aria-invalid={Boolean(fields.phone)} /><FieldError message={fields.phone} /></div>
        <div className="admin-field"><label htmlFor="admin-create-name">成员姓名</label><input disabled={saving} id="admin-create-name" type="text" autoComplete="name" required maxLength={60} value={displayName} onChange={event => setDisplayName(event.target.value)} aria-invalid={Boolean(fields.displayName)} /><FieldError message={fields.displayName} /></div>
        <div className="admin-field"><label htmlFor="admin-create-password">初始密码</label><input disabled={saving} id="admin-create-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-invalid={Boolean(fields.password)} /><FieldError message={fields.password} /><small>至少 12 个字符；成员之后可以在管理面板重设。</small></div>
        <div className="admin-form__pair">
          <div className="admin-field"><label htmlFor="admin-create-home">加入空间 <span>可选</span></label><select disabled={saving} id="admin-create-home" value={homeId} onChange={event => chooseHome(event.target.value)} aria-invalid={Boolean(fields.homeId)}><option value="">暂不绑定</option>{bindableHomes.map(home => <option key={home.id} value={home.id}>{home.name} · {home.memberCount}/2</option>)}</select><FieldError message={fields.homeId} /></div>
          {homeId ? <div className="admin-field"><label htmlFor="admin-create-slot">空间位置</label><select disabled={saving} id="admin-create-slot" value={slot} onChange={event => setSlot(event.target.value)} aria-invalid={Boolean(fields.slot)}><option value="">选择空位</option>{slots.map(value => <option key={value} value={value}>位置 {value}</option>)}</select><FieldError message={fields.slot} /></div> : null}
        </div>
        {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
        <button className="admin-button admin-button--primary admin-button--wide" type="submit" disabled={saving}>{saving ? <LoaderCircle className="admin-spin" size={17} /> : <Plus size={17} />}{saving ? "正在创建…" : "创建成员账号"}</button>
      </form>
    </Modal>
  );
}

function ResetMemberPasswordDialog({ user, returnFocusTo, onClose, onSaved }: { user: AdminUser; returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (password.length < 12) {
      setFields({ newPassword: "新密码至少需要 12 个字符。" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFields({});
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: jsonBody({ action: "reset-password", newPassword: password }) });
      onSaved();
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Modal title="重置成员密码" description={`为「${user.displayName}」设置新的登录密码。`} onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
    <form className="admin-form" noValidate onSubmit={submit}>
      <div className="admin-field"><label htmlFor="admin-reset-password">新密码</label><input disabled={saving} id="admin-reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-invalid={Boolean(fields.newPassword)} /><FieldError message={fields.newPassword} /><small>至少 12 个字符；不会在页面中回显。</small></div>
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      <button className="admin-button admin-button--primary admin-button--wide" type="submit" disabled={saving}>{saving ? <LoaderCircle className="admin-spin" size={17} /> : <KeyRound size={17} />}{saving ? "正在更新…" : "更新密码"}</button>
    </form>
  </Modal>;
}

function SetDisabledDialog({ user, disabled, returnFocusTo, onClose, onSaved }: { user: AdminUser; disabled: boolean; returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  async function confirm() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: jsonBody({ action: "set-disabled", disabled }) });
      onSaved();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Modal title={disabled ? "停用这个账号？" : "重新启用账号？"} description={disabled ? `停用后，「${user.displayName}」将无法登录；其空间记录会继续保留。` : `启用后，「${user.displayName}」可以继续使用原账号登录。`} onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
    <div className="admin-confirm-summary"><span className="admin-member__avatar" aria-hidden="true">{user.displayName.slice(0, 1) || <UserRound size={20} />}</span><div><strong>{user.displayName}</strong><small>{accountText(user)}</small></div></div>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
    <div className="admin-dialog-actions"><button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={onClose}>返回</button><button className={`admin-button ${disabled ? "admin-button--danger" : "admin-button--primary"}`} type="button" disabled={saving} onClick={() => void confirm()}>{saving ? <LoaderCircle className="admin-spin" size={16} /> : disabled ? <X size={16} /> : <BadgeCheck size={16} />}{saving ? "请稍候…" : disabled ? "确认停用" : "确认启用"}</button></div>
  </Modal>;
}

function BindMemberDialog({ user, homes, users, returnFocusTo, onClose, onSaved }: { user: AdminUser; homes: AdminHome[]; users: AdminUser[]; returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const bindableHomes = homes.filter(home => availableSlots(home, users).length > 0);
  const [homeId, setHomeId] = useState(bindableHomes[0]?.id ?? "");
  const [slot, setSlot] = useState(bindableHomes[0] ? String(availableSlots(bindableHomes[0], users)[0] ?? "") : "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const selectedHome = bindableHomes.find(home => home.id === homeId);
  const slots = selectedHome ? availableSlots(selectedHome, users) : [];

  function chooseHome(value: string) {
    setHomeId(value);
    const selected = bindableHomes.find(home => home.id === value);
    setSlot(selected ? String(availableSlots(selected, users)[0] ?? "") : "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!homeId || !slot) {
      setFields({ homeId: "请选择一个有空位的空间。" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFields({});
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: jsonBody({ action: "bind", homeId, slot: Number(slot) }) });
      onSaved();
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Modal title="绑定到情侣空间" description={`为「${user.displayName}」选择一个仍有空位的空间。`} onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
    {bindableHomes.length
      ? <form className="admin-form" noValidate onSubmit={submit}>
          <div className="admin-field"><label htmlFor="admin-bind-home">情侣空间</label><select disabled={saving} id="admin-bind-home" value={homeId} onChange={event => chooseHome(event.target.value)} aria-invalid={Boolean(fields.homeId)}>{bindableHomes.map(home => <option key={home.id} value={home.id}>{home.name} · {home.memberCount}/2</option>)}</select><FieldError message={fields.homeId} /></div>
          <div className="admin-field"><label htmlFor="admin-bind-slot">空间位置</label><select disabled={saving} id="admin-bind-slot" value={slot} onChange={event => setSlot(event.target.value)} aria-invalid={Boolean(fields.slot)}>{slots.map(value => <option key={value} value={value}>位置 {value}</option>)}</select><FieldError message={fields.slot} /></div>
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          <button className="admin-button admin-button--primary admin-button--wide" type="submit" disabled={saving}>{saving ? <LoaderCircle className="admin-spin" size={17} /> : <UsersRound size={17} />}{saving ? "正在绑定…" : "确认绑定"}</button>
        </form>
      : <div className="admin-empty-state"><UsersRound size={20} />目前没有可用空位。</div>}
  </Modal>;
}

function AdminPasswordDialog({ returnFocusTo, onClose, onSaved }: { returnFocusTo: HTMLElement | null; onClose: () => void; onSaved: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (newPassword !== confirmPassword) {
      setFields({ confirmPassword: "两次输入的新密码不一致。" });
      return;
    }
    if (newPassword.length < 12) {
      setFields({ newPassword: "新密码至少需要 12 个字符。" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFields({});
    setError(null);
    try {
      await apiRequest("/api/auth/password", { method: "POST", body: jsonBody({ currentPassword, newPassword }) });
      onSaved();
    } catch (requestError) {
      if (requestError instanceof ApiError) setFields(requestError.fields);
      setError(errorMessage(requestError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Modal title="修改管理员密码" description="设置新的登录密码。保存后，你会留在当前管理页面。" onClose={onClose} returnFocusTo={returnFocusTo} busy={saving}>
    <form className="admin-form" noValidate onSubmit={submit}>
      <div className="admin-field"><label htmlFor="admin-current-password">当前密码</label><input disabled={saving} id="admin-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} aria-invalid={Boolean(fields.currentPassword)} /><FieldError message={fields.currentPassword} /></div>
      <div className="admin-field"><label htmlFor="admin-new-password">新密码</label><input disabled={saving} id="admin-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} aria-invalid={Boolean(fields.newPassword)} /><FieldError message={fields.newPassword} /></div>
      <div className="admin-field"><label htmlFor="admin-confirm-password">确认新密码</label><input disabled={saving} id="admin-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} aria-invalid={Boolean(fields.confirmPassword)} /><FieldError message={fields.confirmPassword} /></div>
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
      <button className="admin-button admin-button--primary admin-button--wide" type="submit" disabled={saving}>{saving ? <LoaderCircle className="admin-spin" size={17} /> : <KeyRound size={17} />}{saving ? "正在更新…" : "保存新密码"}</button>
    </form>
  </Modal>;
}
