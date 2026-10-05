"use client";

import { useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

import { Modal } from "@/components/modal";
import { StatusMessage } from "@/components/ui";

export function DeleteConfirmButton({
  kind,
  name,
  onConfirm,
  disabled = false,
  className = "button button--danger",
  children,
}: {
  kind: string;
  name: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function confirm() {
    if (disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      pending.current = false;
      setBusy(false);
      setOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error && requestError.message ? requestError.message : "暂时无法删除，请重试。");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={className}
        type="button"
        aria-label={`删除“${name}”`}
        disabled={disabled || busy}
        onClick={() => { setError(null); setOpen(true); }}
      >
        {children ?? <><Trash2 size={17} /> 删除</>}
      </button>
      {open ? (
        <Modal
          title={`删除${kind}`}
          description={`确定删除${kind}“${name}”吗？删除后无法恢复。`}
          busy={busy}
          onClose={() => { if (!busy) setOpen(false); }}
        >
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          <button className="button button--danger" type="button" aria-label="确认删除" disabled={disabled || busy} onClick={() => void confirm()} autoFocus>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}
            {busy ? "正在删除…" : "确认删除"}
          </button>
        </Modal>
      ) : null}
    </>
  );
}
