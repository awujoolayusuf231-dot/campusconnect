import { supabase } from "@/lib/supabase";

export const TIMETABLE_EVENT_TYPES = [
  "lecture", "practical", "tutorial", "seminar", "personal_study", "group_study",
  "assignment_deadline", "examination", "other",
] as const;
export type TimetableEventType = typeof TIMETABLE_EVENT_TYPES[number];
export type TimetableEvent = {
  id: string;
  owner_id: string;
  course_id: string | null;
  title: string;
  event_type: TimetableEventType;
  event_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  venue: string | null;
  instructor: string | null;
  notes: string | null;
  color: string;
  recurrence: "once" | "weekly";
  repeat_until: string | null;
  created_at: string;
  updated_at: string;
  course?: { id: string; code: string; title: string } | null;
};
export type TimetableEventInput = Omit<TimetableEvent,
  "id" | "owner_id" | "created_at" | "updated_at" | "course"
>;

const EVENT_SELECT =
  "*, course:academic_courses!student_timetable_events_course_id_fkey(id,code,title)";

export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addCalendarDays(value: string, days: number): string {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekday(value: string): number {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getWeekDates(date: Date): string[] {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(local);
    day.setDate(local.getDate() + index);
    return localDateString(day);
  });
}

export function occursOnDate(event: TimetableEventInput | TimetableEvent, date: string): boolean {
  if (date < event.event_date) return false;
  if (event.recurrence === "once") return date === event.event_date;
  return !!event.repeat_until && date <= event.repeat_until && weekday(date) === weekday(event.event_date);
}

export function eventsForDate(events: TimetableEvent[], date: string): TimetableEvent[] {
  return events.filter((event) => occursOnDate(event, date))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

function eventEndsOn(event: TimetableEventInput): string {
  return event.recurrence === "weekly" ? event.repeat_until ?? event.event_date : event.event_date;
}

function intervalsOverlap(first: TimetableEventInput, second: TimetableEventInput): boolean {
  return first.start_time < second.end_time && second.start_time < first.end_time;
}

function firstMatchingWeekday(date: string, day: number): string {
  return addCalendarDays(date, (day - weekday(date) + 7) % 7);
}

function eventsOverlap(first: TimetableEventInput, second: TimetableEventInput): boolean {
  if (first.timezone !== second.timezone || !intervalsOverlap(first, second)) return false;
  if (first.recurrence === "once" && second.recurrence === "once") {
    return first.event_date === second.event_date;
  }
  if (first.recurrence === "once") return occursOnDate(second, first.event_date);
  if (second.recurrence === "once") return occursOnDate(first, second.event_date);
  if (weekday(first.event_date) !== weekday(second.event_date)) return false;
  const start = first.event_date > second.event_date ? first.event_date : second.event_date;
  const overlapStart = firstMatchingWeekday(start, weekday(first.event_date));
  const end = eventEndsOn(first) < eventEndsOn(second) ? eventEndsOn(first) : eventEndsOn(second);
  return overlapStart <= end;
}

export function findEventOverlaps(
  candidate: TimetableEventInput,
  events: TimetableEvent[],
  ignoreEventId?: string,
): TimetableEvent[] {
  return events.filter((event) => event.id !== ignoreEventId && eventsOverlap(candidate, event));
}

export function validateTimetableEvent(input: TimetableEventInput): string | null {
  if (!input.title.trim() || input.title.trim().length > 120) return "Enter an event title of up to 120 characters.";
  if (!TIMETABLE_EVENT_TYPES.includes(input.event_type)) return "Choose a valid event type.";
  if (!isCalendarDate(input.event_date)) return "Choose a valid event date.";
  const startSeconds = timeInSeconds(input.start_time);
  const endSeconds = timeInSeconds(input.end_time);
  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) return "The end time must be after the start time.";
  if (input.timezone.length < 1 || input.timezone.length > 64) return "Choose a valid timezone.";
  if (input.venue && input.venue.length > 200) return "Venue must be 200 characters or fewer.";
  if (input.instructor && input.instructor.length > 120) return "Instructor must be 120 characters or fewer.";
  if (input.notes && input.notes.length > 2000) return "Notes must be 2,000 characters or fewer.";
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) return "Choose a valid event color.";
  if (input.recurrence === "weekly" && (!input.repeat_until || input.repeat_until < input.event_date)) {
    return "Choose an end date on or after the first event.";
  }
  if (input.recurrence === "once" && input.repeat_until) return "One-time events cannot have a repeat end date.";
  return null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function timeInSeconds(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 3600 + minute * 60 + second;
}

export async function listTimetableEvents(): Promise<TimetableEvent[]> {
  const { data, error } = await supabase.from("student_timetable_events")
    .select(EVENT_SELECT).order("event_date").order("start_time");
  if (error) throw error;
  return (data ?? []) as TimetableEvent[];
}

export async function getTimetableEvent(id: string): Promise<TimetableEvent | null> {
  const { data, error } = await supabase.from("student_timetable_events")
    .select(EVENT_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as TimetableEvent | null;
}

export async function saveTimetableEvent(input: TimetableEventInput, id?: string): Promise<string> {
  const issue = validateTimetableEvent(input);
  if (issue) throw new Error(issue);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Sign in to save timetable events.");
  const payload = {
    ...input,
    title: input.title.trim(),
    venue: input.venue?.trim() || null,
    instructor: input.instructor?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  if (id) {
    const { data, error } = await supabase.from("student_timetable_events")
      .update(payload).eq("id", id).select("id").single();
    if (error) throw error;
    return data.id as string;
  }
  const { data, error } = await supabase.from("student_timetable_events")
    .insert({ ...payload, owner_id: userData.user.id }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function duplicateTimetableEvent(event: TimetableEvent): Promise<string> {
  const duplicate: TimetableEventInput = {
    course_id: event.course_id,
    title: `${event.title} (copy)`.slice(0, 120),
    event_type: event.event_type,
    event_date: addCalendarDays(event.event_date, 7),
    start_time: event.start_time,
    end_time: event.end_time,
    timezone: event.timezone,
    venue: event.venue,
    instructor: event.instructor,
    notes: event.notes,
    color: event.color,
    recurrence: "once",
    repeat_until: null,
  };
  return saveTimetableEvent(duplicate);
}

export async function deleteTimetableEvent(id: string): Promise<void> {
  const { data, error } = await supabase.from("student_timetable_events")
    .delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("event_not_found");
}
