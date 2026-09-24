"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { ConflictForm, type ConflictRecord } from "@/components/conflict-form";
import { FieldError, StatusMessage } from "@/components/ui";
import type { CalendarEventDto, CalendarValues } from "@/modules/calendar/schema";
import { MAX_CALENDAR_DATE, MIN_CALENDAR_DATE, shanghaiDateTimeInput, shanghaiInputToInstant } from "@/modules/calendar/time";
import { shanghaiToday } from "@/lib/local-date";

type CalendarDraft = ConflictRecord & CalendarValues;

function eventDraft(event: CalendarEventDto): CalendarDraft {
  return {
    title: event.title,
    location: event.location || "",
    description: event.description || "",
    allDay: event.allDay,
    start: event.allDay ? event.start : shanghaiDateTimeInput(event.start),
    end: event.allDay ? event.end : shanghaiDateTimeInput(event.end),
  };
}

function conflictTime(value: unknown, draft: CalendarDraft): string {
  if (typeof value !== "string") return String(value ?? "");
  if (draft.allDay) return value;
  return value.includes("T") && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? shanghaiDateTimeInput(value) : value;
}

export function CalendarEditor({ initial, initialDate }: { initial?: CalendarEventDto; initialDate?: string }) {
  const router = useRouter();
  const today = shanghaiToday();
  const initialDraft = initial ? eventDraft(initial) : null;
  const [draft, setDraft] = useState<CalendarDraft>(() => initialDraft || {
    title: "", location: "", description: "", allDay: true, start: initialDate || today, end: initialDate || today,
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<CalendarEventDto | null>(null);
  const [baseVersion, setBaseVersion] = useState(initial?.version);
  const [baseRecord, setBaseRecord] = useState(initial);

  function values(): CalendarValues {
    if (draft.allDay) return { ...draft };
    const baseDraft = baseRecord ? eventDraft(baseRecord) : null;
    const preserveStart = baseRecord && baseDraft && !baseRecord.allDay && draft.start === baseDraft.start;
    const preserveEnd = baseRecord && baseDraft && !baseRecord.allDay && draft.end === baseDraft.end;
    return {
      ...draft,
      start: preserveStart ? baseRecord.start : shanghaiInputToInstant(draft.start),
      end: preserveEnd ? baseRecord.end : shanghaiInputToInstant(draft.end),
    };
  }

  async function save(version?: number) {
    setSaving(true);
    setMessage(null);
    setFields({});
    try {
      const payload = values();
      const result = await apiRequest<CalendarEventDto>(initial ? `/api/calendar/${initial.id}` : "/api/calendar", {
        method: initial ? "PATCH" : "POST",
        body: jsonBody(initial ? { ...payload, version: version ?? baseVersion } : payload),
      });
      router.push(`/calendar/${result.id}`);
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFields(requestError.fields);
        if (requestError.status === 409 && requestError.current) setConflict(requestError.current as CalendarEventDto);
      } else if (!draft.allDay) {
        setFields({ start: "请输入有效的开始时间", end: "请输入有效的结束时间" });
      }
      setMessage(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function toggleAllDay(allDay: boolean) {
    if (allDay === draft.allDay) return;
    if (allDay) {
      setDraft({ ...draft, allDay, start: draft.start.slice(0, 10), end: draft.end.slice(0, 10) });
    } else {
      setDraft({ ...draft, allDay, start: `${draft.start.slice(0, 10)}T09:00`, end: `${draft.end.slice(0, 10)}T10:00` });
    }
  }

  const currentDraft = conflict ? eventDraft(conflict) : null;
  const timeLabel = draft.allDay ? "日期" : "时间（北京时间）";

  return (
    <>
      <form className="form-card form-stack" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(); }} noValidate>
        <div className="field">
          <label htmlFor="calendar-title">标题</label>
          <input id="calendar-title" maxLength={120} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-invalid={Boolean(fields.title)} />
          <FieldError message={fields.title} />
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={draft.allDay} onChange={(event) => toggleAllDay(event.target.checked)} />
          <span><strong>全天事项</strong><br /><small className="field-help">全天事项的结束日期包含当天。</small></span>
        </label>
        <div className="calendar-time-fields">
          <div className="field">
            <label htmlFor="calendar-start">{draft.allDay ? "开始日期" : "开始时间（北京时间）"}</label>
            <input id="calendar-start" type={draft.allDay ? "date" : "datetime-local"} min={draft.allDay ? MIN_CALENDAR_DATE : `${MIN_CALENDAR_DATE}T00:00`} max={draft.allDay ? MAX_CALENDAR_DATE : `${MAX_CALENDAR_DATE}T23:59`} required value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} aria-invalid={Boolean(fields.start)} />
            <FieldError message={fields.start} />
          </div>
          <div className="field">
            <label htmlFor="calendar-end">{draft.allDay ? "结束日期（包含）" : "结束时间（北京时间）"}</label>
            <input id="calendar-end" type={draft.allDay ? "date" : "datetime-local"} min={draft.allDay ? MIN_CALENDAR_DATE : `${MIN_CALENDAR_DATE}T00:00`} max={draft.allDay ? MAX_CALENDAR_DATE : `${MAX_CALENDAR_DATE}T23:59`} required value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} aria-invalid={Boolean(fields.end)} />
            <FieldError message={fields.end} />
          </div>
        </div>
        {!draft.allDay ? <p className="field-help">时间按北京时间（Asia/Shanghai）填写和显示。</p> : null}
        <div className="field">
          <label htmlFor="calendar-location">地点</label>
          <input id="calendar-location" maxLength={500} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} aria-invalid={Boolean(fields.location)} />
          <FieldError message={fields.location} />
        </div>
        <div className="field">
          <label htmlFor="calendar-description">说明</label>
          <textarea id="calendar-description" maxLength={20000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} aria-invalid={Boolean(fields.description)} />
          <FieldError message={fields.description} />
        </div>
        {message ? <StatusMessage tone="error">{message}</StatusMessage> : null}
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={() => router.back()}>取消</button>
          <button className="button" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
            {saving ? "正在保存…" : "保存日程"}
          </button>
        </div>
      </form>
      {conflict && currentDraft ? (
        <ConflictForm
          current={currentDraft}
          mine={draft}
          currentVersion={conflict.version}
          fields={[
            { key: "title", label: "标题" },
            { key: "allDay", label: "全天事项" },
            { key: "start", label: `开始${timeLabel}`, format: (value) => conflictTime(value, draft) },
            { key: "end", label: `结束${timeLabel}`, format: (value) => conflictTime(value, draft) },
            { key: "location", label: "地点" },
            { key: "description", label: "说明" },
          ]}
          onReload={() => { setDraft(currentDraft); setBaseRecord(conflict); setBaseVersion(conflict.version); setConflict(null); setMessage(null); }}
          onRetry={(version) => save(version)}
          retrying={saving}
        />
      ) : null}
    </>
  );
}
