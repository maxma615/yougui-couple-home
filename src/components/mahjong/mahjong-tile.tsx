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

// Hand-drawn vector faces: shared by hand, discards, melds and indicators.
// The positions follow conventional Japanese tile patterns, including the bird on one bamboo.
const pipPositions: Record<number, [number, number][]> = {
  1: [[30, 42]], 2: [[30, 22], [30, 62]], 3: [[16, 20], [30, 42], [44, 64]],
  4: [[16, 22], [44, 22], [16, 62], [44, 62]],
  5: [[16, 20], [44, 20], [30, 42], [16, 64], [44, 64]],
  6: [[16, 18], [44, 18], [16, 42], [44, 42], [16, 66], [44, 66]],
  7: [[16, 14], [30, 25], [44, 36], [16, 52], [44, 52], [16, 70], [44, 70]],
  8: [[17, 13], [43, 13], [17, 32], [43, 32], [17, 52], [43, 52], [17, 71], [43, 71]],
  9: [[14, 16], [30, 16], [46, 16], [14, 42], [30, 42], [46, 42], [14, 68], [30, 68], [46, 68]],
};

function TileArtwork({ tile }: { tile: string }) {
  const number = Number(tile[1] === "0" ? 5 : tile[1]);
  const red = tile[1] === "0";
  const ink = "#172b45", green = "#176246", vermilion = "#b62f35";
  let art;
  if (tile[0] === "p") {
    art = pipPositions[number]?.map(([x, y], i) => {
      const color = red ? vermilion : number === 1 ? ink : number === 5 && i === 2 || number === 9 && i > 2 && i < 6 ? vermilion : i % 3 === 0 ? green : ink;
      const radius = number === 1 ? 20 : number === 9 ? 6.1 : 8.1;
      return <g key={i} fill="none" stroke={color}><circle cx={x} cy={y} r={radius} strokeWidth="2.5"/><circle cx={x} cy={y} r={radius * .55} strokeWidth="1.5"/><circle cx={x} cy={y} r={radius * .17} fill={color}/>{number === 1 ? <path d="M30 25v34M13 42h34M18 30l24 24M18 54l24-24" strokeWidth="1.4"/> : null}</g>;
    });
  } else if (tile[0] === "s" && number === 1) {
    art = <g><path d="M27 36C5 36 10 59 29 62L15 74l20-9 6 7-2-14c12-13 8-27-1-28l-6-10-5 8Z" fill={green}/><path d="M26 41c-9 2-8 13 8 15M26 49l12 5M26 56l12 2" fill="none" stroke="#f9f6ea" strokeWidth="2"/><path d="M30 24c-9-12 3-17 9-12l-4 13" fill={vermilion}/><path d="m38 15 10 4-9 3" fill={ink}/><circle cx="36" cy="15" r="1.7" fill="#fff"/></g>;
  } else if (tile[0] === "s") {
    art = pipPositions[number]?.map(([x, y], i) => <g key={i} stroke={red ? vermilion : green} fill={red ? vermilion : green}><path d={`M${x - 3} ${y - 7}q3 -3 6 0v14q-3 3-6 0Z`} strokeWidth="1"/><path d={`M${x - 5} ${y - 3}h10M${x - 5} ${y + 3}h10`} strokeWidth="2.4"/><path d={`M${x} ${y - 5}v10`} stroke="#f9f6ea" strokeWidth=".8"/></g>);
  } else if (tile[0] === "m") {
    art = <g fontFamily="KaiTi, STKaiti, Noto Serif SC, serif" textAnchor="middle" fontWeight="700"><text x="30" y="35" fontSize="31" fill={red ? vermilion : ink}>{numberNames[number]}</text><text x="30" y="72" fontSize="34" fill={vermilion}>萬</text></g>;
  } else if (tile === "z5") {
    art = <g fill="none" stroke={ink}><rect x="10" y="12" width="40" height="60" rx="2" strokeWidth="3"/><rect x="14" y="16" width="32" height="52" rx="1" strokeWidth=".8"/></g>;
  } else {
    art = <text x="30" y="61" textAnchor="middle" fontFamily="KaiTi, STKaiti, Noto Serif SC, serif" fontSize="49" fontWeight="700" fill={tile === "z6" ? green : tile === "z7" ? vermilion : ink}>{({z1:"東",z2:"南",z3:"西",z4:"北",z6:"發",z7:"中"} as Record<string,string>)[tile] || "?"}</text>;
  }
  return <svg className="mahjong-tile__art" viewBox="0 0 60 84" aria-hidden="true" focusable="false">{art}</svg>;
}

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
  const baseClass = `mahjong-tile${honor ? " is-honor" : ""}${red ? " is-red" : ""}${className ? ` ${className}` : ""}`;

  if (props.type === "button" || props.onClick) {
    return <button {...props} className={baseClass} type={props.type || "button"} aria-label={props["aria-label"] || tileName(value)} data-tile-face={key}>
      <TileArtwork tile={key}/>
    </button>;
  }
  return <span className={baseClass} role="img" aria-label={tileName(value)} data-tile-face={key}>
    <TileArtwork tile={key}/>
  </span>;
}
