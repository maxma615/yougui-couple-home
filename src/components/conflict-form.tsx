"use client";

export type ConflictRecord = Record<string, string | number | boolean | null | undefined>;

export type ConflictField<T extends ConflictRecord> = {
  key: Extract<keyof T, string>;
  label: string;
  multiline?: boolean;
  format?: (value: T[Extract<keyof T, string>]) => string;
};

type ConflictFormProps<T extends ConflictRecord> = {
  current: T;
  mine: T;
  currentVersion: number;
  fields: Array<ConflictField<T>>;
  onReload: () => void;
  onRetry: (version: number) => void | Promise<void>;
  retrying?: boolean;
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "（未填写）";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

export function ConflictForm<T extends ConflictRecord>({
  current,
  mine,
  currentVersion,
  fields,
  onReload,
  onRetry,
  retrying = false,
}: ConflictFormProps<T>) {
  return (
    <section className="conflict-card" role="alert" aria-labelledby="conflict-title">
      <div className="conflict-card__heading">
        <div>
          <p className="eyebrow">保存前请确认</p>
          <h2 id="conflict-title">内容有更新冲突</h2>
        </div>
        <span className="version-chip">服务器版本 v{currentVersion}</span>
      </div>
      <p className="muted-copy">
        另一位成员刚刚保存了更新。你的输入仍然保留，可以先比较内容再决定。
      </p>
      <div className="conflict-columns">
        <div>
          <h3>服务器最新内容</h3>
          <dl>
            {fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{field.format ? field.format(current[field.key]) : displayValue(current[field.key])}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>我的输入</h3>
          <dl>
            {fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{field.format ? field.format(mine[field.key]) : displayValue(mine[field.key])}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="button-row">
        <button className="button button--secondary" type="button" onClick={onReload}>
          载入服务器内容
        </button>
        <button
          className="button"
          type="button"
          disabled={retrying}
          onClick={() => void onRetry(currentVersion)}
        >
          {retrying ? "正在重试…" : "基于最新内容重试"}
        </button>
      </div>
    </section>
  );
}
