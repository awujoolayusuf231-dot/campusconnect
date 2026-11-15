import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  eventsForDate,
  findEventOverlaps,
  getWeekDates,
  occursOnDate,
  validateTimetableEvent,
  type TimetableEvent,
  type TimetableEventInput,
} from "@/features/timetable/api";

const event: TimetableEventInput = {
  course_id: null,
  title: "Lecture",
  event_type: "lecture",
  event_date: "2026-03-02",
  start_time: "09:00",
  end_time: "10:00",
  timezone: "Africa/Lagos",
  venue: null,
  instructor: null,
  notes: null,
  color: "#315f9e",
  recurrence: "weekly",
  repeat_until: "2026-04-30",
};

const savedEvent: TimetableEvent = {
  ...event, id: "lecture-1", owner_id: "student-1", created_at: "", updated_at: "",
};

describe("timetable date and recurrence rules", () => {
  it("calculates Monday-based weeks and dates without local timezone shifts", () => {
    expect(getWeekDates(new Date(2026, 2, 4))).toEqual([
      "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08",
    ]);
    expect(addCalendarDays("2026-03-02", 7)).toBe("2026-03-09");
  });

  it("includes weekly occurrences only through their configured end date", () => {
    expect(occursOnDate(event, "2026-03-09")).toBe(true);
    expect(occursOnDate(event, "2026-03-10")).toBe(false);
    expect(occursOnDate(event, "2026-05-04")).toBe(false);
    expect(eventsForDate([savedEvent], "2026-03-09")).toEqual([savedEvent]);
  });

  it("detects repeating and one-off overlaps without flagging adjacent times or different timezones", () => {
    expect(findEventOverlaps({ ...event, event_date: "2026-03-09" }, [savedEvent])).toHaveLength(1);
    expect(findEventOverlaps({ ...event, start_time: "10:00", end_time: "11:00" }, [savedEvent])).toHaveLength(0);
    expect(findEventOverlaps({ ...event, timezone: "UTC" }, [savedEvent])).toHaveLength(0);
    expect(findEventOverlaps({ ...event, recurrence: "once", repeat_until: null, event_date: "2026-03-16" }, [savedEvent])).toHaveLength(1);
  });

  it("rejects invalid time ranges and weekly recurrence ends", () => {
    expect(validateTimetableEvent({ ...event, end_time: "09:00" })).toContain("end time");
    expect(validateTimetableEvent({ ...event, event_date: "2026-02-30" })).toContain("event date");
    expect(validateTimetableEvent({ ...event, start_time: "99:90" })).toContain("end time");
    expect(validateTimetableEvent({ ...event, repeat_until: "2026-03-01" })).toContain("end date");
    expect(validateTimetableEvent({ ...event, recurrence: "once", repeat_until: null })).toBeNull();
  });
});
