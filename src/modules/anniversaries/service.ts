import {z} from 'zod';
import type {Pool} from 'pg';
import {createResourceService} from '../../lib/resource-service';
import {title,longText,localDate,parseFields} from '../../lib/validation';

const input=z.object({title,date:localDate,note:longText,yearly:z.boolean().default(true)});
export function createAnniversaryService(target?:Pool){
  return createResourceService({table:'anniversaries',type:'anniversary',columns:{title:'title',date:'date',note:'note',yearly:'yearly'},dates:['date'],orderBy:'date ASC,id ASC',parse:value=>parseFields(input,value)},target);
}
export const anniversaries=createAnniversaryService();
