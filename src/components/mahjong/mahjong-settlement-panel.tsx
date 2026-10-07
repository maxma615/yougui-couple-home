import type { Choice, GameView, RoomView } from "@/modules/mahjong/types";
import { winningHand, settlementTitle } from "./mahjong-winning-hand";
import { TileFace, tileName } from "./mahjong-tile";
import { MahjongMeld as MeldView } from "./mahjong-meld";
const number = (value: number) => value.toLocaleString("en-US");

export function MahjongSettlementPanel({ game, room, connected, busy, onChoice }: { game: GameView; room: RoomView; connected: boolean; busy: boolean; onChoice: (choice: Choice) => void }) {
  const settlement = game.settlement;
  if (!settlement) return null;
  const hanText = String(settlement.han ?? "");
  const yakuYakumanCount = settlement.yaku.reduce((count, yaku) => count + ((String(yaku.han).match(/\*+/)?.[0].length || 0)), 0);
  const yakumanCount = Math.max((hanText.match(/\*+/)?.[0].length || 0), yakuYakumanCount, /役満|役满/.test(hanText) ? 1 : 0);
  const hanLabel = yakumanCount ? `${yakumanCount > 1 ? `${yakumanCount}倍` : ""}役满` : `${hanText || "—"} 翻`;
  const winning = winningHand(settlement);
  const winner = settlement.winnerSeat === undefined ? null : room.members.find((member) => member.seat === settlement.winnerSeat);
  const ack = game.choices.find(choice => choice.type === "ack");
  return <section className="mahjong-settlement-panel" aria-label="本局结算">
    <header className="mahjong-settlement-panel__heading"><p className="mahjong-kicker">本局结算</p><h2>{settlementTitle(settlement)}</h2>{settlement.kind === "win" ? <strong className="mahjong-settlement-panel__winner">{winner?.displayName || `座位 ${(settlement.winnerSeat ?? 0) + 1}`} · {settlementTitle(settlement)}</strong> : null}<p>{settlement.kind === "win" ? `${hanLabel}${settlement.fu ? ` · ${settlement.fu} 符` : ""}` : settlement.name}</p>{settlement.kind === "win" && settlement.points !== undefined ? <div className="mahjong-settlement-panel__value"><small>牌型点数</small><b>{number(settlement.points)} 点</b></div> : null}</header>
    <div className={`mahjong-settlement-panel__delta${room.variant === "sanma" ? " is-sanma" : ""}`} aria-label="本次各席收支">{game.players.slice().sort((a,b) => a.seat - b.seat).map(player => {
      const delta = settlement.delta[player.seat] ?? 0;
      return <span key={player.seat} data-settlement-seat={player.seat}><small>座位 {player.seat + 1} · {room.members.find(member => member.seat === player.seat)?.displayName || (player.seat === room.mySeat ? "你" : `座位 ${player.seat + 1}`)}</small><em>当前 {number(player.score)}</em><b className={delta > 0 ? "is-positive" : delta < 0 ? "is-negative" : ""}>{delta > 0 ? "获得 +" : delta < 0 ? "支付 −" : "不变 "}{number(Math.abs(delta))}</b></span>;
    })}</div>
    <p className="mahjong-settlement-panel__explanation">{settlement.kind === "win" ? `仅显示当前和牌者的本次结算。实际收支已由牌局计入本场 ${game.honba}、立直棒 ${game.riichiSticks}，与牌型点数分开显示。` : "本次收支由牌局结算，当前分数按席位显示。"}{room.variant === "sanma" && settlement.winMethod === "tsumo" ? "三麻采用自摸损，缺少第四家的付款。" : ""}</p>
    {winning.closed.length || winning.melds.length ? <div className="mahjong-winning-hand"><div><small>{winner?.displayName || "和牌"}的手牌</small>{winning.winningTile ? <small>和牌：{tileName(winning.winningTile)}</small> : null}</div><div className="mahjong-winning-hand__row"><div className="mahjong-winning-hand__closed" role="group" aria-label="闭手">{winning.closed.map((tile, index) => <TileFace value={tile} key={`${index}-${tile}`} />)}</div>{winning.winningTile ? <span className="mahjong-winning-hand__tile" data-testid="mahjong-winning-tile"><TileFace value={winning.winningTile}/></span> : null}{winning.melds.length ? <div className="mahjong-winning-hand__melds">{winning.melds.map((meld, index) => <MeldView meld={meld} key={`${index}-${meld}`}/>)}</div> : null}</div></div> : null}
    {settlement.kind === "win" && settlement.uraIndicators.length ? <div className="mahjong-ura-indicators"><small>里宝牌指示</small><div>{settlement.uraIndicators.map((tile, index) => <TileFace value={tile} key={`${tile}-${index}`} />)}</div></div> : null}
    {settlement.yaku.length ? <ul>{settlement.yaku.map((yaku) => {
      const units = String(yaku.han).match(/\*+/)?.[0].length || 0;
      return <li key={yaku.name}><span>{yaku.name}</span><b>{units ? `${units > 1 ? `${units}倍` : ""}役满` : `${yaku.han} 翻`}</b></li>;
    })}</ul> : null}
    {ack ? <footer className="mahjong-settlement-panel__actions"><button type="button" className="mahjong-button mahjong-button--gold" data-choice-id={ack.id} data-choice-type={ack.type} disabled={busy || !connected} onClick={() => { if (connected && !busy) onChoice(ack); }}>继续</button></footer> : null}
  </section>;
}
