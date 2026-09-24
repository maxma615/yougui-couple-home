// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConflictForm, type ConflictRecord } from "@/components/conflict-form";

afterEach(cleanup);

type Draft = ConflictRecord & {
  title: string;
  description: string;
};

function ConflictScenario({ onRetry }: { onRetry: (draft: Draft, version: number) => void }) {
  const [draft, setDraft] = useState<Draft>({
    title: "我准备的周末清单",
    description: "买花和草莓",
  });
  const [current, setCurrent] = useState<Draft | null>(null);

  return (
    <section>
      <label htmlFor="title">标题</label>
      <input
        id="title"
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
      />
      <button
        type="button"
        onClick={() =>
          setCurrent({ title: "服务器上的周末清单", description: "买牛奶和面包" })
        }
      >
        模拟提交得到 409
      </button>
      {current ? (
        <ConflictForm
          current={current}
          mine={draft}
          currentVersion={2}
          fields={[
            { key: "title", label: "标题" },
            { key: "description", label: "说明", multiline: true },
          ]}
          onReload={() => {
            setDraft(current);
            setCurrent(null);
          }}
          onRetry={(version) => onRetry(draft, version)}
        />
      ) : null}
    </section>
  );
}

describe("ConflictForm", () => {
  it("保留我的输入、展示服务器 v2，并基于 v2 重试", () => {
    const retry = vi.fn();
    render(<ConflictScenario onRetry={retry} />);

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "我修改后的周末清单" },
    });
    fireEvent.click(screen.getByRole("button", { name: "模拟提交得到 409" }));

    expect(screen.getByDisplayValue("我修改后的周末清单")).toBeInTheDocument();
    expect(screen.getByText("服务器上的周末清单")).toBeInTheDocument();
    expect(screen.getByText("我修改后的周末清单", { selector: "dd" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "基于最新内容重试" }));
    expect(retry).toHaveBeenCalledWith(
      {
        title: "我修改后的周末清单",
        description: "买花和草莓",
      },
      2,
    );
  });

  it("明确载入服务器内容时才替换草稿", () => {
    render(<ConflictScenario onRetry={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "还没保存的标题" } });
    fireEvent.click(screen.getByRole("button", { name: "模拟提交得到 409" }));
    fireEvent.click(screen.getByRole("button", { name: "载入服务器内容" }));

    expect(screen.getByDisplayValue("服务器上的周末清单")).toBeInTheDocument();
    expect(screen.queryByText("内容有更新冲突")).not.toBeInTheDocument();
  });
});
