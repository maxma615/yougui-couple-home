import {readdir,readFile,access} from 'node:fs/promises';
import path from 'node:path';

async function files(directory:string):Promise<string[]>{
  const entries=await readdir(directory,{withFileTypes:true});
  const output:string[]=[];
  for(const entry of entries){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await files(file));
    else if(entry.isFile())output.push(file);
  }
  return output;
}
await access('.next/BUILD_ID');
const forbidden=[process.env.SESSION_SECRET,process.env.ATTACHMENTS_DIR];
if(process.env.DATABASE_URL){const password=new URL(process.env.DATABASE_URL).password;if(password)forbidden.push(password);}
const secrets=forbidden.filter((value):value is string=>Boolean(value&&value.length>=8));
const targets=[...await files('.next/static'),...await files('.next/server')];
const leaks:string[]=[];
for(const file of targets){
  if(!/\.(js|json|html|map)$/.test(file))continue;
  const content=await readFile(file,'utf8');
  if(secrets.some(secret=>content.includes(secret)))leaks.push(file);
}
if(leaks.length){console.error(`Secret scan failed in ${leaks.length} build file(s); values have not been printed.`);process.exitCode=1;}
else console.log(`Secret scan passed across ${targets.length} build files; no configured credential or attachment path found.`);
