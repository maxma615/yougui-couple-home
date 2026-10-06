import { describe, expect, it } from "vitest";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import Majiang from "@kobalab/majiang-core";
import { sanmaPayment, tenpaiPayment, scoreSanma } from "@/modules/mahjong/sanma-scoring";

const names = ["A", "B", "C"];
describe("genuine three-seat Sanma", () => {
  it("publishes an opaque game identity and advances its hand identity after settlement", () => {
    const game = new SanmaGame("east", names, fixture({ 0: "p123456789s123z2" }, ["z2"]));
    const opening = game.view(0);
    expect(opening.gameInstanceId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(opening.handId).toBe(1);
    expect(opening.choices.some(choice => choice.type === "tsumo")).toBe(true);
    game.respond(0, opening.decisionId, "tsumo");
    for (const seat of [0, 1, 2]) {
      const view = game.view(seat);
      game.respond(seat, view.decisionId, "ack");
    }
    const nextHand = game.view(0);
    expect(nextHand.gameInstanceId).toBe(opening.gameInstanceId);
    expect(nextHand.handId).toBe(2);
  });

  it("uses exactly 108 physical tiles and a 14-tile dead wall", () => {
    const tiles = sanmaTiles();
    expect(tiles).toHaveLength(108);
    expect(tiles.filter(p => /^m[02-8]$/.test(p))).toEqual([]);
    expect(tiles.filter(p => p === "p0")).toHaveLength(1);
    expect(tiles.filter(p => p === "s0")).toHaveLength(1);
    const wall = new SanmaWall(tiles);
    expect(wall.remaining).toBe(94);
    expect(() => new SanmaWall([...tiles.slice(1), "p0"])).toThrow();
  });
  it("deals only three real seats and refuses fabricated/stale decisions", () => {
    const game = new SanmaGame("east", names, { dealer: 1 });
    expect([0,1,2].map(s => game.view(s).hand.length).sort()).toEqual([13,13,14]);
    const v = game.view(1);
    expect(v.remainingTiles).toBe(54);
    expect(v.players.map(p => p.score)).toEqual([35000,35000,35000]);
    expect(v.players.map(p => p.wind).sort()).toEqual([0,1,2]);
    expect(() => game.view(3)).toThrow();
    expect(() => game.respond(0, v.decisionId, "discard:z1")).toThrow();
    expect(() => game.respond(1, v.decisionId, "chi:p123-")).toThrow();
    game.respond(1,v.decisionId,v.choices.find(c => c.type === "discard")!.id);
    expect(() => game.respond(1,v.decisionId,"discard:z1")).toThrow();
  });
  it("calculates three-player mangan, honba and noten payments", () => {
    expect(sanmaPayment({base:2000,winner:1,dealer:0})).toEqual([-4000,6000,-2000]);
    expect(sanmaPayment({base:2000,winner:0,dealer:0,honba:2,sticks:1})).toEqual([9400,-4200,-4200]);
    expect(sanmaPayment({base:2000,winner:1,dealer:0,loser:2,honba:2})).toEqual([0,8600,-8600]);
    expect(tenpaiPayment([1])).toEqual([-1500,3000,-1500]);
    expect(tenpaiPayment([0,2])).toEqual([1500,-3000,1500]);
    expect(tenpaiPayment([])).toEqual([0,0,0]);
    expect(tenpaiPayment([0,1,2])).toEqual([0,0,0]);
  });
  it.each(["east", "hanchan"] as const)("plays a full %s through actual settlements and ranking", mode => {
    const game = new SanmaGame(mode,names,{dealer:0,wallFactory:()=>new SanmaWall(sanmaTiles())});
    const rounds = new Set<string>();
    for(let move=0;move<6000&&!game.view(0).ranking;move++) {
      const v=game.view(0); rounds.add(`${v.roundWind}:${v.roundNumber}`);
      expect(v.players.reduce((s,p)=>s+p.score,0)+v.riichiSticks*1000).toBe(105000);
      let acted=false;
      for(let seat=0;seat<3;seat++) {
        const own=game.view(seat);
        expect(own.choices.some(c=>c.type==="chi")).toBe(false);
        const choice=own.choices.find(c=>c.type==="pass")??own.choices.find(c=>c.type==="discard")??own.choices.find(c=>c.type==="ack");
        if(choice) {game.respond(seat,own.decisionId,choice.id);acted=true;}
      }
      expect(acted).toBe(true);
    }
    expect(game.view(0).ranking).toHaveLength(3);
    expect(rounds.size).toBe(mode==="east"?3:6);
    expect(game.view(0).players.reduce((s,p)=>s+p.score,0)).toBe(105000);
  });
});

function tiles(encoded:string) {return [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));}
function fixture(hands:Record<number,string>,draws:string[],reserve:string[]=[],indicators:string[]=[]) {
  return {dealer:0,wallFactory:()=>{
    const available=sanmaTiles();
    const take=(tile:string)=>{const i=available.indexOf(tile);if(i<0)throw new Error(`Impossible fixture: ${tile}`);available.splice(i,1);return tile;};
    const dealt=[0,1,2].map(s=>hands[s]?tiles(hands[s]).map(take):[]);
    const drawn=draws.map(take),replacement=reserve.map(take),indicator=indicators.map(take);
    for(const hand of dealt){if(!hand.length)hand.push(...available.splice(0,13));expect(hand).toHaveLength(13);}
    replacement.push(...available.splice(0,4-replacement.length));indicator.push(...available.splice(0,10-indicator.length));
    return new SanmaWall([...dealt.flat(),...drawn,...available,...replacement,...indicator]);
  }};
}
function act(game:SanmaGame,seat:number,id:string) {const v=game.view(seat);game.respond(seat,v.decisionId,id);}
function passAll(game:SanmaGame) {for(let s=0;s<3;s++)if(game.view(s).choices.some(c=>c.type==="pass"))act(game,s,"pass");}

function screenshotCase() {
  const hands = {
    0: "m199p6789s123z123",
    1: "p23345s456678z44",
    2: "m119p23789s246z12"
  };
  const available = sanmaTiles();
  const take = (tile: string) => {
    const index = available.indexOf(tile);
    if (index < 0) throw new Error(`Impossible screenshot fixture tile: ${tile}`);
    return available.splice(index, 1)[0];
  };
  for (const hand of [hands[0], hands[1], hands[2]]) for (const tile of tiles(hand)) take(tile);
  const reserve = ["z5", "z5", "z6", "z6"];
  reserve.forEach(take);
  const indicators = ["z5"];
  indicators.forEach(take);
  const draws = [take("m1")];
  for (let i = 0; i < 28; i++) {
    const index = available.findIndex(tile => tile !== "p1" && tile !== "p4");
    if (index < 0) throw new Error("Not enough safe fixture draws");
    draws.push(available.splice(index, 1)[0]);
  }
  draws.push(take("p1"));
  return { hands, draws, reserve, indicators };
}

describe("Sanma special rules with physical fixtures",()=>{
  it("draws all eight replacements without ever consuming any indicator or duplicating a tile",()=>{
    const ordered=sanmaTiles(),wall=new SanmaWall(ordered),dealt=Array.from({length:40},()=>wall.draw());
    const indicatorSlots=ordered.slice(98),replacement:string[]=[];
    for(let i=0;i<8;i++)replacement.push(wall.replace(i<4));
    expect(wall.canReplace).toBe(false);expect(wall.canKan).toBe(false);
    expect(wall.dora).toEqual(indicatorSlots.filter((_,i)=>i%2===0));
    expect(wall.ura).toEqual(indicatorSlots.filter((_,i)=>i%2===1));
    expect(wall.remaining).toBe(46);
    const remaining=Array.from({length:wall.remaining},()=>wall.draw());
    // Four final reserve tiles were refilled from the live tail and stay dead.
    const deadReserve=ordered.slice(86,90).reverse();
    expect([...dealt,...replacement,...remaining,...indicatorSlots,...deadReserve].sort()).toEqual(ordered.sort());
    expect(()=>wall.replace(false)).toThrow();
  });
  it("offers north extraction with no new dora and no first-turn/rinshan yaku",()=>{
    const game=new SanmaGame("east",names,fixture({0:"p123456789s123z2"},["z4"],["z2"]));
    const before=game.view(0);expect(before.choices.some(c=>c.type==="nuki")).toBe(true);
    act(game,0,"nuki");passAll(game);
    const v=game.view(0);expect(v.players[0].nuki).toBe(1);expect(v.hand).toHaveLength(14);
    expect(v.remainingTiles).toBe(53);expect(v.doraIndicators).toEqual(before.doraIndicators);
    expect(v.choices.some(c=>c.type==="tsumo")).toBe(true);
    act(game,0,"tsumo");
    const yaku=game.view(0).settlement!.yaku.map(y=>y.name);
    expect(yaku).toContain("抜きドラ");expect(yaku).not.toContain("天和");expect(yaku).not.toContain("嶺上開花");
  });
  it("allows ordinary north robbery without adding chankan, and passed ron causes temporary furiten",()=>{
    const options=fixture({0:"m19p222s444z11444",1:"p123456789s123z4"},["s8"],["s9","s7"]);
    const game=new SanmaGame("east",names,options);
    act(game,0,"nuki");expect(game.view(1).choices.some(c=>c.type==="ron")).toBe(true);
    act(game,1,"ron");passAll(game);
    expect(game.view(1).settlement!.winningTile).toBe("z4");
    expect(game.view(1).settlement!.yaku.map(y=>y.name)).not.toContain("槍槓");
    const passed=new SanmaGame("east",names,options);act(passed,0,"nuki");passAll(passed);
    act(passed,0,"nuki");
    expect(passed.view(1).choices.some(c=>c.type==="ron")).toBe(false);
    expect(passed.view(0).players[0].nuki).toBe(2);
  });
  it("permits only kokushi to rob a closed kan",()=>{
    const game=new SanmaGame("east",names,fixture({0:"m111p234s234z1234",1:"m9p19s19z11234567"},["m1"]));
    act(game,0,"kan:m1111");expect(game.view(1).choices.some(c=>c.type==="ron")).toBe(true);
    act(game,1,"ron");passAll(game);
    expect(game.view(1).settlement!.yaku.map(y=>y.name)).toContain("国士無双");
    const normal=new SanmaGame("east",names,fixture({0:"p444s234z1234567",1:"p23s123456789z22"},["p4"]));
    act(normal,0,"kan:p4444");expect(normal.view(1).choices.some(c=>c.type==="ron")).toBe(false);
    expect(normal.view(0).phase).toBe("gangzimo");expect(normal.view(0).doraIndicators).toHaveLength(2);
  });
  it("offers kokushi robbery of a north extraction",()=>{
    const game=new SanmaGame("east",names,fixture({1:"m19p19s19z1123567"},["z4"]));
    act(game,0,"nuki");expect(game.view(1).choices.some(c=>c.type==="ron")).toBe(true);
    act(game,1,"ron");passAll(game);
    expect(game.view(0).settlement!.yaku.map(y=>y.name)).toContain("国士無双");
  });
  it("collects riichi deposit only after the declaration discard survives and allows only drawn north afterward",()=>{
    const game=new SanmaGame("east",names,fixture({0:"p123456789s123z4"},["m1","z1","z2","s8","z5","z6","z4"],["s9"]));
    act(game,0,"riichi:m1_");passAll(game);
    expect(game.view(0).riichiSticks).toBe(1);expect(game.view(0).players[0].score).toBe(34000);
    for(let s=1;s<=2;s++){const v=game.view(s);act(game,s,v.choices.find(c=>c.type==="discard"&&c.value?.endsWith("_"))!.id);passAll(game);}
    expect(game.view(0).drawnTile).toBe("s8");expect(game.view(0).choices.some(c=>c.type==="nuki")).toBe(false);
    act(game,0,"discard:s8_");passAll(game);
    for(let s=1;s<=2;s++){const v=game.view(s);act(game,s,v.choices.find(c=>c.type==="discard"&&c.value?.endsWith("_"))!.id);passAll(game);}
    expect(game.view(0).drawnTile).toBe("z4");expect(game.view(0).choices.some(c=>c.type==="nuki")).toBe(true);
    act(game,0,"nuki");passAll(game);
    expect(game.view(0).hand.filter(t=>t==="z4")).toHaveLength(1);
    expect(game.view(0).choices.filter(c=>c.type==="discard").map(c=>c.value)).toEqual(["s9_"]);
  });
  it("settles both ron replies in discard-distance order",()=>{
    const game=new SanmaGame("east",names,fixture({1:"p123456789s123z2",2:"p123456789s123z2"},["z2"]));
    act(game,0,"discard:z2_");act(game,2,"ron");act(game,1,"ron");
    expect(game.view(0).settlement!.winnerSeat).toBe(1);
    const delta=game.view(0).settlement!.delta;
    for(let s=0;s<3;s++)act(game,s,"ack");
    expect(game.view(0).settlement!.winnerSeat).toBe(2);
    expect(game.view(0).players.map(p=>p.score)).toEqual(delta.map(x=>35000+x));
    expect(game.view(0).settlement!.delta).toHaveLength(3);
    expect(game.view(0).settlement!.delta.reduce((s,n)=>s+n,0)).toBe(0);
  });
});

describe("Sanma score boundaries and late-hand rules",()=>{
  it("offers closed tsumo for the reported South-seat hand at 25 tiles and scores pinfu",()=>{
    const { hands, draws, reserve, indicators } = screenshotCase();
    const game = new SanmaGame("east", names, {
      dealer: 0,
      wallFactory: () => fixture(hands, draws, reserve, indicators).wallFactory()
    });

    // The dealer discards the first m1; West can pon it, moving the later
    // South turn to exactly 25 live tiles while leaving South's hand untouched.
    act(game, 0, "discard:m1_");
    expect(game.view(2).choices.some(choice => choice.id === "pon:m111+")).toBe(true);
    act(game, 2, "pon:m111+");
    const caller = game.view(2);
    const callDiscard = caller.choices.find(choice => choice.type === "discard")!;
    game.respond(2, caller.decisionId, callDiscard.id);
    passAll(game);

    let reached = false;
    for (let step = 0; step < 100; step++) {
      const south = game.view(1);
      if (south.turnSeat === 1 && south.remainingTiles === 25 && south.drawnTile === "p1") {
        reached = true;
        break;
      }
      const responder = [0, 1, 2].find(seat => game.view(seat).choices.some(choice => choice.type === "pass"));
      if (responder !== undefined) {
        act(game, responder, "pass");
        continue;
      }
      const actor = south.turnSeat;
      const current = game.view(actor);
      const discard = current.choices.find(choice => choice.type === "discard" && choice.value?.endsWith("_"))
        ?? current.choices.find(choice => choice.type === "discard");
      expect(discard, `seat ${actor} should have a legal discard`).toBeDefined();
      game.respond(actor, current.decisionId, discard!.id);
    }

    expect(reached).toBe(true);
    const south = game.view(1);
    expect(south.hand.slice().sort()).toEqual(tiles("p123345s456678z44").sort());
    expect(south.players[1]).toMatchObject({ wind: 1, score: 35000, riichi: false, nuki: 0, melds: [] });
    expect(south.remainingTiles).toBe(25);
    expect(south.choices.some(choice => choice.type === "tsumo")).toBe(true);

    game.respond(1, south.decisionId, "tsumo");
    const settlement = game.view(1).settlement!;
    expect(settlement.yaku.map(yaku => yaku.name)).toEqual(expect.arrayContaining(["門前清自摸和", "平和"]));
    expect(settlement.fu).toBe(20);
    expect(settlement.han).toBe(2);
  });

  it("offers and accepts a legal riichi discard from the same closed tenpai shape",()=>{
    const game = new SanmaGame("east", names, fixture({ 1: "p23345s456678z44" }, ["z1", "s1"]));
    act(game, 0, "discard:z1_");
    passAll(game);

    const south = game.view(1);
    expect(south.drawnTile).toBe("s1");
    expect(south.choices.some(choice => choice.id === "riichi:s1_")).toBe(true);
    game.respond(1, south.decisionId, "riichi:s1_");
    passAll(game);
    expect(game.view(1).players[1].riichi).toBe(true);
    expect(game.view(1).riichiSticks).toBe(1);
  });

  it("counts one/nine man dora and extracted North dora but cannot win on nuki bonuses alone",()=>{
    const hand=Majiang.Shoupai.fromString("m999p123456s789z11");
    const score=scoreSanma(hand,null,{menfeng:1,baopai:["m1","z3"],nuki:2})!;
    expect(score.yaku.find(y=>y.name==="ドラ")?.fanshu).toBe(3);
    expect(score.yaku.find(y=>y.name==="抜きドラ")?.fanshu).toBe(4);
    const one=Majiang.Shoupai.fromString("m111p123456s789z22");
    expect(scoreSanma(one,null,{menfeng:1,baopai:["m9"]})!.yaku.find(y=>y.name==="ドラ")?.fanshu).toBe(3);
    const noYaku=Majiang.Shoupai.fromString("p234678s456z4,p111+");
    expect(scoreSanma(noYaku,"z4-",{menfeng:1,nuki:4,baopai:["z3"]})).toBeNull();
  });
  it("uses the responsible three-seat payer for yakuman, including ron split and independent extra yakuman",()=>{
    expect(sanmaPayment({base:8000,winner:1,dealer:0,pao:[{seat:2,base:8000}]})).toEqual([0,32000,-32000]);
    expect(sanmaPayment({base:8000,winner:1,dealer:0,loser:0,pao:[{seat:2,base:8000}]})).toEqual([-16000,32000,-16000]);
    expect(sanmaPayment({base:16000,winner:1,dealer:0,pao:[{seat:2,base:8000}]})).toEqual([-16000,56000,-40000]);
    const hand=Majiang.Shoupai.fromString("p123z11,z555+,z666-,z777+");
    const result=scoreSanma(hand,null,{menfeng:1})!;
    expect(result.yaku.find(y=>y.name==="大三元")?.baojia).toBe("+");
  });
  it("continues for one player's four kans and aborts only after fourth-kan discard when several players have kans",()=>{
    const solo=new SanmaGame("east",names,fixture({0:"p111222333444z1"},["p1"],["p2","p3","p4","z2"]));
    for(const meld of ["p1111","p2222","p3333","p4444"]){act(solo,0,"kan:"+meld);passAll(solo);}
    expect(solo.view(0).players[0].melds).toHaveLength(4);
    expect(solo.view(0).doraIndicators).toHaveLength(5);
    act(solo,0,"discard:z2_");passAll(solo);
    expect(solo.view(0).settlement).toBeNull();expect(solo.view(0).turnSeat).toBe(1);
    const split=new SanmaGame("east",names,fixture({0:"p111222s123z1122",1:"s777888z3455667"},["p1","s7"],["p2","s4","s8","s9"]));
    for(const meld of ["p1111","p2222"]){act(split,0,"kan:"+meld);passAll(split);}
    act(split,0,"discard:s4_");passAll(split);
    for(const meld of ["s7777","s8888"]){act(split,1,"kan:"+meld);passAll(split);}
    expect(split.view(1).settlement).toBeNull();act(split,1,"discard:s9_");passAll(split);
    expect(split.view(0).settlement!.name).toBe("四開槓");
    expect(split.view(0).settlement!.delta).toEqual([0,0,0]);
  });
  it("disallows extraction and kan when no legal replacement remains",()=>{
    const wall=new SanmaWall(sanmaTiles());
    while(wall.remaining)wall.draw();
    expect(wall.canReplace).toBe(false);expect(wall.canKan).toBe(false);
  });
  it("awards three-seat nagashi mangan and carries riichi sticks on exhaustive draws",()=>{
    const hand0="m19p19s19z1234567";
    const pool=sanmaTiles();for(const t of tiles(hand0))pool.splice(pool.indexOf(t),1);
    const terminals=pool.filter(t=>/^z|^[mps][19]$/.test(t));
    // Seat zero receives only terminals/honors. Others deliberately put one
    // simple tile in their rivers, making only seat zero eligible for nagashi.
    const drawOrder:string[]=[];
    for(let i=0;i<18;i++)drawOrder.push(terminals[i]);
    const game=new SanmaGame("east",names,fixture({0:hand0},[]));
    // A separate physically constructed wall gives each dealer draw a terminal.
    const available=sanmaTiles();const take=(t:string)=>{const i=available.indexOf(t);if(i<0)throw new Error(t);available.splice(i,1);return t;};
    const h0=tiles(hand0).map(take),dealerDraws=drawOrder.map(take);
    const h1=available.splice(0,13),h2=available.splice(0,13),draws:string[]=[];
    for(let i=0;i<18;i++){draws.push(dealerDraws[i],...available.splice(0,2));}
    const ordered=[...h0,...h1,...h2,...draws,...available];
    const actual=new SanmaGame("east",names,{dealer:0,wallFactory:()=>new SanmaWall(ordered)});
    for(let i=0;i<200&&!actual.view(0).settlement;i++) {
      for(let s=0;s<3;s++) {
        const v=actual.view(s),c=v.choices.find(c=>c.type==="pass")??v.choices.find(c=>c.type==="discard"&&(s===0?true:!/^([mps][19]|z)/.test(c.value!)))??v.choices.find(c=>c.type==="discard");
        if(c)act(actual,s,c.id);
      }
    }
    expect(actual.view(0).settlement!.name).toBe("流し満貫");
    expect(actual.view(0).settlement!.delta).toEqual([8000,-4000,-4000]);
    expect(game.view(0).choices.some(c=>c.type==="abort")).toBe(true);
  });
});

describe("Sanma furiten, deposits and responsibility through real actions",()=>{
  it("rejects ron on every wait when one wait is already in the player's river",()=>{
    const game=new SanmaGame("east",names,fixture({0:"p23s123456789z22"},["p1","p4"]));
    act(game,0,"discard:p1_");passAll(game);act(game,1,"discard:p4_");
    expect(game.view(0).choices.some(c=>c.type==="ron")).toBe(false);
  });
  it("keeps passed-ron furiten after a riichi player's own next draw",()=>{
    const game=new SanmaGame("east",names,fixture({0:"p123456789s123z4",1:"m19p222s444z11444"},["m1","s8","s7","z2","s6"],["s9","s5"]));
    act(game,0,"riichi:m1_");passAll(game);act(game,1,"nuki");
    expect(game.view(0).choices.some(c=>c.type==="ron")).toBe(true);passAll(game);
    act(game,1,"discard:s9_");passAll(game);act(game,2,"discard:s7_");passAll(game);
    expect(game.view(0).drawnTile).toBe("z2");act(game,0,"discard:z2_");passAll(game);
    act(game,1,"nuki");expect(game.view(0).choices.some(c=>c.type==="ron")).toBe(false);
  });
  it("allows a wait-preserving riichi closed kan and rejects one which changes the wait set",()=>{
    const safe=new SanmaGame("east",names,fixture({0:"p111s123456789z1"},["m1","z2","z3","p1"]));
    act(safe,0,"riichi:m1_");passAll(safe);
    for(const s of [1,2]){const v=safe.view(s);act(safe,s,v.choices.find(c=>c.type==="discard"&&c.value?.endsWith("_"))!.id);passAll(safe);}
    expect(safe.view(0).choices.some(c=>c.id==="kan:p1111")).toBe(true);
    const changed=new SanmaGame("east",names,fixture({0:"p1112345678999"},["z1","z2","z3","p1"]));
    act(changed,0,"riichi:z1_");passAll(changed);
    for(const s of [1,2]){const v=changed.view(s);act(changed,s,v.choices.find(c=>c.type==="discard"&&c.value?.endsWith("_"))!.id);passAll(changed);}
    expect(changed.view(0).choices.some(c=>c.type==="kan")).toBe(false);
  });
  it("gives existing riichi sticks only to the nearest of two ron winners",()=>{
    const game=new SanmaGame("east",names,fixture({0:"p123s123456789z2",1:"p123s123456789z2",2:"p123s123456789z2"},["m1","z2"]));
    act(game,0,"riichi:m1_");passAll(game);expect(game.view(0).riichiSticks).toBe(1);
    act(game,1,"discard:z2_");act(game,0,"ron");act(game,2,"ron");
    const first=game.view(0).settlement!;expect(first.winnerSeat).toBe(2);expect(first.delta.reduce((s,v)=>s+v,0)).toBe(1000);
    for(let s=0;s<3;s++)act(game,s,"ack");
    const second=game.view(0).settlement!;expect(second.winnerSeat).toBe(0);expect(second.delta.reduce((s,v)=>s+v,0)).toBe(0);
    expect(game.view(0).players.reduce((s,p)=>s+p.score,0)+game.view(0).riichiSticks*1000).toBe(105000);
  });
  it("maps the third dragon caller to the real liable seat on a tsumo",()=>{
    const game=new SanmaGame("east",names,fixture({1:"p123s99z11556677"},["z5","z6","z7","s8","s7","p3"]));
    act(game,0,"discard:z5_");act(game,1,"pon:z555-");passAll(game);
    act(game,1,"discard:s9");passAll(game);act(game,2,"discard:z6_");act(game,1,"pon:z666+");passAll(game);
    act(game,1,"discard:s9");passAll(game);act(game,2,"discard:z7_");act(game,1,"pon:z777+");passAll(game);
    act(game,1,"discard:p3");passAll(game);act(game,2,"discard:s8_");passAll(game);act(game,0,"discard:s7_");passAll(game);
    expect(game.view(1).choices.some(c=>c.type==="tsumo")).toBe(true);act(game,1,"tsumo");
    expect(game.view(0).settlement!.delta).toEqual([0,32000,-32000]);
  });
  it("retains an unclaimed riichi stick across a draw and awards it to first place at match end",()=>{
    const first=fixture({0:"p123s123456789z2"},["m1"]);let hands=0;
    const game=new SanmaGame("east",names,{dealer:0,wallFactory:()=>hands++===0?first.wallFactory():new SanmaWall(sanmaTiles())});
    act(game,0,"riichi:m1_");passAll(game);
    let sawCarried=false;
    for(let step=0;step<6000&&!game.view(0).ranking;step++) {
      if(hands>1&&game.view(0).riichiSticks===1)sawCarried=true;
      for(let s=0;s<3;s++) {
        const v=game.view(s),c=v.choices.find(c=>c.type==="pass")??v.choices.find(c=>c.type==="discard"&&c.value?.endsWith("_"))??v.choices.find(c=>c.type==="discard")??v.choices.find(c=>c.type==="ack");
        if(c)act(game,s,c.id);
      }
      expect(game.view(0).players.reduce((sum,p)=>sum+p.score,0)+game.view(0).riichiSticks*1000).toBe(105000);
    }
    expect(sawCarried).toBe(true);expect(game.view(0).ranking).toHaveLength(3);expect(game.view(0).riichiSticks).toBe(0);
  });
});

it("uses only two honba shares on liable tsumo, also when extra yakuman has ordinary payers",()=>{
  expect(sanmaPayment({base:8000,winner:1,dealer:0,honba:2,pao:[{seat:2,base:8000}]})).toEqual([0,32400,-32400]);
  expect(sanmaPayment({base:8000,winner:0,dealer:0,honba:2,pao:[{seat:2,base:8000}]})).toEqual([48400,0,-48400]);
  expect(sanmaPayment({base:16000,winner:1,dealer:0,honba:2,pao:[{seat:2,base:8000}]})).toEqual([-16200,56400,-40200]);
  expect(sanmaPayment({base:16000,winner:0,dealer:0,honba:2,pao:[{seat:2,base:8000}]})).toEqual([80400,-16200,-64200]);
});

it("settles a real dealer heavenly hand with exactly two tsumo payers",()=>{
  const game=new SanmaGame("east",names,fixture({0:"p123456789s123z2"},["z2"]));
  act(game,0,"tsumo");expect(game.view(0).settlement!.yaku.map(y=>y.name)).toContain("天和");
  expect(game.view(0).settlement!.points).toBe(32000);
  expect(game.view(0).settlement!.delta).toEqual([32000,-16000,-16000]);
  for(let s=0;s<3;s++)act(game,s,"ack");
  expect(game.view(0).players.map(p=>p.score)).toEqual([67000,19000,19000]);
  expect(game.view(0).honba).toBe(1);expect(game.view(0).roundNumber).toBe(1);
});

it("does not charge a riichi declaration discard that another player immediately wins",()=>{
  const game=new SanmaGame("east",names,fixture({0:"p123456789s123z4",1:"p123456789s123z2"},["z2"]));
  act(game,0,"riichi:z2_");act(game,1,"ron");passAll(game);
  expect(game.view(0).riichiSticks).toBe(0);expect(game.view(0).players[0].score).toBe(35000);
  expect(game.view(0).settlement!.delta.reduce((s,n)=>s+n,0)).toBe(0);
});

it("returns detached three-player public DTOs without concealed opponent hands or wall internals",()=>{
  const game=new SanmaGame("east",names,{dealer:0}),v=game.view(0),copy=structuredClone(v);
  expect(Object.keys(v.players[1]).sort()).toEqual(["discards","handCount","melds","nuki","riichi","score","seat","wind"]);
  expect(JSON.stringify(v)).not.toMatch(/_bingpai|_pai|wallFactory|reserve/);
  v.hand.length=0;v.players[1].discards.push("z7");v.doraIndicators.length=0;v.choices.length=0;
  expect(game.view(0)).toEqual(copy);
  const another=new SanmaGame("east",names,{dealer:0});expect(another.view(0).decisionId).not.toBe(copy.decisionId);
});

it("clears temporary north-pass furiten on the next own draw for a non-riichi player",()=>{
  const game=new SanmaGame("east",names,fixture({0:"m19p222s444z11444",1:"p123456789s123z4"},["s8","s7","z2","z3"],["s9","s6","s5"]));
  act(game,0,"nuki");passAll(game);act(game,0,"nuki");passAll(game);
  act(game,0,"discard:s6_");passAll(game);act(game,1,"discard:s7_");passAll(game);act(game,2,"discard:z2_");passAll(game);
  act(game,0,"nuki");expect(game.view(1).choices.some(c=>c.type==="ron")).toBe(true);
});

it("omits nuki on the final live-wall North and supports nine-terminals abort without penalties",()=>{
  const game=new SanmaGame("east",names,{dealer:0,wallFactory:()=>new SanmaWall(sanmaTiles())});
  for(let step=0;step<200&&game.view(0).remainingTiles>0;step++)for(let s=0;s<3;s++) {
    if(!game.view(0).remainingTiles)break;
    const v=game.view(s),choice=v.choices.find(c=>c.type==="pass")??v.choices.find(c=>c.type==="discard"&&c.value?.endsWith("_"));
    if(choice)act(game,s,choice.id);
  }
  const last=game.view(game.view(0).turnSeat);expect(last.remainingTiles).toBe(0);expect(last.drawnTile).toBe("z4");
  expect(last.choices.some(c=>c.type==="nuki"||c.type==="kan"||c.type==="riichi")).toBe(false);
  const aborted=new SanmaGame("east",names,fixture({0:"m19p19s19z1234567"},["z1"]));
  act(aborted,0,"abort");expect(aborted.view(0).settlement!.name).toBe("九種九牌");expect(aborted.view(0).settlement!.delta).toEqual([0,0,0]);
  for(let s=0;s<3;s++)act(aborted,s,"ack");expect(aborted.view(0).roundNumber).toBe(1);expect(aborted.view(0).honba).toBe(1);
});

it("offers a real added kan after pon and gives its robber the chankan yaku",()=>{
  const game=new SanmaGame("east",names,fixture({1:"p11s123456789z22",2:"p23s123456789z44"},["p1","z3","z4","p1"]));
  act(game,0,"discard:p1_");act(game,1,"pon:p111-");passAll(game);
  act(game,1,"discard:s9");passAll(game);act(game,2,"discard:z3_");passAll(game);act(game,0,"discard:z4_");passAll(game);
  expect(game.view(1).choices.some(c=>c.id==="kan:p111-1")).toBe(true);
  act(game,1,"kan:p111-1");expect(game.view(2).choices.some(c=>c.type==="ron")).toBe(true);act(game,2,"ron");passAll(game);
  expect(game.view(0).settlement!.winnerSeat).toBe(2);expect(game.view(0).settlement!.yaku.map(y=>y.name)).toContain("槍槓");
});
