"use client";

import { useEffect, useRef, type ReactNode } from "react";

const REVEAL_TARGETS = ".space-settings__landscape, .space-pairing, .space-setting-section, .form-card, .detail-card, .empty-card";

/** Reveal a section once; updates retain the original DOM and every form draft. */
export function PageMotionScope({ pathname, children }: { pathname: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = container.current;
    if (!root || pathname === "/home" || !("IntersectionObserver" in window)) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new Set<HTMLElement>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting && element.dataset.motionReveal === "pending") {
          element.dataset.motionReveal = "visible";
          observer.unobserve(element);
        }
      }
    }, { threshold: 0.05, rootMargin: "0px 0px -20px 0px" });

    function prepare(element: HTMLElement) {
      if (seen.has(element) || element.closest("dialog")) return;
      seen.add(element);
      const ancestor = element.parentElement?.closest(REVEAL_TARGETS);
      if (ancestor && root!.contains(ancestor)) return;
      if (preference.matches || document.hidden || element.contains(document.activeElement)) {
        element.dataset.motionReveal = "settled";
        return;
      }
      element.dataset.motionReveal = "pending";
      observer.observe(element);
    }

    function scan(node: HTMLElement) {
      if (node.matches(REVEAL_TARGETS)) prepare(node);
      node.querySelectorAll<HTMLElement>(REVEAL_TARGETS).forEach(prepare);
    }

    function settle() {
      for (const element of seen) {
        if (element.dataset.motionReveal) {
          element.dataset.motionReveal = "settled";
          observer.unobserve(element);
        }
      }
    }

    function syncPolicy() {
      if (preference.matches || document.hidden) settle();
    }

    function focus(event: FocusEvent) {
      // Keyboard focus must never land inside a transparent section.
      if (!(event.target instanceof Node)) return;
      for (const element of seen) {
        if (element.contains(event.target) && element.dataset.motionReveal) {
          element.dataset.motionReveal = "settled";
          observer.unobserve(element);
        }
      }
    }

    scan(root);
    const mutations = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) scan(node);
        }
        for (const node of record.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (const element of seen) {
            if ((element === node || node.contains(element)) && !root.contains(element)) {
              observer.unobserve(element);
              element.removeAttribute("data-motion-reveal");
              seen.delete(element);
            }
          }
        }
      }
    });
    mutations.observe(root, { childList: true, subtree: true });
    root.addEventListener("focusin", focus);
    preference.addEventListener("change", syncPolicy);
    document.addEventListener("visibilitychange", syncPolicy);

    return () => {
      mutations.disconnect();
      observer.disconnect();
      root.removeEventListener("focusin", focus);
      preference.removeEventListener("change", syncPolicy);
      document.removeEventListener("visibilitychange", syncPolicy);
      for (const element of seen) element.removeAttribute("data-motion-reveal");
    };
  }, [pathname]);

  return <div ref={container} className="page-container">{children}</div>;
}
