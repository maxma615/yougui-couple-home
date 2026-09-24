import {z} from 'zod';
import {AppError} from './errors';
import {parseLocalDate} from './local-date';

export const title=z.string().trim().min(1,'请填写标题').max(120,'标题不能超过120字');
export const longText=z.string().max(20000,'内容不能超过20000字').default('');
export const localDate=z.string().refine(value=>{try{parseLocalDate(value);return true;}catch{return false;}},'请选择有效日期');
export function parseFields<T>(schema:z.ZodType<T>,input:unknown):T{
  const result=schema.safeParse(input);
  if(result.success)return result.data;
  const fields:Record<string,string>={};
  for(const issue of result.error.issues)fields[issue.path.join('.')||'form']=issue.message;
  throw new AppError(422,'VALIDATION','请检查填写的内容',fields);
}
