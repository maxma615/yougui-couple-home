import type { ButtonHTMLAttributes } from "react";

const honorNames: Record<string, string> = {
  z1: "东风",
  z2: "南风",
  z3: "西风",
  z4: "北风",
  z5: "白板",
  z6: "发财",
  z7: "红中",
};
const numberNames = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const suitNames: Record<string, string> = { m: "萬", p: "筒", s: "索" };

export function tileKey(value: string) {
  return value.trim().slice(0, 2).toLowerCase();
}

export function tileName(value: string) {
  const key = tileKey(value);
  if (honorNames[key]) return honorNames[key];
  const suit = key[0];
  const number = Number(key[1] === "0" ? "5" : key[1]);
  return `${numberNames[number] || "?"}${suitNames[suit] || "牌"}${key[1] === "0" ? "（赤）" : ""}`;
}

export function TileFace({
  value,
  className = "",
  ...props
}: { value: string; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const key = tileKey(value);
  const honor = key[0] === "z";
  const red = key[1] === "0";
  const face = honor ? ({ z1: "東", z2: "南", z3: "西", z4: "北", z5: "白", z6: "發", z7: "中" } as Record<string, string>)[key] : numberNames[Number(key[1] === "0" ? "5" : key[1])] || "?";
  const suit = honor ? "字" : suitNames[key[0]] || "牌";
  const baseClass = `mahjong-tile${honor ? " is-honor" : ""}${red ? " is-red" : ""}${className ? ` ${className}` : ""}`;

  if (props.type === "button" || props.onClick) {
    return <button {...props} className={baseClass} type={props.type || "button"} aria-label={props["aria-label"] || tileName(value)} data-tile-face={key}>
      <span className="mahjong-tile__number">{face}</span><span className="mahjong-tile__suit">{suit}</span>
    </button>;
  }
  return <span className={baseClass} role="img" aria-label={tileName(value)} data-tile-face={key}>
    <span className="mahjong-tile__number">{face}</span><span className="mahjong-tile__suit">{suit}</span>
  </span>;
}
