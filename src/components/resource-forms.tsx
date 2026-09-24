"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { ConflictForm, type ConflictRecord } from "@/components/conflict-form";
import type { Anniversary, Member, Moment, Todo } from "@/components/home-types";
import { FieldError, StatusMessage } from "@/components/ui";
import { shanghaiToday } from "@/lib/local-date";

type AnniversaryDraft = ConflictRecord & {
  title: string;
  date: string;
  note: string;
  yearly: boolean;
};

type TodoDraft = ConflictRecord & {
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  completed: boolean;
};

type MomentDraft = ConflictRecord & {
  title: string;
  date: string;
  body: string;
};

function anniversaryDraft(record: Anniversary): AnniversaryDraft {
  return { title: record.title, date: record.date, note: record.note || "", yearly: record.yearly };
}

function todoDraft(record: Todo): TodoDraft {
  return {
    title: record.title,
    description: record.description || "",
    assigneeId: record.assigneeId || "",
    dueDate: record.dueDate || "",
    completed: record.completed,
  };
}

function momentDraft(record: Moment): MomentDraft {
  return { title: record.title, date: record.date, body: record.body || "" };
}

export function AnniversaryEditor({ initial }: { initial?: Anniversary }) {
  const router = useRouter();
  const [draft, setDraft] = useState<AnniversaryDraft>(() => initial ? anniversaryDraft(initial) : { title: "", date: "", note: "", yearly: true });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Anniversary | null>(null);
  const [baseVersion, setBaseVersion] = useState(initial?.version);

  async function save(version?: number) {
    setSaving(true);
    setMessage(null);
    setFields({});
    try {
      const result = await apiRequest<Anniversary>(initial ? `/api/anniversaries/${initial.id}` : "/api/anniversaries", {
        method: initial ? "PATCH" : "POST",
        body: jsonBody(initial ? { ...draft, version: version ?? baseVersion } : draft),
      });
      router.push(`/anniversaries/${result.id}`);
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFields(requestError.fields);
        if (requestError.status === 409 && requestError.current) setConflict(requestError.current as Anniversary);
      }
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form className="form-card form-stack" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }} noValidate>
        <div className="field">
          <label htmlFor="anniversary-title">标题</label>
          <input id="anniversary-title" maxLength={120} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(fields.title)} />
          <FieldError message={fields.title} />
        </div>
        <div className="field">
          <label htmlFor="anniversary-date">日期</label>
          <input id="anniversary-date" type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} aria-invalid={Boolean(fields.date)} />
          <FieldError message={fields.date} />
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={draft.yearly} onChange={(event) => setDraft({ ...draft, yearly: event.target.checked })} />
          <span><strong>每年纪念</strong><br /><small className="field-help">每年自动计算下一次日期；2 月 29 日在非闰年按 2 月 28 日提醒。</small></span>
        </label>
        <div className="field">
          <label htmlFor="anniversary-note">备注</label>
          <textarea id="anniversary-note" maxLength={20000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} aria-invalid={Boolean(fields.note)} />
          <FieldError message={fields.note} />
        </div>
        {message ? <StatusMessage tone="error">{message}</StatusMessage> : null}
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={() => router.back()}>取消</button>
          <button className="button" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
            {saving ? "正在保存…" : "保存纪念日"}
          </button>
        </div>
      </form>
      {conflict ? (
        <ConflictForm
          current={anniversaryDraft(conflict)}
          mine={draft}
          currentVersion={conflict.version}
          fields={[
            { key: "title", label: "标题" },
            { key: "date", label: "日期" },
            { key: "yearly", label: "每年重复" },
            { key: "note", label: "备注" },
          ]}
          onReload={() => { setDraft(anniversaryDraft(conflict)); setBaseVersion(conflict.version); setConflict(null); setMessage(null); }}
          onRetry={(version) => save(version)}
          retrying={saving}
        />
      ) : null}
    </>
  );
}

export function TodoEditor({ initial, members }: { initial?: Todo; members: Member[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<TodoDraft>(() => initial ? todoDraft(initial) : { title: "", description: "", assigneeId: "", dueDate: "", completed: false });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Todo | null>(null);
  const [baseVersion, setBaseVersion] = useState(initial?.version);

  async function save(version?: number) {
    setSaving(true);
    setMessage(null);
    setFields({});
    const payload = { ...draft, assigneeId: draft.assigneeId || null, dueDate: draft.dueDate || null };
    try {
      const result = await apiRequest<Todo>(initial ? `/api/todos/${initial.id}` : "/api/todos", {
        method: initial ? "PATCH" : "POST",
        body: jsonBody(initial ? { ...payload, version: version ?? baseVersion } : payload),
      });
      router.push(`/todos/${result.id}`);
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFields(requestError.fields);
        if (requestError.status === 409 && requestError.current) setConflict(requestError.current as Todo);
      }
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const assigneeLabel = (value: unknown) => {
    if (!value) return "双方";
    return members.find((member) => member.id === value)?.displayName || String(value);
  };

  return (
    <>
      <form className="form-card form-stack" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }} noValidate>
        <div className="field">
          <label htmlFor="todo-title">标题</label>
          <input id="todo-title" maxLength={120} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(fields.title)} />
          <FieldError message={fields.title} />
        </div>
        <div className="field">
          <label htmlFor="todo-description">说明</label>
          <textarea id="todo-description" maxLength={20000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} aria-invalid={Boolean(fields.description)} />
          <FieldError message={fields.description} />
        </div>
        <div className="field">
          <label htmlFor="todo-assignee">负责人</label>
          <select id="todo-assignee" value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })} aria-invalid={Boolean(fields.assigneeId)}>
            <option value="">双方一起</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
          </select>
          <FieldError message={fields.assigneeId} />
        </div>
        <div className="field">
          <label htmlFor="todo-due">截止日期（可选）</label>
          <input id="todo-due" type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} aria-invalid={Boolean(fields.dueDate)} />
          <FieldError message={fields.dueDate} />
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={draft.completed} onChange={(event) => setDraft({ ...draft, completed: event.target.checked })} />
          <span><strong>已经完成</strong><br /><small className="field-help">取消勾选可恢复为未完成。</small></span>
        </label>
        {message ? <StatusMessage tone="error">{message}</StatusMessage> : null}
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={() => router.back()}>取消</button>
          <button className="button" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}
            {saving ? "正在保存…" : "保存待办"}
          </button>
        </div>
      </form>
      {conflict ? (
        <ConflictForm
          current={todoDraft(conflict)}
          mine={draft}
          currentVersion={conflict.version}
          fields={[
            { key: "title", label: "标题" },
            { key: "description", label: "说明" },
            { key: "assigneeId", label: "负责人", format: assigneeLabel },
            { key: "dueDate", label: "截止日期" },
            { key: "completed", label: "已完成" },
          ]}
          onReload={() => { setDraft(todoDraft(conflict)); setBaseVersion(conflict.version); setConflict(null); setMessage(null); }}
          onRetry={(version) => save(version)}
          retrying={saving}
        />
      ) : null}
    </>
  );
}

export function MomentEditor({ initial }: { initial?: Moment }) {
  const router = useRouter();
  const [draft, setDraft] = useState<MomentDraft>(() => initial ? momentDraft(initial) : { title: "", date: shanghaiToday(), body: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Moment | null>(null);
  const [baseVersion, setBaseVersion] = useState(initial?.version);

  async function save(version?: number) {
    setSaving(true);
    setMessage(null);
    setFields({});
    try {
      const result = await apiRequest<Moment>(initial ? `/api/moments/${initial.id}` : "/api/moments", {
        method: initial ? "PATCH" : "POST",
        body: jsonBody(initial ? { ...draft, version: version ?? baseVersion } : draft),
      });
      router.push(`/moments/${result.id}`);
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFields(requestError.fields);
        if (requestError.status === 409 && requestError.current) setConflict(requestError.current as Moment);
      }
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form className="form-card form-stack" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }} noValidate>
        <div className="field">
          <label htmlFor="moment-title">标题</label>
          <input id="moment-title" maxLength={120} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(fields.title)} />
          <FieldError message={fields.title} />
        </div>
        <div className="field">
          <label htmlFor="moment-date">记录日期</label>
          <input id="moment-date" type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} aria-invalid={Boolean(fields.date)} />
          <FieldError message={fields.date} />
        </div>
        <div className="field">
          <label htmlFor="moment-body">想说的话</label>
          <textarea id="moment-body" maxLength={20000} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} aria-invalid={Boolean(fields.body)} />
          <FieldError message={fields.body} />
        </div>
        {message ? <StatusMessage tone="error">{message}</StatusMessage> : null}
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={() => router.back()}>取消</button>
          <button className="button" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
            {saving ? "正在保存…" : initial ? "保存修改" : "保存并继续添加照片"}
          </button>
        </div>
      </form>
      {conflict ? (
        <ConflictForm
          current={momentDraft(conflict)}
          mine={draft}
          currentVersion={conflict.version}
          fields={[
            { key: "title", label: "标题" },
            { key: "date", label: "记录日期" },
            { key: "body", label: "正文" },
          ]}
          onReload={() => { setDraft(momentDraft(conflict)); setBaseVersion(conflict.version); setConflict(null); setMessage(null); }}
          onRetry={(version) => save(version)}
          retrying={saving}
        />
      ) : null}
    </>
  );
}
