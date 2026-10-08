import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from '@playwright/test';
const out=`.local/audit/table-audio-wave-${Date.now()}`;mkdirSync(out,{recursive:true});
const code=`import {makeTileSoundBuffer,TableAudioPlayer} from './src/components/mahjong/table-audio';
window.wave=async kind=>{const c=new OfflineAudioContext(1,kind==='score-roll'?57600:28800,48000),s=c.createBufferSource(),gain=c.createGain();gain.gain.value=.32;s.buffer=makeTileSoundBuffer(c,kind);s.connect(gain);gain.connect(c.destination);s.start();return Array.from((await c.startRendering()).getChannelData(0));};
window.player=new TableAudioPlayer(()=>{window.audioContext=new AudioContext();return window.audioContext;});
window.unlocked=false;document.querySelector('button').onclick=async()=>window.unlocked=await window.player.unlock();`;
const bundle=await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',write:false,format:'iife'});
const results:unknown[]=[];
function wav(samples:number[]){const data=Buffer.alloc(44+samples.length*2);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(48000,24);data.writeUInt32LE(96000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples.length*2,40);samples.forEach((x,i)=>data.writeInt16LE(Math.round(x*32767),44+i*2));return data;}
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{const page=await browser.newPage();await page.setContent('<button>开启声音</button>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  for(const kind of ['draw','discard','call','nuki','riichi','ron','tsumo','yaku','hand-value','score-roll']){
   const samples=await page.evaluate(k=>(window as any).wave(k),kind) as number[];
   assert.equal(samples.length,kind==='score-roll'?57600:28800);assert(samples.every(Number.isFinite));
   const peak=Math.max(...samples.map(Math.abs)),rms=Math.sqrt(samples.reduce((a,b)=>a+b*b,0)/samples.length),mean=samples.reduce((a,b)=>a+b,0)/samples.length;
   assert(peak>.03&&peak<.3,`${engine.name()} ${kind}: safe nonzero peak ${peak}`);assert(rms>.002&&rms<.08);assert(Math.abs(mean)<.002);assert(samples.slice(-4800).every(x=>x===0),'finite silence after transient');
   const bytes=wav(samples),path=`${out}/${engine.name()}-${kind}.wav`;writeFileSync(path,bytes);results.push({engine:engine.name(),kind,peak,rms,mean,path,sha256:createHash('sha256').update(bytes).digest('hex')});
   console.log(`PASS ${engine.name()} ${kind}: actual OfflineAudioContext waveform peak=${peak.toFixed(4)} rms=${rms.toFixed(4)}`);
  }
  assert.equal(await page.evaluate(()=>(window as any).player.play({id:'locked',kind:'discard',seat:0})),false);
  assert.equal(await page.evaluate(()=>(window as any).audioContext!==undefined),false);
  await page.getByRole('button',{name:'开启声音'}).click();await page.waitForFunction(()=>(window as any).unlocked);
  assert.equal(await page.evaluate(()=>(window as any).audioContext.state),'running');
  assert.equal(await page.evaluate(()=>(window as any).player.play({id:'live',kind:'discard',seat:0})),true);
  assert.equal(await page.evaluate(()=>(window as any).player.play({id:'live',kind:'discard',seat:0})),false);
  await page.evaluate(()=>(window as any).player.setEnabled(false));assert.equal(await page.evaluate(()=>(window as any).player.play({id:'muted',kind:'draw',seat:1})),false);
  await page.evaluate(()=>(window as any).player.dispose());await page.waitForFunction(()=>(window as any).audioContext.state==='closed');
  console.log(`PASS ${engine.name()}: trusted click unlock, finite live source, duplicate/mute rejection and actual context close`);
 }finally{await browser.close();}
}
writeFileSync(`${out}/summary.json`,JSON.stringify({results},null,2));console.log(`PASS ${results.length} actual audio waveforms in ${out}`);
