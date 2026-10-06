import type { ButtonHTMLAttributes } from "react";
import { tileGlyphs } from "./tile-glyphs";

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

// Original vector marks shared by hands, rivers, melds, and indicators.
// The face palette and count layouts follow traditional Japanese tile conventions.
const pipPositions: Record<number, [number, number][]> = {
  1: [[30, 42]], 2: [[30, 24], [30, 60]], 3: [[16, 20], [30, 42], [44, 64]],
  4: [[17, 22], [43, 22], [17, 62], [43, 62]],
  5: [[16, 20], [44, 20], [30, 42], [16, 64], [44, 64]],
  6: [[16, 18], [44, 18], [16, 42], [44, 42], [16, 66], [44, 66]],
  7: [[15, 16], [30, 16], [45, 16], [30, 42], [15, 68], [30, 68], [45, 68]],
  8: [[17, 13], [43, 13], [17, 32], [43, 32], [17, 52], [43, 52], [17, 71], [43, 71]],
  9: [[15, 16], [30, 16], [45, 16], [15, 42], [30, 42], [45, 42], [15, 68], [30, 68], [45, 68]],
};

const tileInk = "#172b45";
const tileGreen = "#176246";
const tileRed = "#b62f35";
const tileCream = "#fffaf0";
const suitPipColors: Record<number, string[]> = {
  1: [tileInk],
  2: [tileGreen, tileInk],
  3: [tileGreen, tileRed, tileInk],
  4: [tileInk, tileGreen, tileGreen, tileInk],
  5: [tileInk, tileGreen, tileRed, tileGreen, tileInk],
  6: [tileGreen, tileInk, tileGreen, tileInk, tileGreen, tileInk],
  7: [tileGreen, tileInk, tileRed, tileInk, tileGreen, tileInk, tileGreen],
  8: [tileInk, tileGreen, tileInk, tileGreen, tileGreen, tileInk, tileGreen, tileInk],
  9: [tileInk, tileRed, tileGreen, tileInk, tileRed, tileGreen, tileInk, tileRed, tileGreen],
};

function Pip({ x, y, radius, color, red = false }: {
  x: number;
  y: number;
  radius: number;
  color: string;
  red?: boolean;
}) {
  const accent = red ? "#9f272e" : color;
  const petal = red ? "#c4423c" : color === tileInk ? tileGreen : tileInk;
  const lineWidth = radius > 12 ? 1.25 : radius > 7 ? 0.9 : 0.7;
  const petalPath = `M0 ${-radius * .57}C${radius * .2} ${-radius * .48} ${radius * .2} ${-radius * .18} 0 0C${-radius * .2} ${-radius * .18} ${-radius * .2} ${-radius * .48} 0 ${-radius * .57}Z`;
  return <g transform={`translate(${x} ${y})`}>
    <circle r={radius} fill={tileCream} stroke={accent} strokeWidth={lineWidth * 1.35}/>
    <circle r={radius * .77} fill="none" stroke={red ? "#e5b8a7" : "#b6b8aa"} strokeWidth={lineWidth * .7}/>
    <g fill={petal} stroke={accent} strokeWidth={lineWidth * .42}>
      <path d={petalPath}/><path d={petalPath} transform="rotate(90)"/><path d={petalPath} transform="rotate(180)"/><path d={petalPath} transform="rotate(270)"/>
    </g>
    <circle r={radius * .15} fill={red ? "#fff4e8" : accent}/>
  </g>;
}

const honorCharacters: Record<string, string> = {
  z1: "東", z2: "南", z3: "西", z4: "北", z6: "發", z7: "中",
};

function Sparrow() {
  return <g>
    <path d="M29 49C22 51 13 60 8 73c10-5 20-9 30-14l-9-10Z" fill={tileGreen}/>
    <path d="M27 51C17 59 14 67 12 73c8-5 15-9 23-13" fill="none" stroke="#d8e0ca" strokeWidth="1.2"/>
    <path d="M29 48c-6-9-6-17 1-23 7-6 18-4 22 3 4 7 1 14-6 18-2 8-11 15-22 14-7-.5-12-4-15-9 8 2 15 1 20-3Z" fill={tileGreen}/>
    <path d="M20 42c5-8 17-10 24-5-8 1-13 7-15 15-4-2-7-5-9-10Z" fill="#104e3b"/>
    <path d="M26 45c3-4 8-6 13-7M25 49c3-2 6-3 9-3M28 54c3-3 6-4 10-5" fill="none" stroke="#f3f0df" strokeWidth="1.15" strokeLinecap="round"/>
    <path d="M34 25c-4-7-2-12 3-16 0 6 2 8 5 4 2 5 0 9-4 13Z" fill={tileRed}/>
    <path d="M38 22c0-5 4-8 9-9-2 5-2 8-1 11Z" fill="#d58d4a"/>
    <path d="M39 27c3-5 10-6 14-2 4 4 2 11-3 14-4 3-10 2-14-1 3-2 4-6 3-11Z" fill={tileGreen}/>
    <path d="m51 29 7 2-7 3Z" fill={tileRed}/>
    <path d="M39 36c3-3 8-3 11-1-3 2-6 3-10 2Z" fill="#f6f2e5"/>
    <circle cx="48" cy="28" r="1.65" fill="#fffaf0"/>
    <circle cx="48.4" cy="28" r=".78" fill={tileInk}/>
    <path d="M27 58c4 2 8 2 12 0" fill="none" stroke="#dce4d0" strokeWidth="1.15" strokeLinecap="round"/>
    <path d="M33 62v5m6-7 2 6m-12-4-2 6" fill="none" stroke={tileInk} strokeWidth="1.4" strokeLinecap="round"/>
    <circle cx="21" cy="66" r="1.15" fill={tileRed}/><circle cx="27" cy="63" r="1.1" fill={tileRed}/>
  </g>;
}

const bambooPositions: Record<number, [number, number][]> = {
  2: [[30, 24], [30, 60]],
  3: [[16, 20], [30, 42], [44, 64]],
  4: [[18, 22], [42, 22], [18, 62], [42, 62]],
  5: [[18, 19], [42, 19], [30, 42], [18, 65], [42, 65]],
  6: [[17, 18], [43, 18], [17, 42], [43, 42], [17, 66], [43, 66]],
  7: [[15, 16], [30, 16], [45, 16], [30, 42], [15, 68], [30, 68], [45, 68]],
  8: [[17, 13], [43, 13], [17, 32], [43, 32], [17, 52], [43, 52], [17, 71], [43, 71]],
  9: [[15, 16], [30, 16], [45, 16], [15, 42], [30, 42], [45, 42], [15, 68], [30, 68], [45, 68]],
};

function BambooStalk({ x, y, color, height, red = false }: { x: number; y: number; color: string; height: number; red?: boolean }) {
  const width = height >= 15 ? 6.4 : height >= 13 ? 5.9 : 5.4;
  const contour = red ? "#8e2930" : "#124b39";
  return <g>
    <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={width / 2} fill={color} stroke={contour} strokeWidth=".72"/>
    <path d={`M${x - width / 2 + .45} ${y - height * .28}h${width - .9}M${x - width / 2 + .45} ${y + height * .28}h${width - .9}`} stroke="#e9e6d6" strokeWidth="1.1" strokeLinecap="round"/>
    <path d={`M${x - width / 2 + .7} ${y - height * .28 - 1}h${width - 1.4}M${x - width / 2 + .7} ${y + height * .28 - 1}h${width - 1.4}`} stroke={contour} strokeWidth=".65" strokeLinecap="round"/>
    <path d={`M${x - width * .15} ${y - height * .34}v${height * .68}`} stroke="#f4f0de" strokeOpacity=".7" strokeWidth=".72" strokeLinecap="round"/>
    <ellipse cx={x} cy={y - height / 2 + .95} rx={width * .29} ry=".48" fill="#f5f0dc" fillOpacity=".85"/>
  </g>;
}

function TileArtwork({ tile }: { tile: string }) {
  const number = Number(tile[1] === "0" ? 5 : tile[1]);
  const red = tile[1] === "0";
  let art;
  if (tile[0] === "p") {
    const positions = pipPositions[number] || [];
    art = positions.map(([x, y], index) => {
      const radius = number === 1 ? 18.5 : number === 5 && index === 2 ? 8.5 : number === 9 ? 5.25 : number >= 7 ? 6.2 : 7.15;
      const color = red ? tileRed : suitPipColors[number]?.[index] || tileInk;
      return <Pip key={index} x={x} y={y} radius={radius} color={color} red={red}/>;
    });
  } else if (tile[0] === "s" && number === 1) {
    art = <Sparrow/>;
  } else if (tile[0] === "s") {
    const positions = bambooPositions[number] || [];
    const height = number >= 8 ? 12.5 : number >= 6 ? 13 : 15;
    art = positions.map(([x, y], index) => {
      const color = red ? "#bd3d36" : number === 5 && index === 2 ? tileRed : index % 3 === 1 ? "#176246" : "#1d6848";
      return <BambooStalk key={index} x={x} y={y} height={height} color={color} red={red}/>;
    });
  } else if (tile[0] === "m") {
    const numberGlyph = tileGlyphs[numberNames[number]];
    art = <g>
      {numberGlyph ? <path d={numberGlyph} fill={red ? tileRed : tileInk}/> : null}
      {tileGlyphs["萬"] ? <path d={tileGlyphs["萬"]} fill={tileRed}/> : null}
    </g>;
  } else if (tile === "z5") {
    art = <g fill="none" stroke={tileInk}>
      <rect x="10.5" y="11" width="39" height="62" rx="1.4" strokeWidth="2.5"/>
      <rect x="14.5" y="15" width="31" height="54" rx=".4" strokeWidth=".9"/>
      <path d="M17 18h26v48H17z" stroke="#8995a0" strokeWidth=".45"/>
    </g>;
  } else {
    const character = honorCharacters[tile];
    const color = tile === "z6" ? tileGreen : tile === "z7" ? tileRed : tileInk;
    art = character && tileGlyphs[character]
      ? <path d={tileGlyphs[character]} fill={color}/>
      : <path d="M20 28c1-8 17-10 19-1 1 5-3 7-8 11-3 2-4 4-4 7m0 9v1" fill="none" stroke={tileInk} strokeWidth="4" strokeLinecap="round"/>;
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
