import type { Metadata } from "next";

import { MahjongClient } from "@/components/mahjong/mahjong-client";
import "./mahjong.css";
import "./mahjong-river.css";
import "./mahjong-meld.css";
import "./mahjong-interaction.css";

export const metadata: Metadata = {
  title: "麻将室 · 有归",
  description: "和朋友坐下来，打一场日本麻将。",
};

export default function MahjongPage() {
  return <MahjongClient />;
}
