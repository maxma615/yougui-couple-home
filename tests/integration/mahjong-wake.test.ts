import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import { expect, it, vi } from "vitest";
import { runMigrations } from "@/cli/migrate";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { withTestDatabase } from "../helpers/database";

it("does not wake for an empty authenticated lobby, coalesces four starts, and stops the child after its parent exits", async()=>{
  await withTestDatabase(async db=>{
    await runMigrations(db.pool);
    const id=randomUUID();
    await db.pool.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)",[id,`wake-${id}@example.test`,"Wake QA","not-a-login-hash"]);
    const session=await createSession(id,db.pool);
    const port=await new Promise<number>((resolve,reject)=>{const server=net.createServer();server.on("error",reject);server.listen(0,"127.0.0.1",()=>{const p=(server.address() as net.AddressInfo).port;server.close(()=>resolve(p));});});
    const child=spawn(process.execPath,["node_modules/tsx/dist/cli.mjs","tests/fixtures/mahjong-wake-worker.ts"],{env:{...process.env,DATABASE_URL:db.databaseUrl,APP_ORIGIN:"http://127.0.0.1:35555",MAHJONG_PORT:String(port)},stdio:["pipe","pipe","pipe"]});
    let output="",error="";child.stdout!.on("data",chunk=>output+=chunk);child.stderr!.on("data",chunk=>error+=chunk);
    child.stdin!.end(JSON.stringify({cookie:`${SESSION_COOKIE_NAME}=${session.token}`}));
    const code=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
    expect(code,error).toBe(0);
    expect(JSON.parse(output.trim())).toEqual({emptyLobbyStopped:true,oneInstance:true,created:true});
    await vi.waitFor(async()=>{await expect(fetch(`http://127.0.0.1:${port}/internal/health`)).rejects.toThrow();},{timeout:8000,interval:200});
  });
});
