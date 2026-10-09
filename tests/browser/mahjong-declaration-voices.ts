import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
const out=`.local/audit/declaration-voices-${Date.now()}`;mkdirSync(out,{recursive:true});
const files=['riichi','ron','tsumo','chi','pon','kan','north'].map(kind=>({kind,bytes:readFileSync(`public/audio/mahjong/voices/${kind}.wav`)}));
const code=`import {TableAudioPlayer} from './src/components/mahjong/table-audio';
import {loadMahjongVoices} from './src/components/mahjong/voice-samples';
window.decoded=[];window.started=[];window.unlocked=false;
window.player=new TableAudioPlayer(()=>{
 const c=new AudioContext();window.audioContext=c;
 const decode=c.decodeAudioData.bind(c);c.decodeAudioData=async bytes=>{const length=bytes.byteLength;const b=await decode(bytes);window.decoded.push({length,buffer:b});return b;};
 const source=c.createBufferSource.bind(c);c.createBufferSource=()=>{const s=source();const start=s.start.bind(s);s.start=(...args)=>{window.started.push({buffer:s.buffer,duration:s.buffer.duration,time:c.currentTime});return start(...args);};return s;};return c;
},loadMahjongVoices);
window.play=(id,kind)=>window.player.play({id,kind,seat:0});
window.inspect=()=>({decoded:window.decoded.map(x=>({length:x.length,duration:x.buffer.duration,channels:x.buffer.numberOfChannels})),started:window.started.map(x=>({duration:x.duration,decodedBytes:window.decoded.find(d=>d.buffer===x.buffer)?.length??null})),state:window.audioContext?.state});
window.wave=async length=>{const b=window.decoded.find(x=>x.length===length).buffer;const c=new OfflineAudioContext(1,b.length+Math.ceil(b.sampleRate*.1),b.sampleRate);const s=c.createBufferSource(),g=c.createGain();g.gain.value=.32;s.buffer=b;s.connect(g);g.connect(c.destination);s.start();const a=(await c.startRendering()).getChannelData(0);let peak=0,sum=0;for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;}return {peak,rms:Math.sqrt(sum/a.length),tail:Array.from(a.slice(-100)).every(x=>x===0)};};
document.querySelector('button').onclick=async()=>{window.unlocked=false;window.unlocked=await window.player.unlock();};`;
const bundle=await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',write:false,format:'iife'});
const sources=Object.fromEntries(["src/components/mahjong/table-audio.ts", "src/components/mahjong/voice-samples.ts", "src/components/mahjong/use-table-audio.ts", "tests/browser/mahjong-declaration-voices.ts"].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const results:unknown[]=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const scenario of ['ready','late','muted','disposed','retry','paused']){
  const page=await browser.newPage();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let blocked=scenario!=='ready'&&scenario!=='retry',fail=scenario==='retry',requests=0;
  await page.route('http://voices.test/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   const clip=files.find(f=>pathname.endsWith('/'+f.kind+'.wav'));
   if(clip){requests++;if(fail){await route.fulfill({status:503,body:'offline'});return;}if(blocked)await gate;await route.fulfill({status:200,contentType:'audio/wav',body:clip.bytes});return;}
   await route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><button>开启声音</button>'});
  });
  await page.goto('http://voices.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  assert.equal(await page.evaluate(()=>(window as any).play('locked','ron')),false);assert.equal(requests,0);
  await page.getByRole('button',{name:'开启声音'}).click();await page.waitForFunction(()=>(window as any).unlocked);await page.waitForFunction(()=>!!(window as any).audioContext);
  if(scenario==='ready'){
   await page.waitForFunction(()=>(window as any).decoded.length===7);
   // Flush the decode continuation naturally; playback itself verifies cached buffer identity.
   await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>r())));
  }else{
   if(scenario==='muted')await page.evaluate(()=>(window as any).player.setEnabled(false));
   if(scenario==='paused')await page.evaluate(()=>(window as any).player.pause());
   if(scenario==='disposed')await page.evaluate(()=>(window as any).player.dispose());
   for(const kind of ['riichi','ron','tsumo','chi','pon','kan','north']){
    const accepted=await page.evaluate(k=>(window as any).play('before-'+k,k),kind);
    assert.equal(accepted,(scenario==='late'||scenario==='retry')&&['riichi','ron','tsumo'].includes(kind));
   }
   const before=await page.evaluate(()=>(window as any).inspect());
   if(scenario==='retry'){assert.equal(requests,7);fail=false;await page.getByRole('button',{name:'开启声音'}).click();}
   blocked=false;release();
   if(scenario!=='disposed'){
    await page.waitForFunction(()=>(window as any).decoded.length===7);await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>r())));
   }else await page.waitForFunction(()=>(window as any).audioContext.state==='closed');
   const after=await page.evaluate(()=>(window as any).inspect());assert.equal(after.started.length,before.started.length,'late decode must not autoplay or replay');
   for(const kind of ['riichi','ron','tsumo','chi','pon','kan','north'])assert.equal(await page.evaluate(k=>(window as any).play('before-'+k,k),kind),false);
   if(scenario==='muted')await page.evaluate(()=>(window as any).player.setEnabled(true));
   if(scenario==='muted'||scenario==='paused'){await page.getByRole('button',{name:'开启声音'}).click();await page.waitForFunction(()=>(window as any).unlocked&&(window as any).audioContext.state==='running');}
  }
  if(scenario!=='disposed'){
   for(const f of files){
    assert.equal(await page.evaluate(k=>(window as any).play('fresh-'+k,k),f.kind),true);
    assert.equal(await page.evaluate(k=>(window as any).play('fresh-'+k,k),f.kind),false);
    const state=await page.evaluate(()=>(window as any).inspect());assert.equal(state.started.at(-1).decodedBytes,f.bytes.length,'actual native source must use correct decoded voice buffer');
    const wave=await page.evaluate(n=>(window as any).wave(n),f.bytes.length);assert(wave.peak>.18&&wave.peak<.24);assert(wave.rms>.005&&wave.rms<.12);assert(wave.tail);
    results.push({engine:engine.name(),scenario,kind:f.kind,bytes:f.bytes.length,sha256:createHash('sha256').update(f.bytes).digest('hex'),wave,state});
   }
  }
  await page.evaluate(()=>(window as any).player.dispose());await page.waitForFunction(()=>(window as any).audioContext.state==='closed');
  assert.equal(await page.evaluate(()=>(window as any).play('retired','ron')),false);
  console.log(`PASS ${engine.name()} ${scenario}: actual decode/source identity, no stale autoplay, lifecycle close`);await page.close();
 }}finally{await browser.close();}
}
writeFileSync(`${out}/proof.json`,JSON.stringify({sources,cases:12,voiceWaveforms:results.length,assets:files.map(f=>({kind:f.kind,sha256:createHash('sha256').update(f.bytes).digest('hex')})),results},null,2));console.log(`PASS 12 native lifecycle scenarios, ${results.length} voice waveforms: ${out}`);
