// Run in a subprocess so destroying the parent verifies child cleanup as well.
import { randomUUID } from "node:crypto";
import { mahjongInternalOrigin, mahjongRunning, wakeMahjong } from "../../src/modules/mahjong/process";
import { GET } from "../../src/app/api/mahjong/route";
import { pool } from "../../src/lib/db";

async function main() {
  const input = JSON.parse(await new Promise<string>(resolve => { let data="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>data+=chunk);process.stdin.on("end",()=>resolve(data)); })) as { cookie: string };
  const request=new Request(`${process.env.APP_ORIGIN}/api/mahjong`, {headers:{cookie:input.cookie}});
  const lobby=await GET(request);
  const initial=await lobby.json();
  if(lobby.status!==200 || initial.serviceRunning || await mahjongRunning()) throw new Error("empty lobby woke service");
  await Promise.all([wakeMahjong(),wakeMahjong(),wakeMahjong(),wakeMahjong()]);
  const health=await(await fetch(`${mahjongInternalOrigin()}/internal/health`)).json();
  await new Promise(resolve=>setTimeout(resolve,300));
  const again=await(await fetch(`${mahjongInternalOrigin()}/internal/health`)).json();
  if(!health.instanceId || health.instanceId!==again.instanceId) throw new Error("concurrent start changed instance");
  const created=await fetch(`${mahjongInternalOrigin()}/internal/room`,{method:"POST",headers:{cookie:input.cookie,origin:process.env.APP_ORIGIN!,"content-type":"application/json"},body:JSON.stringify({action:"create",mode:"east",nonce:randomUUID()})});
  if(!created.ok)throw new Error("woken runtime cannot create a table");
  console.log(JSON.stringify({emptyLobbyStopped:true,oneInstance:true,created:true}));
  await pool.end();
  process.exit(0); // the child watchdog must release the game after parent exit
}
main().catch(()=>{console.error("Mahjong wake worker failed");process.exit(1);});
