import type { Metadata } from "next";

import { MahjongClient } from "@/components/mahjong/mahjong-client";
import "./mahjong.css";
import "./mahjong-river.css";
import "./mahjong-meld.css";
import "./mahjong-interaction.css";
import "./mahjong-discard-motion.css";
import "./mahjong-table-center.css";
import "./mahjong-table-edge.css";
import "./mahjong-camera.css";
import "./mahjong-call-announcement.css";

export const metadata: Metadata = {
  title: "麻将室 · 有归",
  description: "和朋友坐下来，打一场日本麻将。",
};

export default function MahjongPage() {
  return <MahjongClient />;
}
