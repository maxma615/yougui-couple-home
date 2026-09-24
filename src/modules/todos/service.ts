import {z} from 'zod';
import type {Pool} from 'pg';
import {createResourceService} from '../../lib/resource-service';
import {title,longText,localDate,parseFields} from '../../lib/validation';
import {AppError} from '../../lib/errors';

const input=z.object({title,description:longText,assigneeId:z.string().uuid('请选择小屋成员').nullable().default(null),dueDate:localDate.nullable().default(null),completed:z.boolean().default(false)});
export function createTodoService(target?:Pool){
  return createResourceService({
    table:'todos',type:'todo',columns:{title:'title',description:'description',assigneeId:'assignee_id',dueDate:'due_date',completed:'completed',completedAt:'completed_at'},
    dates:['dueDate'],orderBy:'completed ASC,due_date ASC NULLS LAST,created_at DESC,id DESC',
    parse:value=>parseFields(input,value),
    async validate(ctx,data,tx){
      if(data.assigneeId){
        const found=await tx.query('SELECT 1 FROM home_members WHERE home_id=$1 AND user_id=$2',[ctx.homeId,data.assigneeId]);
        if(!found.rowCount)throw new AppError(422,'INVALID_ASSIGNEE','负责人必须是当前小屋成员',{assigneeId:'请选择当前小屋成员或双方'});
      }
    },
    compute:(data,current)=>({completedAt:data.completed?(current?.completedAt??new Date().toISOString()):null}),
  },target);
}
export const todos=createTodoService();
