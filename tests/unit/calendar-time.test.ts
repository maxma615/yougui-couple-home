import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { parseOffsetInstant, shanghaiDateTimeInput, shanghaiInputToInstant, monthGrid, eventOccursOnDate } from '../../src/modules/calendar/time';
import { eventsForDate, upcomingEvents } from '../../src/modules/calendar/queries';
import type { CalendarEventDto } from '../../src/modules/calendar/schema';

const event = (id:string, allDay:boolean, start:string, end:string):CalendarEventDto => ({id,title:id,location:'',description:'',allDay,start,end,version:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',createdBy:'a',updatedBy:'a'});

describe('calendar time semantics',()=>{
  it('normalizes explicit offsets and preserves real DST interval order',()=>{
    expect(parseOffsetInstant('2026-11-01T01:30:00-04:00')).toBe('2026-11-01T05:30:00.000Z');
    expect(parseOffsetInstant('2026-11-01T01:15:00-05:00')).toBe('2026-11-01T06:15:00.000Z');
    expect(Date.parse(parseOffsetInstant('2026-03-08T03:15:00-04:00'))-Date.parse(parseOffsetInstant('2026-03-08T01:30:00-05:00'))).toBe(45*60_000);
  });
  it.each(['2026-02-30T10:00:00Z','2026-09-23T10:00','2026-09-23T24:00:00Z','2026-09-23T10:00:00+24:00','2026-09-23T10:00:60Z'])('rejects invalid or offsetless instant %s', value=>expect(()=>parseOffsetInstant(value)).toThrow());
  it('round trips Shanghai controls independently of browser local timezone',()=>{
    expect(shanghaiInputToInstant('2026-09-23T10:30')).toBe('2026-09-23T02:30:00.000Z');
    expect(shanghaiDateTimeInput('2026-09-23T02:30:00Z')).toBe('2026-09-23T10:30');
    expect(()=>shanghaiInputToInstant('1991-04-14T02:30')).toThrow();
    expect(()=>shanghaiInputToInstant('1991-09-15T01:30')).toThrow();
  });
  it('returns identical pure-date and instant results in UTC and Los Angeles processes',()=>{
    const script=`import {shanghaiInputToInstant,shanghaiDateTimeInput,eventOccursOnDate} from './src/modules/calendar/time.ts'; console.log(JSON.stringify([shanghaiInputToInstant('2026-09-23T00:30'),shanghaiDateTimeInput('2026-09-22T16:30:00Z'),eventOccursOnDate({allDay:false,start:'2026-09-22T16:30:00Z',end:'2026-09-22T17:30:00Z'},'2026-09-23')]));`;
    for(const TZ of ['UTC','America/Los_Angeles']) {
      const result=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,TZ},encoding:'utf8'});
      expect(JSON.parse(result)).toEqual(['2026-09-22T16:30:00.000Z','2026-09-23T00:30',true]);
    }
  });
  it('builds 42 Monday-first days and handles leap/month boundaries',()=>{
    const grid=monthGrid(2024,2);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({date:'2024-01-29',inMonth:false});
    expect(grid[31]).toEqual({date:'2024-02-29',inMonth:true});
    expect(grid[41]).toEqual({date:'2024-03-10',inMonth:false});
    expect(()=>monthGrid(2024,13)).toThrow();
  });
  it('rejects outermost years before generating invalid adjacent dates',()=>{
    expect(()=>monthGrid(1,1)).toThrow();
    expect(()=>monthGrid(9999,12)).toThrow();
    expect(monthGrid(2,1)[0].date).toBe('0001-12-31');
    expect(monthGrid(9998,12)[41].date).toMatch(/^9999-01-/);
    expect(eventOccursOnDate(event('ancient',false,'0002-01-02T00:00:00Z','0002-01-02T01:00:00Z'),'0002-01-02')).toBe(true);
  });
  it('includes all-day ends but excludes timed midnight ends, retaining point events',()=>{
    expect(eventOccursOnDate(event('a',true,'2024-02-29','2024-03-02'),'2024-03-02')).toBe(true);
    expect(eventOccursOnDate(event('a',true,'2024-02-29','2024-03-02'),'2024-03-03')).toBe(false);
    const timed=event('b',false,'2026-09-23T15:00:00Z','2026-09-23T16:00:00Z');
    expect(eventOccursOnDate(timed,'2026-09-23')).toBe(true);
    expect(eventOccursOnDate(timed,'2026-09-24')).toBe(false);
    expect(eventOccursOnDate(event('p',false,'2026-09-23T16:00:00Z','2026-09-23T16:00:00Z'),'2026-09-24')).toBe(true);
  });
  it('selects and stably orders day events and ongoing upcoming events',()=>{
    const items=[event('z',false,'2026-09-23T02:00:00Z','2026-09-23T04:00:00Z'),event('a',true,'2026-09-22','2026-09-23'),event('old',true,'2026-09-21','2026-09-21'),event('b',false,'2026-09-23T02:00:00Z','2026-09-23T04:00:00Z')];
    expect(eventsForDate(items,'2026-09-23').map(x=>x.id)).toEqual(['a','b','z']);
    expect(upcomingEvents(items,new Date('2026-09-23T03:00:00Z'),2).map(x=>x.id)).toEqual(['a','b']);
  });
});
