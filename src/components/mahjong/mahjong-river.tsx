import type { PublicPlayer } from "@/modules/mahjong/types";
import { TileFace, tileKey, tileName } from "./mahjong-tile";

const winds = ["東", "南", "西", "北"];

/** The public engine river retains claimed events for furiten. The display
 * excludes those faces; a claimed declaration passes its sideways mark on. */
export function MahjongRiver({ player, offset }: { player: PublicPlayer; offset: number }) {
  let riichi = false;
  const visible: { tile: string; index: number; riichi: boolean }[] = [];
  player.discards.forEach((tile, index) => {
    if (tile.includes("*")) riichi = true;
    if (/[+\-=]$/.test(tile)) return;
    visible.push({ tile, index, riichi });
    riichi = false;
  });
  const rows = Array.from({ length: Math.ceil(visible.length / 6) }, (_, row) => visible.slice(row * 6, row * 6 + 6));
  return <div className={`mahjong-river mahjong-river--rows mahjong-river--${offset}${visible.length > 18 ? " is-long" : ""}`}
    data-testid={`river-${player.seat}`} aria-label={`${winds[player.wind] || "東"}家河牌`}>
    {rows.map((row, index) => <div className="mahjong-river__row" data-river-row={index} key={index}>
      {row.map(item => <span className={`mahjong-river__tile${item.tile.includes("_") ? " is-tsumogiri" : ""}${item.riichi ? " is-riichi" : ""}${item === visible.at(-1) ? " is-latest" : ""}`}
        data-tile={tileKey(item.tile)} data-river-index={item.index} key={`${item.index}-${item.tile}`}
        title={`${tileName(item.tile)}${item.riichi ? " · 立直" : ""}`}><TileFace value={item.tile}/></span>)}
    </div>)}
  </div>;
}
