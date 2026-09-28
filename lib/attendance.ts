import { createEvent, getEventByCode } from "./events";
import { parseQRPayload } from "./qr";
import { supabase } from "./supabase";

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventCode: string;
  scannedAt: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  attendees: Array<{ studentId: string; scannedAt: string }>;
};

export type TeacherEventSummary = {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  attendeeCount: number;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string,
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);

  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  const payload = parsed.payload;
  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: "Event has not started yet." };
  }

  if (end && now > end) {
    return { success: false, message: "Event has already ended." };
  }

  let event = await getEventByCode(payload.event);

  if (!event) {
    const createError = await createEvent({
      eventId: payload.event,
      title: payload.title ?? payload.event,
      start: payload.start ?? new Date().toISOString(),
      end: payload.end ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    if (createError.error) {
      return { success: false, message: createError.error };
    }

    event = await getEventByCode(payload.event);
    if (!event) {
      return { success: false, message: "Unable to resolve event." };
    }
  }

  try {
    const { error } = await supabase.from("attendance").insert({
      student_id: studentId,
      event_id: event.id,
      scanned_at: new Date().toISOString(),
    });

    if (error) {
      const message = error.message ?? "Unable to record attendance.";
      if (
        error.code === "23505" ||
        message.toLowerCase().includes("duplicate")
      ) {
        return {
          success: false,
          message: "Already registered for this event.",
          eventTitle: event.title,
        };
      }
      return { success: false, message, eventTitle: event.title };
    }

    return {
      success: true,
      message: "Attendance recorded!",
      eventTitle: event.title,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message ?? "Unable to record attendance.",
    };
  }
}

export async function getAttendanceHistory(
  studentId: string,
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("id, scanned_at, event_id, events!inner(event_code, title)")
    .eq("student_id", studentId)
    .order("scanned_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((row) => {
    const event = row.events ?? {};
    return {
      id: row.id,
      eventId: event.event_code ?? row.event_id,
      eventTitle: event.title ?? "Unknown event",
      eventCode: event.event_code ?? row.event_id,
      scannedAt: row.scanned_at,
    };
  });
}

export async function getTeacherEventAttendance(
  teacherId: string,
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", teacherId)
    .order("created_at", { ascending: false });

  if (eventError || !events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.id);
  const { data: attendanceRows, error: attError } = await supabase
    .from("attendance")
    .select("student_id, scanned_at, event_id")
    .in("event_id", eventIds);

  if (attError || !attendanceRows) {
    return events.map((event) => ({
      eventId: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: 0,
      attendees: [],
    }));
  }

  const rowsByEvent = new Map<
    string,
    Array<{ studentId: string; scannedAt: string }>
  >();

  for (const row of attendanceRows as any[]) {
    const bucket = rowsByEvent.get(row.event_id) ?? [];
    bucket.push({
      studentId: row.student_id,
      scannedAt: row.scanned_at,
    });
    rowsByEvent.set(row.event_id, bucket);
  }

  return events.map((event) => {
    const attendees = rowsByEvent.get(event.id) ?? [];
    return {
      eventId: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: attendees.length,
      attendees,
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string,
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from("events")
    .select("id, event_code, title, start_time, end_time")
    .eq("created_by", teacherId)
    .order("created_at", { ascending: false });

  if (eventError || !events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.id);
  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("event_id")
    .in("event_id", eventIds);

  const counts: Record<string, number> = {};
  for (const row of (attendanceRows ?? []) as any[]) {
    const id = row.event_id;
    counts[id] = (counts[id] ?? 0) + 1;
  }

  return events.map((event) => ({
    eventId: event.event_code,
    title: event.title,
    startTime: event.start_time,
    endTime: event.end_time,
    attendeeCount: counts[event.id] ?? 0,
  }));
}
