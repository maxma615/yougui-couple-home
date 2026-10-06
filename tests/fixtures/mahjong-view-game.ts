import {SanmaGame} from "../../src/modules/mahjong/sanma";
import {SanmaWall,sanmaTiles} from "../../src/modules/mahjong/sanma-wall";

export function northReplacementFixture(repeatedNorth = false) {
  return new SanmaGame("east", ["A", "B", "C"], { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => { const index = available.indexOf(tile); if (index < 0) throw new Error("Impossible fixture"); return available.splice(index, 1)[0]; };
    const hand = [..."123456789"].map(n => take(`p${n}`)).concat([..."123"].map(n => take(`s${n}`)), take("z2"));
    const north = take("z4"), replacement = take(repeatedNorth ? "z4" : "z2");
    const others = available.splice(0, 26), reserve = [replacement, ...available.splice(0, 3)], indicators = available.splice(0, 10);
    return new SanmaWall([...hand, ...others, north, ...available, ...reserve, ...indicators]);
  } });
}
