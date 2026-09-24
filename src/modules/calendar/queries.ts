import type { CalendarEventDto } from './schema';
import { shanghaiToday } from '../../lib/local-date';
import { eventOccursOnDate, shanghaiDateTimeInput } from './time';

function byStart(a:CalendarEventDto,b:CalendarEventDto):number {
  if(!a.allDay&&!b.allDay) return Date.parse(a.start)-Date.parse(b.start)||a.id.localeCompare(b.id);
  const key=(event:CalendarEventDto)=>event.allDay?`${event.start}T00:00`:shanghaiDateTimeInput(event.start);
  return key(a).localeCompare(key(b))||Number(b.allDay)-Number(a.allDay)||a.id.localeCompare(b.id);
}

export function eventsForDate(events:CalendarEventDto[],date:string):CalendarEventDto[] {
  return events.filter(event=>eventOccursOnDate(event,date)).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||byStart(a,b));
}

export function upcomingEvents(events:CalendarEventDto[],now:Date,limit=4):CalendarEventDto[] {
  const today=shanghaiToday(now);
  return events.filter(event=>event.allDay?event.end>=today:Date.parse(event.end)>now.getTime()||(event.start===event.end&&Date.parse(event.start)===now.getTime()))
    .sort(byStart).slice(0,Math.max(0,limit));
}
