import {spawn,type ChildProcess} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {cp,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {createTestDatabase} from '../tests/helpers/database';
import {runMigrations} from '../src/cli/migrate';

async function freePort():Promise<number>{
  return new Promise((resolve,reject)=>{
    const server=net.createServer();server.on('error',reject);
    server.listen(0,'127.0.0.1',()=>{const port=(server.address() as net.AddressInfo).port;server.close(()=>resolve(port));});
  });
}
function stop(child:ChildProcess){if(child.pid){try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}}}
async function main(){
  await mkdir('.local/e2e',{recursive:true});
  const database=await createTestDatabase();
  const directory=await mkdtemp(path.resolve('.local/e2e/run-'));
  const port=await freePort(),origin=`http://127.0.0.1:${port}`;
  const environment={...process.env,NODE_ENV:'development' as const,DATABASE_URL:database.databaseUrl,APP_ORIGIN:origin,ATTACHMENTS_DIR:path.join(directory,'attachments'),SESSION_SECRET:randomBytes(48).toString('base64url'),E2E_ORIGIN:origin,PLAYWRIGHT_BROWSERS_PATH:path.resolve('.local/browsers'),NEXT_TELEMETRY_DISABLED:'1'};
  await mkdir(environment.ATTACHMENTS_DIR);
  const log=createWriteStream(path.join(directory,'server.log'),{mode:0o600});
  let server:ChildProcess|undefined;
  try{
    await runMigrations(database.pool);
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{env:environment,detached:true,stdio:['ignore','pipe','pipe']});
    server.stdout?.pipe(log);server.stderr?.pipe(log);
    const cleanup=()=>{if(server)stop(server);};
    process.once('SIGINT',cleanup);process.once('SIGTERM',cleanup);
    const deadline=Date.now()+90_000;
    while(true){
      if(server.exitCode!==null)throw new Error(`E2E application exited; inspect ${path.relative(process.cwd(),directory)}/server.log`);
      try{const response=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(2000)});if(response.ok)break;}catch{/* startup */}
      if(Date.now()>deadline)throw new Error('E2E application did not become healthy');
      await new Promise(resolve=>setTimeout(resolve,400));
    }
    console.log(`Browser tests use isolated database ${database.name} and local port ${port}.`);
    const test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{env:environment,stdio:'inherit'});
    const exit=await new Promise<number>((resolve,reject)=>{test.once('error',reject);test.once('exit',code=>resolve(code??1));});
    process.exitCode=exit;
    await cp('test-results',path.join(directory,'test-results'),{recursive:true});
  }finally{
    if(server){stop(server);await new Promise(resolve=>{if(server!.exitCode!==null)resolve(null);else {server!.once('exit',resolve);setTimeout(resolve,5000).unref();}});}
    log.end();
    await database.cleanup();
    await rm(environment.ATTACHMENTS_DIR,{recursive:true,force:true});
    console.log('Isolated browser-test database and attachments cleaned; log retained under .local/e2e/.');
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Browser test run failed');process.exitCode=1;});
