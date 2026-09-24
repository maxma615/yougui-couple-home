import { requireHomeMember } from '../../../lib/auth-context';
import { AppError } from '../../../lib/errors';
import { readHomeEvents } from '../../../lib/events/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireHomeMember(request);
    let cursor = request.headers.get('last-event-id');
    if(cursor !== null && !/^\d{1,19}$/.test(cursor)) {
      throw new AppError(400,'INVALID_CURSOR','更新游标无效，请刷新页面');
    }
    const encoder = new TextEncoder();
    let closed = false;
    let wake: (() => void) | undefined;
    let finish: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if(closed) return;
          closed = true;
          wake?.();
          request.signal.removeEventListener('abort', close);
          try { controller.close(); } catch { /* consumer already cancelled */ }
        };
        finish=close;
        const send = (data: string) => {
          if(!closed) controller.enqueue(encoder.encode(data));
        };
        request.signal.addEventListener('abort', close, {once:true});
        if(request.signal.aborted) { close(); return; }
        send('retry: 3000\n\n');
        void (async () => {
          let heartbeat = 0;
          try {
            while(!closed) {
              // A revoked/expired session must not keep its pre-existing stream.
              const current = await requireHomeMember(request);
              if(current.homeId!==ctx.homeId || current.userId!==ctx.userId) break;
              const batch=await readHomeEvents(ctx.homeId,cursor);
              if(closed) break;
              if(batch.reset) send(`id: ${batch.cursor}\nevent: reset\ndata: {}\n\n`);
              else for(const event of batch.events) {
                send(`id: ${event.id}\nevent: change\ndata: ${JSON.stringify(event)}\n\n`);
              }
              cursor=batch.cursor;
              if(Date.now()-heartbeat>15000){send(': heartbeat\n\n');heartbeat=Date.now();}
              await new Promise<void>(resolve=>{
                const timer=setTimeout(resolve,2000);
                wake=()=>{clearTimeout(timer);resolve();};
                if(closed) wake();
              });
            }
          } catch {
            // Event streams expose neither internal errors nor session details.
          } finally { close(); }
        })();
      },
      cancel(){ finish?.(); },
    });
    return new Response(stream,{headers:{
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-store',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no',
      'X-Content-Type-Options':'nosniff',
    }});
  } catch(error) {
    if(error instanceof AppError) return Response.json({error:{code:error.code,message:error.message}},{status:error.status,headers:{'Cache-Control':'no-store'}});
    return Response.json({error:{code:'UNAVAILABLE',message:'暂时无法连接，请稍后重试'}},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
