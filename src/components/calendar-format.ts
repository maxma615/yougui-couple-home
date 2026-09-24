import type { CalendarEventDto } from "@/modules/calendar/schema";
import { shanghaiDateTimeInput } from "@/modules/calendar/time";

function chineseDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function calendarRangeLabel(event: Pick<CalendarEventDto, "allDay" | "start" | "end">): string {
  if (event.allDay) return event.start === event.end ? event.start : `${event.start} 至 ${event.end}`;
  const start = shanghaiDateTimeInput(event.start);
  const end = shanghaiDateTimeInput(event.end);
  const [startDate, startTime] = start.split("T");
  const [endDate, endTime] = end.split("T");
  return startDate === endDate
    ? `${chineseDate(startDate)} ${startTime} 至 ${endTime}`
    : `${chineseDate(startDate)} ${startTime} 至 ${chineseDate(endDate)} ${endTime}`;
}

export function compactCalendarLabel(event: Pick<CalendarEventDto, "allDay" | "start" | "end">): string {
  if (event.allDay) return event.start === event.end ? event.start : `${event.start} 至 ${event.end}`;
  return calendarRangeLabel(event);
}
