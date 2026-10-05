"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, description, children, onClose, returnFocusTo, busy = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; returnFocusTo?: HTMLElement | null; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = returnFocusTo ?? (document.activeElement as HTMLElement | null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter(control => control.getClientRects().length > 0);
      if (!controls.length) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (current <= 0 ? controls.length - 1 : current - 1)
        : (current < 0 || current === controls.length - 1 ? 0 : current + 1);
      event.preventDefault();
      controls[next].focus();
    };
    document.addEventListener("keydown", keepFocusInside, true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("keydown", keepFocusInside, true);
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [returnFocusTo]);
  function dismiss() {
    if (busy || closing) return;
    setClosing(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180;
    timer.current = setTimeout(onClose, duration);
  }
  return (
    <dialog ref={ref} className={`home-modal space-settings-modal${closing ? " is-closing" : ""}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy} onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <header className="modal-heading">
        <div><p className="eyebrow">有归 · 只属于我们</p><h2 id={titleId}>{title}</h2></div>
        <button className="icon-button" type="button" aria-label="关闭弹窗" disabled={busy} onClick={dismiss}><X size={20} /></button>
      </header>
      {description ? <p className="modal-description" id={descriptionId}>{description}</p> : null}
      <div className="modal-content">{children}</div>
      <footer className="modal-footer"><button className="quiet-button" type="button" disabled={busy} onClick={dismiss}>取消</button></footer>
    </dialog>
  );
}
