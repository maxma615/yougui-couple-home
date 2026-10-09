/** Local paint metadata only; never sent as a game command. */
export type TileSheenPhase = Readonly<{elapsed:number;capturedAt:number}>;
const sheenAnimations=(element:HTMLElement)=>typeof element.getAnimations==='function'
  ? element.getAnimations({subtree:true}).filter(a=>(a as CSSAnimation).animationName==='mahjong-dora-sheen') : [];
export function readTileSheenPhase(element:HTMLElement):TileSheenPhase|null {
  const time=sheenAnimations(element)[0]?.currentTime;
  return typeof time==='number'&&Number.isFinite(time)&&time>=0?{elapsed:time,capturedAt:performance.now()}:null;
}
/** Resume on both the travelling cap and its hidden destination. Native CSS
 * advances the clock afterwards, including while the destination is hidden. */
export function continueTileSheenPhase(element:HTMLElement,phase:TileSheenPhase|null|undefined){
  if(!phase||!element.isConnected||!Number.isFinite(phase.elapsed)||phase.elapsed<0
    ||!Number.isFinite(phase.capturedAt)||phase.capturedAt<0)return;
  const elapsed=phase.elapsed+Math.max(0,performance.now()-phase.capturedAt);
  for(const animation of sheenAnimations(element))animation.currentTime=elapsed;
}
