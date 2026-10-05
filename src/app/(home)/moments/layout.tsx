import type { ReactNode } from "react";

import "@/components/space-gallery.css";

export default function MomentsLayout({ children }: { children: ReactNode }) {
  return <div className="space-gallery-route">{children}</div>;
}
