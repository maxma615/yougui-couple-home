/** Public, browser-safe API types. Timed start/end responses are UTC ISO strings. */
export type CalendarValues = {
  title: string;
  location: string;
  description: string;
  allDay: boolean;
  start: string;
  end: string;
};

export type CalendarEventDto = CalendarValues & {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type CalendarDay = { date: string; inMonth: boolean };
