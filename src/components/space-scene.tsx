import "./space-scene.css";

/** Original decorative art; personal photos use the protected API separately. */
export function SpaceScene({ className = "" }: { className?: string }) {
  return <div className={`space-scene ${className}`} aria-hidden="true"><img className="space-scene__art" src="/art/yougui-night-arch-v1.webp" alt="" fetchPriority="high" draggable={false} /><div className="space-scene__vignette" /></div>;
}
