import type { Config } from "@netlify/functions";
import { activeRecipients, db, PACIFIC_TZ, twilioClient, twilioNumber } from "./_lib.mts";

// v1.1.0 — Fixed Pacific household reminder times; no 36-hour nudge.
// The 48-hour due timestamp stays unchanged for the app and ESP32.
type LocalDate = { year: number; month: number; day: number };
type Slot = { at: Date; name: string };

function pacificParts(date: Date): LocalDate & { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function localDay(date: Date): LocalDate {
  const { year, month, day } = pacificParts(date);
  return { year, month, day };
}

function dayOffset(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayNumber(date: LocalDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) / 86400000;
}

// Resolve wall-clock Pacific times, including both DST transitions.
function pacificInstant(day: LocalDate, hour: number, minute: number): Date {
  const expected = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  let timestamp = expected;
  for (let i = 0; i < 4; i++) {
    const p = pacificParts(new Date(timestamp));
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    timestamp += expected - represented;
  }
  return new Date(timestamp);
}

function currentSlot(now: Date, due: Date): Slot | null {
  const today = localDay(now);
  const dueDay = localDay(due);
  const offset = dayNumber(today) - dayNumber(dueDay);
  const possible: Slot[] = [];

  // One advance message: 9 PM on the calendar day before the 48-hour due date.
  if (offset === -1) {
    possible.push({ at: pacificInstant(today, 21, 0), name: "Tomorrow morning" });
  }
  // On the due date, and on each subsequent day until someone confirms cleaning.
  if (offset >= 0) {
    for (const [hour, minute] of [[7, 45], [8, 15], [9, 0], [18, 0], [19, 0], [20, 0]]) {
      possible.push({ at: pacificInstant(today, hour, minute), name: "Cleaning reminder" });
    }
  }

  // The scheduled function runs every 15 minutes; never make up missed reminders.
  return possible.find(s => now.getTime() >= s.at.getTime() && now.getTime() < s.at.getTime() + 15 * 60000) ?? null;
}

export default async () => {
  const now = new Date();
  const database = db();
  const rows = await database.sql`
    SELECT last_cleaned_at, next_due_at, last_reminder_at, waiting_for_reply
    FROM cat_box_state WHERE id = 1
  `;
  const state = rows[0] as {
    last_cleaned_at?: Date | string | null;
    next_due_at?: Date | string | null;
    last_reminder_at?: Date | string | null;
    waiting_for_reply?: boolean;
  } | undefined;
  if (!state?.last_cleaned_at || !state.next_due_at || state.waiting_for_reply) return;

  const due = new Date(state.next_due_at);
  const slot = currentSlot(now, due);
  if (!slot) return;

  // No more than two scheduled reminders in any rolling 60-minute window.
  // The exact configured slots are 30+ minutes apart.
  const last = state.last_reminder_at ? new Date(state.last_reminder_at) : null;
  if (last && (last >= slot.at || now.getTime() - last.getTime() < 30 * 60000)) return;

  const people = await activeRecipients();
  if (people.length === 0) return;

  // Atomic claim prevents parallel scheduled executions from duplicating a slot.
  const claimed = await database.sql`
    UPDATE cat_box_state
    SET waiting_for_reply = TRUE, last_reminder_at = ${now}, updated_at = NOW()
    WHERE id = 1 AND waiting_for_reply = FALSE
      AND next_due_at = ${due}
      AND (last_reminder_at IS NULL OR
           (last_reminder_at < ${slot.at} AND last_reminder_at <= ${new Date(now.getTime() - 30 * 60000)}))
    RETURNING id
  `;
  if (claimed.length === 0) return;

  try {
    const client = twilioClient();
    const from = twilioNumber();
    const body = slot.name === "Tomorrow morning"
      ? "Cat box reminder: cleaning is due tomorrow morning. Reply DONE after it has been cleaned."
      : "Cat box reminder: please clean the cat box. Reply DONE after it has been cleaned.";
    for (const to of people) {
      // A cleaning confirmation arriving during delivery cancels remaining sends.
      const fresh = await database.sql`SELECT next_due_at FROM cat_box_state WHERE id = 1`;
      if (!fresh[0] || new Date(fresh[0].next_due_at as string).getTime() !== due.getTime()) break;
      const msg = await client.messages.create({ from, to, body });
      await database.sql`INSERT INTO reminder_events (sent_at, recipient, twilio_sid) VALUES (${now}, ${to}, ${msg.sid})`;
    }
  } catch (err) {
    // Do not retry between fixed slots: a failed delivery must not cause bursts.
    console.error("check-reminders: scheduled SMS send failed", err);
    throw err;
  } finally {
    await database.sql`
      UPDATE cat_box_state SET waiting_for_reply = FALSE, updated_at = NOW()
      WHERE id = 1 AND next_due_at = ${due} AND last_reminder_at = ${now}
    `;
  }
};

export const config: Config = { schedule: "*/15 * * * *" };
