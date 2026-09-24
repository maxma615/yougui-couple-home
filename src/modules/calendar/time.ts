import { parseLocalDate } from '../../lib/local-date';
import type { CalendarDay, CalendarValues } from './schema';

export const MIN_CALENDAR_YEAR=2;
export const MAX_CALENDAR_YEAR=9998;
export const MIN_CALENDAR_DATE='0002-01-01';
export const MAX_CALENDAR_DATE='9998-12-31';
const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function utcCalendarTime(date:string, hour=0, minute=0, second=0, milliseconds=0):number {
  parseLocalDate(date);
  const [year,month,day]=date.split('-').map(Number);
  const value=new Date(0);
  value.setUTCFullYear(year,month-1,day);
  value.setUTCHours(hour,minute,second,milliseconds);
  return value.getTime();
}

/** ISO input must identify an instant; offsetless browser-local parsing is forbidden. */
export function parseOffsetInstant(value:string):string {
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match) throw new Error('时间必须包含 Z 或明确的时区偏移');
  const [,date,h,m,s='0',fraction='',offset]=match;
  parseLocalDate(date);
  if(Number(h)>23 || Number(m)>59 || Number(s)>59) throw new Error('时间无效');
  let offsetMinutes=0;
  if(offset!=='Z') {
    const hours=Number(offset.slice(1,3)),minutes=Number(offset.slice(4,6));
    if(hours>23 || minutes>59) throw new Error('时区偏移无效');
    offsetMinutes=(hours*60+minutes)*(offset[0]==='-'?-1:1);
  }
  const stamp=utcCalendarTime(date,Number(h),Number(m),Number(s),Number(fraction.padEnd(3,'0')))-offsetMinutes*60_000;
  const result=new Date(stamp).toISOString();
  if(!/^\d{4}-/.test(result) || result.startsWith('0000-')) throw new Error('时间超出支持范围');
  return result;
}

function zonedParts(stamp:number):Record<string,string> {
  return Object.fromEntries(formatter.formatToParts(new Date(stamp)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}

function zonedLocal(stamp:number):string {
  const p=zonedParts(stamp);
  return `${p.year.padStart(4,'0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function shanghaiDateTimeInput(instant:string):string {
  return zonedLocal(Date.parse(parseOffsetInstant(instant))).slice(0,16);
}

export function shanghaiInputToInstant(local:string):string {
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if(!match || Number(match[2])>23 || Number(match[3])>59) throw new Error('请输入有效的上海日期和时间');
  if(match[1]<MIN_CALENDAR_DATE||match[1]>MAX_CALENDAR_DATE) throw new Error('日历日期需在0002年至9998年之间');
  const wall=utcCalendarTime(match[1],Number(match[2]),Number(match[3]));
  // Probe both sides of nearby transitions, then round-trip every offset.
  // This also handles historical second-based offsets without a fixed +08 assumption.
  const offsets=new Set<number>();
  for(let hours=-48;hours<=48;hours+=6) {
    const sample=wall+hours*3_600_000;
    const p=zonedParts(sample);
    offsets.add(utcCalendarTime(`${p.year.padStart(4,'0')}-${p.month}-${p.day}`,Number(p.hour),Number(p.minute),Number(p.second))-sample);
  }
  const matches=[...offsets].map(offset=>wall-offset).filter(stamp=>zonedLocal(stamp)===`${local}:00`);
  if(matches.length!==1) throw new Error(matches.length ? '该上海本地时间存在夏令时歧义，请选择其他时间' : '该上海本地时间不存在，请选择其他时间');
  return parseOffsetInstant(new Date(matches[0]).toISOString());
}

export function monthGrid(year:number,month:number):CalendarDay[] {
  if(!Number.isInteger(year)||year<MIN_CALENDAR_YEAR||year>MAX_CALENDAR_YEAR||!Number.isInteger(month)||month<1||month>12) throw new Error('月份无效（日历支持0002年至9998年）');
  const start=utcCalendarTime(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-01`);
  const monday=start-((new Date(start).getUTCDay()+6)%7)*DAY;
  return Array.from({length:42},(_,index)=>{
    const value=new Date(monday+index*DAY);
    return {date:value.toISOString().slice(0,10),inMonth:value.getUTCFullYear()===year&&value.getUTCMonth()+1===month};
  });
}

export function eventOccursOnDate(event:CalendarValues,date:string):boolean {
  parseLocalDate(date);
  if(event.allDay) return event.start<=date && event.end>=date;
  const start=Date.parse(parseOffsetInstant(event.start)),end=Date.parse(parseOffsetInstant(event.end));
  const first=zonedLocal(start).slice(0,10);
  const last=zonedLocal(end>start?end-1:end).slice(0,10);
  return first<=date && last>=date;
}
