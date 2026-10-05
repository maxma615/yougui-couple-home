"use client";

import { useEffect, useRef, useState } from "react";
import "./space-scene.css";

const POSTER_SRC = "/art/stratum-night.webp";
const VIDEO_SRC = "/art/stratum-vision.mp4";
const PARALLAX_EASE = 0.045;
const SETTLED_EPSILON = 0.0004;

type NetworkInformationLike = EventTarget & { saveData?: boolean };

function supportsReducedData(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return connection?.saveData === true;
}

/** Stratum's locally hosted VISION still/video scene for the couple-space hero. */
export function HomeMotionScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoAllowed, setVideoAllowed] = useState(false);
  const [sceneVisible, setSceneVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [motionActive, setMotionActive] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    const syncPolicy = () => setVideoAllowed(!reducedMotion.matches && !supportsReducedData());

    syncPolicy();
    reducedMotion.addEventListener("change", syncPolicy);
    connection?.addEventListener("change", syncPolicy);

    return () => {
      reducedMotion.removeEventListener("change", syncPolicy);
      connection?.removeEventListener("change", syncPolicy);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!("IntersectionObserver" in window)) {
      setSceneVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setSceneVisible(entry.isIntersecting && entry.intersectionRatio > 0);
    }, { threshold: 0.01 });
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!videoAllowed) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      setReady(false);
      return;
    }

    if (!sceneVisible || !pageVisible) {
      video.pause();
      return;
    }

    let cancelled = false;
    let playRequested = false;
    const markReadyAfterPlayback = () => {
      if (cancelled || playRequested) return;
      playRequested = true;
      const playback = video.play();
      if (playback) {
        void playback.then(() => {
          if (!cancelled) setReady(true);
        }).catch(() => {
          // The still remains visible when autoplay is unavailable.
        });
      } else {
        setReady(true);
      }
    };

    video.addEventListener("canplay", markReadyAfterPlayback);
    video.preload = "auto";
    if (video.getAttribute("src") !== VIDEO_SRC) {
      video.src = VIDEO_SRC;
      video.load();
    }
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) markReadyAfterPlayback();

    return () => {
      cancelled = true;
      video.removeEventListener("canplay", markReadyAfterPlayback);
      video.pause();
    };
  }, [videoAllowed, sceneVisible, pageVisible]);

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fineHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let frame = 0;
    let pointerListening = false;
    let width = stage.clientWidth;
    let height = stage.clientHeight;

    const writeTransform = () => {
      const dx = -cx * width * 0.0156;
      const dy = -cy * height * 0.015;
      const cover = 2 * Math.max(Math.abs(dx) / Math.max(width, 1), Math.abs(dy) / Math.max(height, 1));
      const scale = 1 + cover + 0.014 * Math.max(0, cy);
      stage.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;
    };

    const stopAndCenter = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      tx = 0;
      ty = 0;
      cx = 0;
      cy = 0;
      writeTransform();
    };

    const eligible = () => !reducedMotion.matches && fineHover.matches && !document.hidden && sceneVisible;
    const syncMotionPolicy = () => {
      const enabled = eligible();
      setMotionActive(enabled);
      if (enabled && !pointerListening) {
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.addEventListener("pointerleave", onPointerLeave);
        pointerListening = true;
      } else if (!enabled && pointerListening) {
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerleave", onPointerLeave);
        pointerListening = false;
      }
      if (!enabled) stopAndCenter();
    };

    const tick = () => {
      frame = 0;
      if (!eligible()) {
        setMotionActive(false);
        stopAndCenter();
        return;
      }

      cx += (tx - cx) * PARALLAX_EASE;
      cy += (ty - cy) * PARALLAX_EASE;
      writeTransform();

      if (Math.abs(tx - cx) < SETTLED_EPSILON && Math.abs(ty - cy) < SETTLED_EPSILON) {
        cx = tx;
        cy = ty;
        writeTransform();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };

    const wake = () => {
      if (eligible() && !frame) frame = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !eligible()) return;
      tx = Math.max(-1, Math.min(1, (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1));
      ty = Math.max(-1, Math.min(1, (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1));
      wake();
    };

    const onPointerLeave = () => {
      tx = 0;
      ty = 0;
      wake();
    };

    const onVisibilityChange = () => {
      syncMotionPolicy();
      if (document.hidden) stopAndCenter();
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      if (tx === 0 && ty === 0) writeTransform();
      else wake();
    });
    resizeObserver?.observe(stage);
    const onResize = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      wake();
    };

    reducedMotion.addEventListener("change", syncMotionPolicy);
    fineHover.addEventListener("change", syncMotionPolicy);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    syncMotionPolicy();

    return () => {
      reducedMotion.removeEventListener("change", syncMotionPolicy);
      fineHover.removeEventListener("change", syncMotionPolicy);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      stage.style.removeProperty("transform");
    };
  }, [sceneVisible]);

  return (
    <div
      ref={sceneRef}
      className="space-scene home-motion-scene"
      data-ready={ready ? "true" : "false"}
      data-motion={motionActive ? "true" : "false"}
      aria-hidden="true"
    >
      <div ref={stageRef} className="home-motion-scene__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="space-scene__art home-motion-scene__poster"
          src={POSTER_SRC}
          alt=""
          fetchPriority="high"
          decoding="async"
          draggable={false}
          style={{ objectPosition: "center", transform: "none", animation: "none" }}
        />
        <video
          ref={videoRef}
          className="home-motion-scene__video"
          poster={POSTER_SRC}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
      <div className="space-scene__vignette" />
    </div>
  );
}
