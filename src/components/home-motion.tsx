"use client";

import { useEffect, useRef } from "react";

/** Stratum's 400 ms decode, with a stable label for layout and screen readers. */
export function HomeDecodeLabel({ text, delay = 0 }: { text: string; delay?: number }) {
  const visual = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = visual.current;
    if (!element) return;
    const control = element.closest("a, button");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let timer = 0;
    let entrance = 0;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const characters = Array.from(text);

    function settle() {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = timer = 0;
      element!.textContent = text;
    }

    function decode() {
      settle();
      if (motion.matches || document.hidden) return;
      const start = performance.now();
      let lastRoll = -Infinity;
      let random: string[] = [];
      function step(now: number) {
        const progress = Math.min(1, (now - start) / 400);
        const front = progress * characters.length;
        if (now - lastRoll > 45) {
          random = characters.map(character => {
            const letter = letters[Math.floor(Math.random() * letters.length)];
            // Full-width Latin keeps the moving band aligned with Chinese labels.
            return character.charCodeAt(0) > 127 ? String.fromCharCode(letter.charCodeAt(0) + 0xFEE0) : letter;
          });
          lastRoll = now;
        }
        let output = "";
        for (let index = 0; index < characters.length; index++) {
          if (index < front) output += characters[index];
          else if (index < front + 3.6) output += characters[index] === " " ? " " : random[index];
          else break;
        }
        element!.textContent = output;
        if (progress < 1) frame = requestAnimationFrame(step);
        else settle();
      }
      frame = requestAnimationFrame(step);
      // Background tabs and low-power devices must never leave an unfinished label.
      timer = window.setTimeout(settle, 900);
    }

    function pointerEnter(event: Event) {
      if ((event as PointerEvent).pointerType !== "touch") decode();
    }
    function stop() {
      clearTimeout(entrance);
      settle();
    }
    function visibility() { if (document.hidden) stop(); }

    entrance = window.setTimeout(decode, delay);
    control?.addEventListener("pointerenter", pointerEnter);
    control?.addEventListener("focus", decode);
    motion.addEventListener("change", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      control?.removeEventListener("pointerenter", pointerEnter);
      control?.removeEventListener("focus", decode);
      motion.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [text, delay]);

  return <span className="home-decode"><span className="home-decode__label">{text}</span><span className="home-decode__visual" aria-hidden="true" ref={visual}>{text}</span></span>;
}

export function HomeMotionFrame() {
  return <div className="home-motion-frame" aria-hidden="true">
    {["top", "right", "bottom", "left"].map(edge => <span key={edge} className={`home-motion-frame__line home-motion-frame__line--${edge}`} />)}
    {["tl", "tr", "br", "bl"].map(corner => <span key={corner} className={`home-motion-frame__corner home-motion-frame__corner--${corner}`} />)}
  </div>;
}
