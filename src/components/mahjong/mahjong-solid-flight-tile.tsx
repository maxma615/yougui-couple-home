import { TileFace } from "./mahjong-tile";

const sideFaces = ["top", "left", "right", "bottom"] as const;

/** The concealed back and public discard face joined by four real side planes. */
export function MahjongSolidFlightTile({ value }: { value: string }) {
  return (
    <span className="mahjong-discard-flight__solid" data-flight-volume="true" aria-hidden="true">
      <span className="mahjong-discard-flight__back" data-flight-face="back" aria-hidden="true" />
      <span className="mahjong-discard-flight__front" data-flight-face="front" aria-hidden="true">
        <TileFace value={value} className={`mahjong-discard-flight__face${value.includes("_") ? " is-tsumogiri" : ""}${value.includes("*") ? " is-riichi" : ""}`} />
      </span>
      {sideFaces.map(face => (
        <span
          key={face}
          className={`mahjong-discard-flight__side mahjong-discard-flight__side--${face}`}
          data-flight-face={face}
          data-flight-side={face}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
