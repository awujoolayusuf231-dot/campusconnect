import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Copy, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { LoadingState } from "@/app/LoadingState";
import { ConfirmDialog } from "@/features/social/components/ConfirmDialog";
import { listCourses, type Course } from "@/features/past-questions/api";
import {
  addCalendarDays,
  deleteTimetableEvent,
  duplicateTimetableEvent,
  eventsForDate,
  findEventOverlaps,
  getTimetableEvent,
  getWeekDates,
  listTimetableEvents,
  localDateString,
  saveTimetableEvent,
  TIMETABLE_EVENT_TYPES,
  validateTimetableEvent,
  type TimetableEvent,
  type TimetableEventInput,
  type TimetableEventType,
} from "@/features/timetable/api";

const EVENT_QUERY = ["student-timetable"];
const EVENT_LABELS: Record<TimetableEventType, string> = {
  lecture: "Lecture",
  practical: "Practical",
  tutorial: "Tutorial",
  seminar: "Seminar",
  personal_study: "Personal study",
  group_study: "Group study",
  assignment_deadline: "Assignment deadline",
  examination: "Examination",
  other: "Other",
};
const COLOR_OPTIONS = [
  { value: "#c52b3a", label: "Berry" },
  { value: "#315f9e", label: "Blue" },
  { value: "#23856c", label: "Teal" },
  { value: "#9b6a1e", label: "Gold" },
  { value: "#7654a4", label: "Violet" },
];

function localToday() { return localDateString(new Date()); }

function displayDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function displayTime(value: string) {
  const [hourPart = "0", minutePart = "00"] = value.split(":");
  const hour = Number(hourPart);
  return `${hour % 12 || 12}:${minutePart} ${hour < 12 ? "AM" : "PM"}`;
}

function defaultEventInput(): TimetableEventInput {
  const today = localToday();
  return {
    course_id: null,
    title: "",
    event_type: "lecture",
    event_date: today,
    start_time: "09:00",
    end_time: "10:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    venue: "",
    instructor: "",
    notes: "",
    color: "#315f9e",
    recurrence: "once",
    repeat_until: null,
  };
}

export function TimetablePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const events = useQuery({ queryKey: EVENT_QUERY, queryFn: listTimetableEvents });
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [view, setView] = useState<"week" | "day">("week");
  const [filterType, setFilterType] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TimetableEvent | null>(null);
  const [message, setMessage] = useState("");
  const remove = useMutation({
    mutationFn: deleteTimetableEvent,
    onSuccess: async () => { setDeleteTarget(null); await queryClient.invalidateQueries({ queryKey: EVENT_QUERY }); },
    onError: (error: Error) => setMessage(error.message),
  });
  const duplicate = useMutation({
    mutationFn: duplicateTimetableEvent,
    onSuccess: async () => { setMessage("A one-time copy was added for next week."); await queryClient.invalidateQueries({ queryKey: EVENT_QUERY }); },
    onError: (error: Error) => setMessage(error.message),
  });
  const filtered = useMemo(() => (events.data ?? []).filter((event) => {
    const matchesType = filterType === "all" || event.event_type === filterType;
    const query = searchText.trim().toLowerCase();
    const matchesSearch = !query || [event.title, event.venue, event.instructor, event.course?.code, event.course?.title]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesType && matchesSearch;
  }), [events.data, filterType, searchText]);
  const week = getWeekDates(anchorDate);
  const visibleDates = view === "day" ? [localDateString(anchorDate)] : week;
  const today = localToday();
  const upcoming = useMemo(() => {
    const result: Array<{ event: TimetableEvent; date: string }> = [];
    for (let offset = 0; offset < 14 && result.length < 5; offset++) {
      const date = addCalendarDays(today, offset);
      for (const event of eventsForDate(filtered, date)) result.push({ event, date });
    }
    return result;
  }, [filtered, today]);

  if (events.isLoading) return <LoadingState label="Loading your timetable" variant="panel" />;
  if (events.isError) return <p role="alert" className="err">Could not load your timetable: {(events.error as Error).message}</p>;
  const shift = (delta: number) => {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() + delta * (view === "week" ? 7 : 1));
    setAnchorDate(next);
  };
  return <div className="space-y-5">
    <header className="rounded-3xl border border-[#eadbd8] bg-gradient-to-br from-white via-[#fff9f7] to-[#f8ecea] p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Your week, with room to focus</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">Timetable planner</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Plan classes, study sessions, deadlines, and exams. Events are private; each one keeps the timezone used when it was created.</p></div>
        <Link className="btn-primary inline-flex items-center gap-2" to="/app/timetable/new"><Plus size={16} />Add event</Link>
      </div>
    </header>
    {message && <p role="status" className="rounded-xl border border-success-border bg-success-soft px-3 py-2 text-sm text-success">{message}</p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(260px,0.8fr)]">
      <section className="card min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><button type="button" className="btn min-h-9 rounded-lg px-2" onClick={() => shift(-1)} aria-label="Previous period"><ArrowLeft size={15} /></button>
            <button type="button" className="btn min-h-9 rounded-lg px-3 text-xs" onClick={() => setAnchorDate(new Date())}>Today</button>
            <button type="button" className="btn min-h-9 rounded-lg px-2" onClick={() => shift(1)} aria-label="Next period"><ArrowRight size={15} /></button>
            <h2 className="ml-1 text-sm font-extrabold text-fg">{view === "day" ? displayDate(localDateString(anchorDate), { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${displayDate(week[0] ?? today, { month: "short", day: "numeric" })} – ${displayDate(week[6] ?? today, { month: "short", day: "numeric", year: "numeric" })}`}</h2>
          </div>
          <div className="flex items-center gap-2"><button type="button" className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "week" ? "bg-primary-tint text-primary" : "text-muted hover:bg-bg"}`} onClick={() => setView("week")}>Week</button>
            <button type="button" className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "day" ? "bg-primary-tint text-primary" : "text-muted hover:bg-bg"}`} onClick={() => setView("day")}>Day</button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
          {visibleDates.map((date) => {
            const dayEvents = eventsForDate(filtered, date);
            return <section key={date} className={`min-w-0 rounded-xl border p-2.5 ${date === today ? "border-primary/40 bg-primary-soft" : "border-line bg-white"}`}>
              <button type="button" className="mb-2 flex w-full items-center justify-between text-left" onClick={() => { const [year = 0, month = 1, day = 1] = date.split("-").map(Number); setAnchorDate(new Date(year, month - 1, day)); setView("day"); }}>
                <span className="text-xs font-extrabold text-fg">{displayDate(date)}</span>{date === today && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-white">Today</span>}
              </button>
              <div className="space-y-2">
                {dayEvents.map((event) => <TimetableEventCard key={`${date}:${event.id}`} event={event}
                  onDelete={() => setDeleteTarget(event)} onDuplicate={() => duplicate.mutate(event)} busy={duplicate.isPending || remove.isPending} />)}
                {!dayEvents.length && <button type="button" onClick={() => navigateToNew(date)} className="flex min-h-20 w-full items-center justify-center rounded-lg border border-dashed border-line text-[10px] text-muted hover:bg-bg">No events · add one</button>}
              </div>
            </section>;
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search events, courses, venues" /></label>
          <select className="field" aria-label="Filter by event type" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
            <option value="all">All event types</option>{TIMETABLE_EVENT_TYPES.map((type) => <option value={type} key={type}>{EVENT_LABELS[type]}</option>)}
          </select>
          <Link className="btn min-h-10 rounded-lg px-3 text-xs" to="/app/timetable/new">Add event</Link>
        </div>
        {!events.data?.length && <section className="mt-4 rounded-xl border border-dashed border-line bg-bg px-4 py-8 text-center">
          <CalendarDays className="mx-auto text-primary" size={25} /><h3 className="mt-3 font-extrabold text-fg">Your timetable is ready</h3>
          <p className="mt-1 text-sm text-muted">Add your first class, study block, or important date. It will only be visible to you.</p>
          <Link className="btn-primary mt-4 inline-flex" to="/app/timetable/new">Add first event</Link>
        </section>}
      </section>
      <aside className="space-y-4">
        <section className="card"><h2 className="font-extrabold text-fg">Coming up</h2><p className="mt-1 text-xs text-muted">Your next two weeks, including weekly repeats.</p>
          {upcoming.length ? <ul className="mt-3 space-y-3">{upcoming.map(({ event, date }) => <li key={`${event.id}-${date}`} className="border-t border-line pt-3 first:border-0 first:pt-0">
            <p className="text-[10px] font-bold text-primary">{displayDate(date, { weekday: "short", month: "short", day: "numeric" })}</p>
            <p className="mt-0.5 text-sm font-bold text-fg">{event.title}</p>
            <p className="mt-1 text-xs text-muted">{displayTime(event.start_time)}–{displayTime(event.end_time)} · {event.course?.code ?? EVENT_LABELS[event.event_type]}</p>
            {event.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && <p className="mt-0.5 truncate text-[10px] text-muted">{event.timezone}</p>}
          </li>)}</ul> : <p className="mt-3 text-sm text-muted">Nothing scheduled in the next two weeks.</p>}
        </section>
        <section className="rounded-2xl border border-[#eadbd8] bg-bg p-4">
          <h2 className="text-sm font-extrabold text-fg">Reminders</h2>
          <p className="mt-1 text-xs leading-5 text-muted">This planner currently saves and displays events; scheduled push reminders are not enabled because there is no trusted backend scheduler for them yet.</p>
        </section>
      </aside>
    </div>
    {deleteTarget && <ConfirmDialog title="Delete timetable event?" confirmLabel="Delete event" busy={remove.isPending}
      onCancel={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id)}>
      “{deleteTarget.title}” will be removed from your private timetable.
    </ConfirmDialog>}
  </div>;

  function navigateToNew(date: string) {
    navigate(`/app/timetable/new?date=${date}`);
  }
}

function TimetableEventCard({ event, onDelete, onDuplicate, busy }: {
  event: TimetableEvent; onDelete: () => void; onDuplicate: () => void; busy: boolean;
}) {
  return <article className="group rounded-lg border-l-[3px] bg-white p-2 shadow-sm" style={{ borderLeftColor: event.color }}>
    <Link to={`/app/timetable/${event.id}/edit`} className="block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <p className="text-[9px] font-bold text-muted">{displayTime(event.start_time)}–{displayTime(event.end_time)}</p>
      <h3 className="mt-0.5 break-words text-[11px] font-extrabold leading-4 text-fg">{event.title}</h3>
      {event.course?.code && <p className="mt-0.5 truncate text-[9px] text-muted">{event.course.code}</p>}
      {event.venue && <p className="mt-1 flex items-start gap-1 text-[9px] leading-3 text-muted"><MapPin size={10} className="mt-0.5 shrink-0" />{event.venue}</p>}
      {event.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && <p className="mt-1 truncate text-[9px] text-muted">{event.timezone}</p>}
      {event.recurrence === "weekly" && <p className="mt-1 text-[9px] font-semibold text-primary">Weekly</p>}
    </Link>
    <div className="mt-1 flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <button type="button" className="rounded p-1 text-muted hover:bg-bg hover:text-primary" disabled={busy} onClick={onDuplicate} aria-label={`Duplicate ${event.title}`}><Copy size={11} /></button>
      <Link to={`/app/timetable/${event.id}/edit`} className="rounded px-1.5 py-1 text-[9px] font-bold text-muted hover:bg-bg hover:text-primary">Edit</Link>
      <button type="button" className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" disabled={busy} onClick={onDelete} aria-label={`Delete ${event.title}`}><Trash2 size={11} /></button>
    </div>
  </article>;
}

export function TimetableEventEditorPage() {
  const { eventId } = useParams();
  const isNew = !eventId || eventId === "new";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const event = useQuery({ queryKey: ["student-timetable-event", eventId], queryFn: () => getTimetableEvent(eventId!), enabled: !isNew });
  const allEvents = useQuery({ queryKey: EVENT_QUERY, queryFn: listTimetableEvents });
  const courses = useQuery({ queryKey: ["academic-courses-for-timetable"], queryFn: () => listCourses() });
  const [input, setInput] = useState<TimetableEventInput>(defaultEventInput);
  const [initialized, setInitialized] = useState(false);
  const [overlaps, setOverlaps] = useState<TimetableEvent[]>([]);
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: () => saveTimetableEvent(input, isNew ? undefined : eventId),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: EVENT_QUERY });
      await queryClient.invalidateQueries({ queryKey: ["student-timetable-event", id] });
      navigate("/app/timetable");
    },
    onError: (error: Error) => setMessage(error.message),
  });
  useEffect(() => {
    if (initialized || (!isNew && event.isLoading)) return;
    if (!isNew && event.data) {
      const { id: _id, owner_id: _owner, created_at: _created, updated_at: _updated, course: _course, ...values } = event.data;
      setInput(values);
    } else if (isNew) {
      const date = new URLSearchParams(window.location.search).get("date");
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) setInput((current) => ({ ...current, event_date: date }));
    }
    setInitialized(true);
  }, [event.data, event.isLoading, initialized, isNew]);

  if (allEvents.isLoading || courses.isLoading || (!isNew && event.isLoading) || !initialized) return <LoadingState label="Preparing event editor" variant="panel" />;
  if (allEvents.isError || courses.isError || (!isNew && event.isError)) return <p role="alert" className="err">Could not load event details: {((allEvents.error ?? courses.error ?? event.error) as Error).message}</p>;
  if (!isNew && !event.data) return <section className="card"><h1 className="font-black text-fg">Event not found</h1><p className="mt-2 text-sm text-muted">This event may have been deleted, or it is not available to your account.</p><Link className="btn mt-4 inline-flex" to="/app/timetable">Back to timetable</Link></section>;
  const setField = <K extends keyof TimetableEventInput>(key: K, value: TimetableEventInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const submit = () => {
    const issue = validateTimetableEvent(input);
    if (issue) {
      setMessage(issue);
      setOverlaps([]);
      setConfirmOverlap(false);
      return;
    }
    setMessage("");
    const found = findEventOverlaps(input, allEvents.data ?? [], event.data?.id);
    setOverlaps(found);
    if (found.length) { setConfirmOverlap(true); return; }
    save.mutate();
  };
  return <div className="mx-auto max-w-3xl space-y-5">
    <header><Link to="/app/timetable" className="text-xs font-bold text-primary hover:underline">← Your timetable</Link>
      <h1 className="mt-2 text-2xl font-black text-fg">{isNew ? "Add timetable event" : "Edit timetable event"}</h1>
      <p className="mt-1 text-sm text-muted">Events are private to your account and shown in the saved timezone.</p></header>
    {message && <p role="alert" className="err">{message}</p>}
    <form className="card space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <TextInput label="Event title" value={input.title} maxLength={120} required onChange={(value) => setField("title", value)} placeholder="e.g. Data structures lecture" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Event type</span>
          <select className="field w-full" value={input.event_type} onChange={(event) => setField("event_type", event.target.value as TimetableEventType)}>
            {TIMETABLE_EVENT_TYPES.map((type) => <option value={type} key={type}>{EVENT_LABELS[type]}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Course (optional)</span>
          <select className="field w-full" value={input.course_id ?? ""} onChange={(event) => setField("course_id", event.target.value || null)}>
            <option value="">No course linked</option>{(courses.data ?? []).map((course: Course) => <option value={course.id} key={course.id}>{course.code} — {course.title}</option>)}
          </select>
        </label>
        <TextInput label="Date" type="date" value={input.event_date} required onChange={(value) => setField("event_date", value)} />
        <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Repeat</span>
          <select className="field w-full" value={input.recurrence} onChange={(event) => setInput((current) => ({
            ...current, recurrence: event.target.value as TimetableEventInput["recurrence"],
            repeat_until: event.target.value === "weekly" ? addCalendarDays(current.event_date, 90) : null,
          }))}>
            <option value="once">One time</option><option value="weekly">Every week</option>
          </select>
        </label>
        {input.recurrence === "weekly" && <TextInput label="Repeat until" type="date" value={input.repeat_until ?? input.event_date} min={input.event_date}
          required onChange={(value) => setField("repeat_until", value || null)} />}
        <TextInput label="Start time" type="time" value={input.start_time.slice(0, 5)} required onChange={(value) => setField("start_time", value)} />
        <TextInput label="End time" type="time" value={input.end_time.slice(0, 5)} required onChange={(value) => setField("end_time", value)} />
        <TextInput label="Venue (optional)" value={input.venue ?? ""} maxLength={200} onChange={(value) => setField("venue", value)} placeholder="Room or online meeting place" />
        <TextInput label="Instructor (optional)" value={input.instructor ?? ""} maxLength={120} onChange={(value) => setField("instructor", value)} />
      </div>
      <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>Notes</span><textarea className="field w-full" rows={4} maxLength={2000} value={input.notes ?? ""} onChange={(event) => setField("notes", event.target.value)} placeholder="Preparation, materials, or reminders for yourself." /></label>
      <fieldset><legend className="text-sm font-semibold text-fg">Calendar color</legend><div className="mt-2 flex flex-wrap gap-2">{COLOR_OPTIONS.map((color) => <button type="button" key={color.value} aria-label={color.label} aria-pressed={input.color === color.value}
        onClick={() => setField("color", color.value)} className={`h-8 w-8 rounded-full border-2 ${input.color === color.value ? "border-fg ring-2 ring-primary/30" : "border-white"}`} style={{ backgroundColor: color.value }} />)}</div></fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="flex items-center gap-2 text-xs text-muted"><Clock3 size={14} />{input.timezone}</p>
        <div className="flex gap-2"><Link className="btn" to="/app/timetable">Cancel</Link><button className="btn-primary" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save event"}</button></div>
      </div>
    </form>
    {confirmOverlap && <ConfirmDialog title="This event overlaps another" confirmLabel="Save anyway" danger={false} busy={save.isPending}
      onCancel={() => setConfirmOverlap(false)} onConfirm={() => { setConfirmOverlap(false); save.mutate(); }}>
      <span className="block">The following event(s) use the same time and timezone:</span>
      <ul className="mt-2 list-inside list-disc">{overlaps.map((item) => <li key={item.id}>{item.title} · {displayDate(item.event_date)} · {displayTime(item.start_time)}–{displayTime(item.end_time)}</li>)}</ul>
      <span className="mt-2 block">Events in different timezones are not compared. You can go back and change the time, or save this event anyway.</span>
    </ConfirmDialog>}
  </div>;
}

function TextInput({ label, value, onChange, type = "text", maxLength, placeholder, required, min }: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
  maxLength?: number; placeholder?: string; required?: boolean; min?: string;
}) {
  return <label className="block space-y-1.5 text-sm font-semibold text-fg"><span>{label}</span>
    <input className="field w-full" type={type} value={value} maxLength={maxLength} placeholder={placeholder} required={required} min={min} onChange={(event) => onChange(event.target.value)} /></label>;
}
